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

// Calls the secure server-side RPC function — bypasses RLS completely
export async function submitAdmission(payload: {
  full_name: string; father_name: string; date_of_birth: string | null;
  b_form_no: string; contact_number: string; whatsapp_number: string | null;
  home_address: string | null; gender: string | null; applying_class: string;
  admission_type: AdmissionType; previous_school: string | null;
  previous_class: string | null; previous_marks: string | null;
  year_of_passing: string | null;
}): Promise<{ id: string; reference_no: string }> {

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Server took too long. Please check your internet and try again.")), 20000)
  );

  const rpcPromise = supabase.rpc("submit_admission_public", {
    p_full_name:       payload.full_name,
    p_father_name:     payload.father_name,
    p_date_of_birth:   payload.date_of_birth || null,
    p_b_form_no:       payload.b_form_no,
    p_contact_number:  payload.contact_number,
    p_whatsapp_number: payload.whatsapp_number  ?? null,
    p_home_address:    payload.home_address     ?? null,
    p_gender:          payload.gender           ?? null,
    p_applying_class:  payload.applying_class,
    p_admission_type:  payload.admission_type,
    p_previous_school: payload.previous_school  ?? null,
    p_previous_class:  payload.previous_class   ?? null,
    p_previous_marks:  payload.previous_marks   ?? null,
    p_year_of_passing: payload.year_of_passing  ?? null,
  });

  const { data, error } = await Promise.race([rpcPromise, timeoutPromise]) as any;

  if (error) throw new Error(`Submission failed: ${error.message}`);
  if (!data?.id) throw new Error("No response from server. Please try again.");
  return data as { id: string; reference_no: string };
}

export async function uploadAdmissionDocument(
  admissionId: string,
  docType: string,
  file: File
): Promise<string> {
  const cloudinaryUrl = await uploadToCloudinary(file, `admissions/${admissionId}`);

  const { error } = await supabase.from("admission_documents").insert({
    admission_id: admissionId,
    doc_type:     docType,
    file_path:    cloudinaryUrl,
    file_name:    file.name,
  });

  if (error) throw new Error(`Failed to record document: ${error.message}`);
  return cloudinaryUrl;
}

export function getDocUrl(path: string): string {
  return path;
    }
  
