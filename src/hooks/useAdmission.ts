import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { uploadToCloudinary } from "@/lib/cloudinary";

export type AdmissionType   = "fresh" | "migration";
export type AdmissionStatus = "pending" | "under_review" | "approved" | "rejected" | "documents_missing";

export interface AdmissionSettings {
  id: number; is_open: boolean; session_year: string;
  open_date: string | null; last_date: string | null;
  banner_message: string | null; notes: string | null; updated_at: string;
}

export interface Admission {
  id: string; reference_no: string; full_name: string; father_name: string;
  date_of_birth: string | null; b_form_no: string; contact_number: string;
  whatsapp_number: string | null; home_address: string | null; gender: string | null;
  applying_class: string; admission_type: AdmissionType; previous_school: string | null;
  previous_class: string | null; previous_marks: string | null; year_of_passing: string | null;
  status: AdmissionStatus; admin_note: string | null; rejection_reason: string | null;
  admission_roll_no: string | null; migration_step: number | null;
  created_at: string; updated_at: string;
}

export interface AdmissionDocument {
  id: string; admission_id: string; doc_type: string;
  file_path: string; file_name: string | null; uploaded_at: string;
}

// ── Timeout helper ────────────────────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} is taking too long. Please try again.`)),
      ms
    );
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// ── Admission settings ────────────────────────────────────────────────────
export function useAdmissionSettings() {
  return useQuery<AdmissionSettings | null>({
    queryKey: ["admission-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admission_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 2 * 60 * 1000,
  });
}

// ── Track application ─────────────────────────────────────────────────────
export function useTrackAdmission(query: string) {
  return useQuery({
    queryKey: ["track-admission", query],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("track_admission", { p_query: query });
      if (error) throw error;
      return (data ?? []) as Admission[];
    },
    enabled: query.length >= 5,
    staleTime: 0,
  });
}

// ── Admin: all admissions ─────────────────────────────────────────────────
const PAGE_SIZE = 20;
export function useAdminAdmissions(filters: {
  status?: string; classFilter?: string; typeFilter?: string; page?: number;
} = {}) {
  const page = filters.page ?? 0;
  return useQuery<{ admissions: Admission[]; count: number }>({
    queryKey: ["admin-admissions", filters],
    queryFn: async () => {
      let q = supabase.from("admissions").select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
      if (filters.classFilter && filters.classFilter !== "all") q = q.eq("applying_class", filters.classFilter);
      if (filters.typeFilter && filters.typeFilter !== "all") q = q.eq("admission_type", filters.typeFilter);
      const { data, error, count } = await q;
      if (error) throw error;
      return { admissions: (data ?? []) as Admission[], count: count ?? 0 };
    },
  });
}

// ── Admin: documents ──────────────────────────────────────────────────────
export function useAdmissionDocuments(admissionId: string) {
  return useQuery<AdmissionDocument[]>({
    queryKey: ["admission-docs", admissionId],
    queryFn: async () => {
      const { data, error } = await supabase.from("admission_documents")
        .select("*").eq("admission_id", admissionId).order("uploaded_at");
      if (error) throw error;
      return (data ?? []) as AdmissionDocument[];
    },
    enabled: !!admissionId,
  });
}

// ── Admin: update admission ───────────────────────────────────────────────
export function useUpdateAdmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Admission> }) => {
      const { error } = await supabase.from("admissions").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-admissions"] }),
  });
}

// ── Admin: update settings ────────────────────────────────────────────────
export function useUpdateAdmissionSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Partial<AdmissionSettings>) => {
      const { error } = await supabase.from("admission_settings")
        .update({ ...updates, updated_at: new Date().toISOString() }).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admission-settings"] }),
  });
}

// ── Submit admission — NO .select() after insert to avoid RLS block ───────
export async function submitAdmission(payload: {
  full_name: string; father_name: string; date_of_birth: string | null;
  b_form_no: string; contact_number: string; whatsapp_number: string | null;
  home_address: string | null; gender: string | null; applying_class: string;
  admission_type: AdmissionType; previous_school: string | null;
  previous_class: string | null; previous_marks: string | null;
  year_of_passing: string | null;
}): Promise<{ id: string; reference_no: string }> {

  // Step 1: Insert the record
  const insertPromise = supabase
    .from("admissions")
    .insert({ ...payload, reference_no: "" })  // trigger replaces "" with OHS-YYYY-XXXX
    .then(({ error }) => {
      if (error) throw new Error(`Failed to save: ${error.message} (code: ${error.code})`);
    });

  await withTimeout(insertPromise, 60_000, "Saving application");

  // Step 2: Fetch the record we just inserted using b_form_no
  // (avoids the RLS SELECT block on anon insert+select)
  const fetchPromise = supabase
    .from("admissions")
    .select("id, reference_no")
    .eq("b_form_no", payload.b_form_no)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()
    .then(({ data, error }) => {
      if (error) throw new Error(`Could not retrieve application: ${error.message}`);
      if (!data) throw new Error("Application saved but could not retrieve reference number.");
      return data as { id: string; reference_no: string };
    });

  return withTimeout(fetchPromise, 30_000, "Retrieving application");
}

// ── Upload document to Cloudinary → save URL in Supabase ─────────────────
export async function uploadAdmissionDocument(
  admissionId: string,
  docType: string,
  file: File
): Promise<string> {
  // Upload to Cloudinary
  const cloudinaryUrl = await uploadToCloudinary(file, `admissions/${admissionId}`);

  // Save URL to Supabase
  const dbPromise = supabase
    .from("admission_documents")
    .insert({
      admission_id: admissionId,
      doc_type:     docType,
      file_path:    cloudinaryUrl,
      file_name:    file.name,
    })
    .then(({ error }) => {
      if (error) throw new Error(`Failed to save document: ${error.message}`);
    });

  await withTimeout(dbPromise, 20_000, "Saving document record");
  return cloudinaryUrl;
}

// ── Get document URL (already full Cloudinary URL) ────────────────────────
export function getDocUrl(path: string): string {
  return path;
        }
