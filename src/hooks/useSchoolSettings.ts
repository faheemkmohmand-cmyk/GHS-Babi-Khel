import { useQuery } from "@tanstack/react-query";
// Import BOTH Supabase clients so we can try the authenticated client as
// fallback when the public one is blocked by RLS.
import { supabase, supabasePublic } from "@/lib/supabase";

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
  description:
    "Government High School Babi Khel is committed to providing quality education and nurturing the future leaders of Pakistan.",
  logo_url: null,
  banner_url: null,
  emis_code: "60673",
  address: "Babi Khel, District Mohmand, KPK, Pakistan",
  phone: null,
  email: "ghsbabikhel@edu.pk",
  established_year: 2018,
  total_students: 500,
  total_teachers: 25,
  pass_percentage: 98,
};

// Force every media URL to https so mobile Chrome never blocks mixed-content
export function safeMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/^http:\/\//i, "https://");
}

/**
 * Helper: run the school_settings SELECT query on a given Supabase client
 * and return the data with safe (https) media URLs.
 */
async function fetchSettings(client: typeof supabase) {
  const { data, error } = await client
    .from("school_settings")
    .select(
      "id, school_name, tagline, description, logo_url, banner_url, emis_code, address, phone, email, established_year, total_students, total_teachers, pass_percentage"
    )
    .eq("id", 1)
    .single();

  if (error) throw error;
  return {
    ...data,
    logo_url: safeMediaUrl(data.logo_url),
    banner_url: safeMediaUrl(data.banner_url),
  };
}

export function useSchoolSettings() {
  return useQuery<SchoolSettings>({
    queryKey: ["school-settings"],
    queryFn: async () => {
      // ── Attempt 1: Public client (no auth, no refresh loops) ──
      // This works when the school_settings table has a public SELECT
      // RLS policy (which is the correct database configuration).
      try {
        return await fetchSettings(supabasePublic);
      } catch (publicErr) {
        console.warn(
          "[useSchoolSettings] Public client failed (RLS may be blocking), trying authenticated client:",
          publicErr
        );
      }

      // ── Attempt 2: Authenticated client with timeout ──
      // This works when the user is signed in and RLS allows reads
      // for authenticated users. We add a 5-second timeout so a
      // stuck auth-refresh loop doesn't hang the page forever.
      try {
        const result = await Promise.race([
          fetchSettings(supabase),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Authenticated client timed out after 5s")),
              5000
            )
          ),
        ]);
        return result;
      } catch (authErr) {
        console.warn(
          "[useSchoolSettings] Authenticated client also failed:",
          authErr
        );
      }

      // ── Last resort: fallback data (logo_url/banner_url are null) ──
      console.error(
        "[useSchoolSettings] ALL queries failed. Using fallback data with null logo/banner. " +
        "Fix: Run the RLS migration SQL in Supabase SQL Editor to add a public SELECT policy on school_settings."
      );
      return fallbackSettings;
    },
    staleTime: 10 * 60 * 1000,       // 10 min
    gcTime: 60 * 60 * 1000,           // 1 hour
    retry: 2,
    refetchOnWindowFocus: false,
    placeholderData: fallbackSettings,
  });
}
