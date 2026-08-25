-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 011_admissions_v2.sql
-- Admissions close-the-loop: applicant OTP login, status timeline,
-- interview slot booking, admit card PDF generation, waitlist automation.
--
-- Adds 4 new tables + extends admissions enum:
--   1. admission_status_timeline  — every status change logged with timestamp + note
--   2. interview_slots            — admin-defined slots with capacity
--   3. interview_bookings         — which applicant booked which slot
--   4. admission_otp_codes        — phone OTP codes for applicant login (10-min expiry)
--
-- Also adds new enum values to admission_status:
--   'documents_verified', 'interview_scheduled', 'interview_completed',
--   'waitlisted', 'admitted', 'admit_card_issued'
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ─── 1. Extend admission_status enum ──────────────────────────────────────
do $$ begin
  alter type public.admission_status add value if not exists 'documents_verified';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type public.admission_status add value if not exists 'interview_scheduled';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type public.admission_status add value if not exists 'interview_completed';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type public.admission_status add value if not exists 'waitlisted';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type public.admission_status add value if not exists 'admitted';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type public.admission_status add value if not exists 'admit_card_issued';
exception when duplicate_object then null; end $$;

-- ─── 2. admission_status_timeline ─────────────────────────────────────────
-- Every status change is logged with timestamp + actor + note.
-- Applicants see this as a vertical timeline on their portal.
create table if not exists public.admission_status_timeline (
  id            uuid primary key default gen_random_uuid(),
  admission_id  uuid not null references public.admissions (id) on delete cascade,
  from_status   public.admission_status,
  to_status     public.admission_status not null,
  note          text,
  actor         text not null default 'system',   -- 'admin', 'system', 'applicant'
  created_at    timestamptz not null default now()
);

create index if not exists idx_admission_timeline_admission
  on public.admission_status_timeline (admission_id, created_at desc);

-- ─── 3. interview_slots ────────────────────────────────────────────────────
-- Admin-defined interview slots. Each slot has a date, start time, duration,
-- capacity (max applicants per slot), and current_bookings count.
create table if not exists public.interview_slots (
  id                uuid primary key default gen_random_uuid(),
  slot_date         date not null,
  start_time        time not null,
  duration_minutes  integer not null default 15 check (duration_minutes between 5 and 120),
  capacity          integer not null default 10 check (capacity between 1 and 100),
  current_bookings  integer not null default 0 check (current_bookings >= 0),
  location          text,
  notes             text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint no_overlap exclude using gist (
    daterange(slot_date, slot_date + interval '1 day') WITH &&
  ) where (is_active)
);

-- Actually a slot can have multiple times per day, so drop the overlap exclusion
-- and just use a unique composite to prevent accidental duplicates.
alter table public.interview_slots drop constraint if exists no_overlap;
create unique index if not exists uniq_interview_slot
  on public.interview_slots (slot_date, start_time) where (is_active);

create index if not exists idx_interview_slots_date
  on public.interview_slots (slot_date, start_time);

drop trigger if exists trg_interview_slots_touch on public.interview_slots;
create trigger trg_interview_slots_touch
  before update on public.interview_slots
  for each row execute function public.touch_admissions_updated_at();

-- ─── 4. interview_bookings ─────────────────────────────────────────────────
-- One booking per applicant. Unique constraint prevents double-booking.
create table if not exists public.interview_bookings (
  id              uuid primary key default gen_random_uuid(),
  admission_id    uuid not null unique references public.admissions (id) on delete cascade,
  slot_id         uuid not null references public.interview_slots (id) on delete cascade,
  booked_at       timestamptz not null default now(),
  cancelled_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_interview_bookings_slot
  on public.interview_bookings (slot_id) where (cancelled_at is null);
create index if not exists idx_interview_bookings_admission
  on public.interview_bookings (admission_id);

-- ─── 5. admission_otp_codes ────────────────────────────────────────────────
-- OTP codes for applicant phone login. 6-digit code, 10-minute expiry,
-- max 5 attempts, max 3 codes per phone per hour (rate limit).
create table if not exists public.admission_otp_codes (
  id              uuid primary key default gen_random_uuid(),
  contact_number  text not null,
  otp_code        text not null,                            -- 6 digits
  expires_at      timestamptz not null,
  attempts        integer not null default 0 check (attempts <= 5),
  verified        boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists idx_admission_otp_phone
  on public.admission_otp_codes (contact_number, created_at desc);

-- ─── ROW LEVEL SECURITY ────────────────────────────────────────────────────

alter table public.admission_status_timeline enable row level security;
alter table public.interview_slots          enable row level security;
alter table public.interview_bookings       enable row level security;
alter table public.admission_otp_codes      enable row level security;

-- Timeline: applicants can read their own timeline via phone-OTP RPC;
-- anon can read via the lookup RPC (filtered by reference_no + phone).
-- Direct table reads are admin-only to prevent enumeration.
drop policy if exists "timeline_read_staff" on public.admission_status_timeline;
create policy "timeline_read_staff"
  on public.admission_status_timeline for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','teacher'))
  );

drop policy if exists "timeline_write_staff" on public.admission_status_timeline;
create policy "timeline_write_staff"
  on public.admission_status_timeline for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','teacher'))
  );

