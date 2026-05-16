import { useQuery } from "@tanstack/react-query";
// FIX: Use supabasePublic instead of supabase for reading school settings.
// The authenticated supabase client can get stuck in an auth refresh loop
// when the session token is expired or broken — this causes the query to
// hang forever, and React Query keeps showing placeholderData (which has
// logo_url: null, banner_url: null). supabasePublic has no auth session
// management, so it never gets stuck. This is the same fix already used
// for the admission form (see supabase.ts comments).
import { supabasePublic } from "@/lib/supabase";

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

const fallbackSettings: SchoolSettings = {
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
      const { data, error } = await supabasePublic
        .from("school_settings")
        .select("id, school_name, tagline, description, logo_url, banner_url, emis_code, address, phone, email, established_year, total_students, total_teachers, pass_percentage")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return data;
    },
    // Reduced staleTime so updated logo/banner appear faster after save.
    // FIX: was 2 minutes — even 2 minutes means homepage shows old null
    // banner/logo for 2 minutes after saving. Set to 30s as a compromise.
    staleTime: 30 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    // Refresh data when user switches back to the homepage tab
    // (e.g., after uploading logo/banner in admin panel)
    refetchOnWindowFocus: true,
    // FIX: Removed placeholderData: fallbackSettings.
    // The placeholder has logo_url: null and banner_url: null. When React
    // Query serves placeholderData, the homepage renders with no banner/logo
    // even though Supabase has the real URLs. Since the query is fast
    // (Supabase is nearby), a loading skeleton is better than wrong data.
    // Components that need fallback text values handle it inline with || "".
  });
}

export { fallbackSettings };
