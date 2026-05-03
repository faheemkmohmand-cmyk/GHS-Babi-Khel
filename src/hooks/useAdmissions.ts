import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface AdmissionSettings {
  id: number;
  is_open: boolean;
  session_year: string;
  open_date: string | null;
  last_date: string | null;
  banner_message: string | null;
  notes: string | null;
  updated_at: string;
}

const fallback: AdmissionSettings = {
  id: 1,
  is_open: false,
  session_year: String(new Date().getFullYear() + 1),
  open_date: null,
  last_date: null,
  banner_message: null,
  notes: null,
  updated_at: new Date().toISOString(),
};

export function useAdmissionSettings() {
  return useQuery<AdmissionSettings>({
    queryKey: ["admission-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admission_settings")
        .select("id, is_open, session_year, open_date, last_date, banner_message, notes, updated_at")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return data as AdmissionSettings;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: fallback,
  });
}

export type AdmissionStatus = "pending" | "under_review" | "approved" | "rejected" | "documents_missing";
export type AdmissionType = "fresh" | "migration";

export interface AdmissionRow {
  id: string;
  reference_no: string;
  full_name: string;
  father_name: string;
  date_of_birth: string | null;
  b_form_no: string;
  contact_number: string;
  whatsapp_number: string | null;
  home_address: string | null;
  gender: string | null;
  applying_class: string;
  admission_type: AdmissionType;
  previous_school: string | null;
  previous_class: string | null;
  previous_marks: string | null;
  year_of_passing: string | null;
  status: AdmissionStatus;
  admin_note: string | null;
  rejection_reason: string | null;
  admission_roll_no: string | null;
  migration_step: number | null;
  created_at: string;
  updated_at: string;
}

export function useAdmissions() {
  return useQuery<AdmissionRow[]>({
    queryKey: ["admissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admissions")
        .select("id, reference_no, full_name, father_name, date_of_birth, b_form_no, contact_number, whatsapp_number, home_address, gender, applying_class, admission_type, previous_school, previous_class, previous_marks, year_of_passing, status, admin_note, rejection_reason, admission_roll_no, migration_step, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdmissionRow[];
    },
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: [],
  });
}

export interface AdmissionDoc {
  id: string;
  admission_id: string;
  doc_type: string;
  file_path: string;
  file_name: string | null;
  uploaded_at: string;
}

export function useAdmissionDocs(admissionId: string | null) {
  return useQuery<AdmissionDoc[]>({
    queryKey: ["admission-docs", admissionId],
    enabled: !!admissionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admission_documents")
        .select("id, admission_id, doc_type, file_path, file_name, uploaded_at")
        .eq("admission_id", admissionId!);
      if (error) throw error;
      return (data ?? []) as AdmissionDoc[];
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: [],
  });
}

export const MIGRATION_STEPS = [
  { n: 1, label: "Online Application Submitted" },
  { n: 2, label: "Letter to Current School Principal" },
  { n: 3, label: "Current Principal Signs Letter" },
  { n: 4, label: "New School (Our) Principal Signs" },
  { n: 5, label: "Current School Applies on BISEP" },
  { n: 6, label: "Our School Approves on BISEP" },
  { n: 7, label: "BISEP Generates Bank Challan" },
  { n: 8, label: "Migration Confirmed" },
] as const;

export const STATUS_META: Record<AdmissionStatus, { label: string; cls: string; dot: string }> = {
  pending:            { label: "Pending",            cls: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-900",     dot: "bg-blue-500" },
  under_review:       { label: "Under Review",       cls: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-900",     dot: "bg-blue-500" },
  approved:           { label: "Approved",           cls: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-900", dot: "bg-green-500" },
  rejected:           { label: "Rejected",           cls: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900",            dot: "bg-red-500" },
  documents_missing:  { label: "Documents Missing",  cls: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-900", dot: "bg-orange-500" },
};