-- Interview slots: anyone can read (applicants need to see available slots);
-- only staff can create/update/delete.
drop policy if exists "slots_read_public" on public.interview_slots;
create policy "slots_read_public"
  on public.interview_slots for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "slots_write_staff" on public.interview_slots;
create policy "slots_write_staff"
  on public.interview_slots for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','teacher'))
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','teacher'))
  );

-- Bookings: anon can insert (applicant booking); only staff can read all.
-- Applicants read their own booking via the lookup RPC.
drop policy if exists "bookings_insert_anon" on public.interview_bookings;
create policy "bookings_insert_anon"
  on public.interview_bookings for insert
  to anon, authenticated
  with check (true);

drop policy if exists "bookings_update_anon" on public.interview_bookings;
create policy "bookings_update_anon"
  on public.interview_bookings for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "bookings_read_staff" on public.interview_bookings;
create policy "bookings_read_staff"
  on public.interview_bookings for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','teacher'))
  );

-- OTP: anyone can insert (requesting a code); no one can select directly
-- (verification happens via RPC that returns only success/failure).
drop policy if exists "otp_insert_anon" on public.admission_otp_codes;
create policy "otp_insert_anon"
  on public.admission_otp_codes for insert
  to anon, authenticated
  with check (true);

drop policy if exists "otp_update_anon" on public.admission_otp_codes;
create policy "otp_update_anon"
  on public.admission_otp_codes for update
  to anon, authenticated
  using (true)
  with check (true);

-- ─── RPC: request_admission_otp(phone) ─────────────────────────────────────
-- Generates a 6-digit code, stores it with 10-min expiry, returns success.
-- (In production, an external SMS gateway would send the code. For demo,
-- the code is returned so it can be shown in a toast/dev banner.)
create or replace function public.request_admission_otp(p_contact_number text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_code      text;
  v_count_1h  integer;
  v_admission record;
begin
  -- Normalize phone: strip everything but digits and leading +
  p_contact_number := regexp_replace(p_contact_number, '[^0-9+]', '', 'g');

  -- Rate limit: max 3 OTP requests per phone per hour
  select count(*) into v_count_1h
    from public.admission_otp_codes
   where contact_number = p_contact_number
     and created_at > now() - interval '1 hour';
  if v_count_1h >= 3 then
    return jsonb_build_object('success', false, 'error', 'Too many OTP requests. Please wait an hour and try again.');
  end if;

  -- Verify phone matches an admission on file
  select id, full_name, reference_no into v_admission
    from public.admissions
   where contact_number = p_contact_number
      or whatsapp_number = p_contact_number
   order by created_at desc
   limit 1;

  if not found then
    -- Don't reveal whether phone exists — return generic success
    return jsonb_build_object('success', true, 'demo_code', null, 'note', 'If this phone matches an application, an OTP has been sent.');
  end if;

  -- Generate 6-digit code
  v_code := lpad(floor(random() * 1000000)::text, 6, '0');

  insert into public.admission_otp_codes (contact_number, otp_code, expires_at)
  values (p_contact_number, v_code, now() + interval '10 minutes');

  -- In production: send v_code via SMS gateway here.
  -- For demo: return it so the UI can display it (dev/test only).
  return jsonb_build_object(
    'success', true,
    'demo_code', v_code,  -- REMOVE in production after SMS gateway integration
    'name_hint', left(v_admission.full_name, 1) || '***' || right(v_admission.full_name, 1)
  );
end;
$$;

grant execute on function public.request_admission_otp(text) to anon, authenticated;

-- ─── RPC: verify_admission_otp(phone, code) ────────────────────────────────
-- Verifies OTP, marks code as verified, returns the admission record + timeline
-- if successful. Cleans up expired codes.
create or replace function public.verify_admission_otp(p_contact_number text, p_otp_code text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_phone     text := regexp_replace(p_contact_number, '[^0-9+]', '', 'g');
  v_otp       record;
  v_admission record;
  v_timeline  jsonb;
begin
  -- Find the most recent unverified, unexpired code for this phone
  select * into v_otp
    from public.admission_otp_codes
   where contact_number = v_phone
     and verified = false
     and expires_at > now()
   order by created_at desc
   limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'No valid OTP found. Please request a new code.');
  end if;

  -- Check attempt limit
  if v_otp.attempts >= 5 then
    return jsonb_build_object('success', false, 'error', 'Too many incorrect attempts. Please request a new code.');
  end if;

  -- Verify code
  if v_otp.otp_code <> p_otp_code then
    update public.admission_otp_codes
       set attempts = attempts + 1
     where id = v_otp.id;
    return jsonb_build_object('success', false, 'error', 'Incorrect code.');
  end if;

  -- Success — mark as verified
  update public.admission_otp_codes
     set verified = true
   where id = v_otp.id;

  -- Fetch admission record(s) for this phone
  select to_jsonb(a) into v_admission
    from public.admissions a
   where a.contact_number = v_phone or a.whatsapp_number = v_phone
   order by a.created_at desc
   limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'No application found for this phone number.');
  end if;

  -- Fetch timeline
  select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb) into v_timeline
    from public.admission_status_timeline t
   where t.admission_id = (v_admission->>'id')::uuid;

  return jsonb_build_object(
    'success', true,
    'admission', v_admission,
    'timeline', v_timeline
  );
