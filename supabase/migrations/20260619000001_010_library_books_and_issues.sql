-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 010_library_books_and_issues.sql
-- Library book borrowing system: physical books + QR scan + issues + reviews
--
-- Adds 3 new tables:
--   1. library_books       — physical books in the school library (with QR codes)
--   2. book_issues         — who has which book, when, due date
--   3. book_reviews        — 5-star ratings + comments + helpful votes
--
-- All tables have Row Level Security enabled:
--   - Anyone (anon) can read published books and reviews
--   - Only authenticated students can issue books and post reviews
--   - Teachers/admins can manage books and mark returns
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ─── 1. LIBRARY_BOOKS ──────────────────────────────────────────────────────
-- Catalog of physical books the school owns. Each book has a unique QR code
-- (printed on a sticker on the back cover) that students scan to issue it.
create table if not exists public.library_books (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  author          text,
  isbn            text,
  qr_code         text unique not null,           -- e.g. "BK-001"
  description     text,
  cover_url       text,                            -- optional book cover image URL
  category        text default 'General',          -- Fiction / Science / Math / etc.
  total_copies    integer not null default 1 check (total_copies >= 0),
  available_copies integer not null default 1 check (available_copies >= 0 and available_copies <= total_copies),
  is_published    boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_library_books_qr_code on public.library_books (qr_code);
create index if not exists idx_library_books_title on public.library_books using ilike (title);
create index if not exists idx_library_books_category on public.library_books (category);

-- Trigger to keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_library_books_touch on public.library_books;
create trigger trg_library_books_touch
  before update on public.library_books
  for each row execute function public.touch_updated_at();

-- ─── 2. BOOK_ISSUES ────────────────────────────────────────────────────────
-- Tracks which student has which book. A row is inserted on issue, and
-- `returned_at` is set when they return the book.
create table if not exists public.book_issues (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references public.library_books (id) on delete cascade,
  user_id      uuid not null,                      -- references auth.users but we don't enforce FK
  user_name    text not null,                      -- denormalized for easy display
  issued_at    timestamptz not null default now(),
  due_date     timestamptz not null,
  returned_at  timestamptz,                        -- null = currently issued
  returned_by  text,                               -- name of teacher/admin who marked return
  created_at   timestamptz not null default now()
);

create index if not exists idx_book_issues_book_id on public.book_issues (book_id);
create index if not exists idx_book_issues_user_id on public.book_issues (user_id);
create index if not exists idx_book_issues_active on public.book_issues (returned_at) where returned_at is null;
create index if not exists idx_book_issues_due_date on public.book_issues (due_date);

-- ─── 3. BOOK_REVIEWS ───────────────────────────────────────────────────────
-- GoodReads-style reviews: 1-5 stars + comment + helpful votes.
create table if not exists public.book_reviews (
  id            uuid primary key default gen_random_uuid(),
  book_id       uuid not null references public.library_books (id) on delete cascade,
  user_id       uuid not null,
  user_name     text not null,
  rating        smallint not null check (rating >= 1 and rating <= 5),
  comment       text,
  helpful_count integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (book_id, user_id)                        -- one review per user per book
);

create index if not exists idx_book_reviews_book_id on public.book_reviews (book_id);
create index if not exists idx_book_reviews_user_id on public.book_reviews (user_id);
create index if not exists idx_book_reviews_rating on public.book_reviews (rating);

drop trigger if exists trg_book_reviews_touch on public.book_reviews;
create trigger trg_book_reviews_touch
  before update on public.book_reviews
  for each row execute function public.touch_updated_at();

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────────────────

alter table public.library_books   enable row level security;
alter table public.book_issues     enable row level security;
alter table public.book_reviews    enable row level security;

-- library_books: anyone can read published books; only admins/teachers can write
drop policy if exists "library_books_read_public" on public.library_books;
create policy "library_books_read_public"
  on public.library_books for select
  to anon, authenticated
  using (is_published = true);

drop policy if exists "library_books_write_staff" on public.library_books;
create policy "library_books_write_staff"
  on public.library_books for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'teacher')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'teacher')
    )
  );

-- book_issues: students can read their own issues; staff can read all;
-- students can insert issues for themselves; staff can update (mark returns)
drop policy if exists "book_issues_read_own_or_staff" on public.book_issues;
create policy "book_issues_read_own_or_staff"
  on public.book_issues for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'teacher')
    )
  );

drop policy if exists "book_issues_insert_own" on public.book_issues;
create policy "book_issues_insert_own"
  on public.book_issues for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "book_issues_update_staff_or_own" on public.book_issues;
create policy "book_issues_update_staff_or_own"
  on public.book_issues for update
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'teacher')
    )
  );

-- book_reviews: anyone can read; only authenticated users can write their own reviews
drop policy if exists "book_reviews_read_public" on public.book_reviews;
create policy "book_reviews_read_public"
  on public.book_reviews for select
  to anon, authenticated
  using (true);

drop policy if exists "book_reviews_insert_own" on public.book_reviews;
create policy "book_reviews_insert_own"
  on public.book_reviews for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "book_reviews_update_own" on public.book_reviews;
create policy "book_reviews_update_own"
  on public.book_reviews for update
  to authenticated
  using (user_id = auth.uid());

-- ─── SEED DATA (optional, safe to remove) ───────────────────────────────────
-- A few sample books so the page isn't empty on first deploy.
insert into public.library_books (title, author, qr_code, description, category, total_copies, available_copies, cover_url)
values
  ('The Holy Quran',                  NULL,                'BK-QURAN-001', 'Standard Arabic text with Urdu translation.', 'Religious', 5, 5, NULL),
  ('Pakistan Studies (Class 10)',     'KPK Textbook Board','BK-PS-001',    'Official KPK board textbook for Class 10 Pakistan Studies.', 'Textbook', 30, 28, NULL),
  ('Mathematics (Class 9)',           'KPK Textbook Board','BK-MATH-009',  'Official KPK board textbook for Class 9 Mathematics.', 'Textbook', 35, 30, NULL),
  ('Physics (Class 10)',              'KPK Textbook Board','BK-PHY-010',   'Official KPK board textbook for Class 10 Physics.', 'Textbook', 30, 25, NULL),
  ('A Tale of Two Cities',            'Charles Dickens',   'BK-ENG-001',   'Classic English novel set during the French Revolution.', 'Fiction', 3, 3, NULL),
  ('The Selfish Gene',                'Richard Dawkins',   'BK-BIO-001',   'Popular science book on evolutionary biology.', 'Science', 2, 2, NULL),
  ('Short Stories by Manto',          'Saadat Hasan Manto','BK-URDU-001',  'Collection of Urdu short stories.', 'Fiction', 4, 4, NULL)
on conflict (qr_code) do nothing;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- END OF MIGRATION
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
