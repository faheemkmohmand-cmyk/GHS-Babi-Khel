import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface SchoolSettings {
  id: number;
  school_name: string;
  tagline: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  emis_code: string;
  address: string;
  phone: string | null;
  email: string | null;
  established_year: number;
  total_students: number;
  total_teachers: number;
  pass_percentage: number;
}

export const fallbackSettings: SchoolSettings = {
  id: 1,
  school_name: "GHS Babi Khel",
  tagline: "Excellence in Education",
  description: "Government High School Babi Khel is committed to providing quality education and nurturing the future leaders of Pakistan.",
  logo_url: null,
  banner_url: null,
  emis_code: "60673",
  address: "Babi Khel, District Mohmand, KPK, Pakistan",
  phone: null,
  email: "ghsbabkhel@edu.pk",
  established_year: 2018,
  total_students: 500,
  total_teachers: 25,
  pass_percentage: 98,
};

export function useSchoolSettings() {
  return useQuery<SchoolSettings>({
    queryKey: ["school-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_settings")
        .select("id, school_name, tagline, description, logo_url, banner_url, emis_code, address, phone, email, established_year, total_students, total_teachers, pass_percentage")
        .eq("id", 1)
        .single();

      if (error) {
        console.error("[useSchoolSettings] Supabase error:", error);
        throw error;
      }

      return data;
    },
    staleTime: 30 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: true,
    // Use fallbackSettings as placeholder so text values show instantly,
    // but NOTE: logo_url and banner_url in fallback are null intentionally —
    // they will be replaced with real data once the query resolves.
  });
}