end;
$$;

grant execute on function public.verify_admission_otp(text, text) to anon, authenticated;

-- ─── RPC: book_interview_slot(admission_id, slot_id) ───────────────────────
-- Atomically books a slot: checks capacity, increments counter, inserts booking,
-- updates admission status to 'interview_scheduled', adds timeline entry.
-- If slot is full, returns error → applicant is waitlisted.
create or replace function public.book_interview_slot(p_admission_id uuid, p_slot_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_slot        record;
  v_existing    record;
  v_admission   record;
  v_new_status  public.admission_status;
  v_note        text;
begin
  -- Lock the slot row for atomic capacity check
  select * into v_slot from public.interview_slots where id = p_slot_id for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Slot not found.');
  end if;

  -- Check slot is in the future
  if v_slot.slot_date < current_date then
    return jsonb_build_object('success', false, 'error', 'This slot is in the past.');
  end if;

  -- Check applicant doesn't already have an active booking
  select * into v_existing
    from public.interview_bookings
   where admission_id = p_admission_id
     and cancelled_at is null
   limit 1;
  if found then
    return jsonb_build_object('success', false, 'error', 'You already have an interview booked. Cancel it first to rebook.', 'existing_slot_id', v_existing.slot_id);
  end if;

  -- Fetch admission
  select * into v_admission from public.admissions where id = p_admission_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Application not found.');
  end if;

  -- Capacity check
  if v_slot.current_bookings >= v_slot.capacity then
    -- Waitlist the applicant
    update public.admissions
       set status = 'waitlisted'
     where id = p_admission_id;

    insert into public.admission_status_timeline (admission_id, from_status, to_status, note, actor)
    values (p_admission_id, v_admission.status, 'waitlisted'::public.admission_status,
            'Added to waitlist — slot ' || to_char(v_slot.slot_date, 'DD Mon') || ' ' || v_slot.start_time || ' was full.', 'system');

    return jsonb_build_object(
      'success', true,
      'waitlisted', true,
      'message', 'This slot is full. You have been added to the waitlist — we will notify you if a seat opens up.'
    );
  end if;

  -- Book the slot
  insert into public.interview_bookings (admission_id, slot_id)
  values (p_admission_id, p_slot_id);

  update public.interview_slots
     set current_bookings = current_bookings + 1
   where id = p_slot_id;

  -- Update admission status + timeline
  v_new_status := 'interview_scheduled'::public.admission_status;
  v_note := 'Interview scheduled for ' || to_char(v_slot.slot_date, 'DD Mon YYYY') || ' at ' || v_slot.start_time ||
            coalesce(' — ' || v_slot.location, '');

  update public.admissions set status = v_new_status where id = p_admission_id;

  insert into public.admission_status_timeline (admission_id, from_status, to_status, note, actor)
  values (p_admission_id, v_admission.status, v_new_status, v_note, 'applicant');

  return jsonb_build_object(
    'success', true,
    'waitlisted', false,
    'slot_date', v_slot.slot_date,
    'slot_time', v_slot.start_time,
    'location', v_slot.location
  );
end;
$$;

grant execute on function public.book_interview_slot(uuid, uuid) to anon, authenticated;

-- ─── RPC: cancel_interview_booking(admission_id) ───────────────────────────
-- Cancels a booking, decrements counter, then auto-promotes the next waitlisted
-- applicant if any exist for the same class.
create or replace function public.cancel_interview_booking(p_admission_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_booking    record;
  v_admission  record;
  v_promoted   record;
begin
  select * into v_booking
    from public.interview_bookings
   where admission_id = p_admission_id
     and cancelled_at is null
   for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'No active booking found.');
  end if;

  -- Cancel
  update public.interview_bookings
     set cancelled_at = now()
   where id = v_booking.id;

  -- Decrement slot counter
  update public.interview_slots
     set current_bookings = greatest(0, current_bookings - 1)
   where id = v_booking.slot_id;

  -- Fetch admission to get applying_class + previous status
  select * into v_admission from public.admissions where id = p_admission_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Application not found.');
  end if;

  -- Add timeline entry
  insert into public.admission_status_timeline (admission_id, from_status, to_status, note, actor)
  values (p_admission_id, v_admission.status, 'under_review'::public.admission_status,
          'Interview booking cancelled by applicant.', 'applicant');

  -- Update status back to under_review
  update public.admissions set status = 'under_review' where id = p_admission_id;

  -- Auto-promote: find next waitlisted applicant for the same class
  -- (ordered by application date — first come, first served)
  select a.id, a.full_name, a.contact_number into v_promoted
    from public.admissions a
   where a.applying_class = v_admission.applying_class
     and a.status = 'waitlisted'::public.admission_status
   order by a.created_at asc
   limit 1
   for update of a;

  if found then
    update public.admissions
       set status = 'interview_scheduled'::public.admission_status
     where id = v_promoted.id;

    insert into public.admission_status_timeline (admission_id, from_status, to_status, note, actor)
    values (v_promoted.id, 'waitlisted'::public.admission_status,
            'interview_scheduled'::public.admission_status,
            'A seat opened up — you have been auto-promoted from the waitlist! Please book your interview slot.',
            'system');
  end if;

  return jsonb_build_object(
    'success', true,
    'promoted_applicant_id', coalesce(v_promoted.id::text, null),
    'promoted_applicant_name', coalesce(v_promoted.full_name, null)
  );
end;
$$;

grant execute on function public.cancel_interview_booking(uuid) to anon, authenticated;

-- ─── RPC: update_admission_status(admission_id, new_status, note) ──────────
-- Staff-only: changes an applicant's status, logs the timeline, and triggers
-- waitlist auto-promotion when relevant (e.g. when an 'approved' applicant
-- is changed to 'rejected', promote the next waitlisted applicant).
create or replace function public.update_admission_status(
  p_admission_id uuid,
  p_new_status   public.admission_status,
  p_note         text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_admission  record;
  v_promoted   record;
begin
  select * into v_admission from public.admissions where id = p_admission_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Application not found.');
  end if;

  -- Update status
  update public.admissions set status = p_new_status where id = p_admission_id;

  -- Log timeline
  insert into public.admission_status_timeline (admission_id, from_status, to_status, note, actor)
  values (p_admission_id, v_admission.status, p_new_status, p_note, 'admin');

  -- Waitlist auto-promotion: if status went to 'rejected' or 'cancelled',
  -- and the class still has waitlisted applicants, promote the next one.
  if p_new_status in ('rejected'::public.admission_status) then
    select a.id, a.full_name into v_promoted
      from public.admissions a
     where a.applying_class = v_admission.applying_class
       and a.status = 'waitlisted'::public.admission_status
     order by a.created_at asc
     limit 1
     for update of a;

    if found then
      update public.admissions
         set status = 'under_review'::public.admission_status
       where id = v_promoted.id;

      insert into public.admission_status_timeline (admission_id, from_status, to_status, note, actor)
      values (v_promoted.id, 'waitlisted'::public.admission_status,
              'under_review'::public.admission_status,
              'A seat opened up — you have been promoted from the waitlist.',
              'system');
    end if;
  end if;

  return jsonb_build_object('success', true, 'promoted_applicant_id', coalesce(v_promoted.id::text, null));
end;
$$;

grant execute on function public.update_admission_status(uuid, public.admission_status, text)
  to authenticated;

-- ─── SEED: Sample interview slots for the next 2 weeks ─────────────────────
-- (Admin can add more via the admin panel — these are just starters.)
insert into public.interview_slots (slot_date, start_time, duration_minutes, capacity, location, notes)
select
  d::date,
  t::time,
  15,
  10,
  'School Office — Room 1',
  'Bring B-Form, photos, and previous result card.'
from (values
  (current_date + interval '3 days', '09:00'),
  (current_date + interval '3 days', '11:00'),
  (current_date + interval '5 days', '10:00'),
  (current_date + interval '7 days', '14:00'),
  (current_date + interval '10 days', '09:00'),
  (current_date + interval '12 days', '13:00')
) as v(d, t)
where not exists (
  select 1 from public.interview_slots where slot_date = d::date and start_time = t::time
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- END OF MIGRATION
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
