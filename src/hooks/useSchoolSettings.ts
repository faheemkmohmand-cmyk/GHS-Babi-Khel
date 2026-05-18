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

// ─── URL safety helper ────────────────────────────────────────────────────
// Cloudinary occasionally returns http:// URLs. Mobile Chrome blocks
// mixed-content (http image inside https page) silently — the img fires
// onError and the logo/banner disappears. Force every media URL to https.
export function safeMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/^http:\/\//i, "https://");
}

export function useSchoolSettings() {
  return useQuery<SchoolSettings>({
    queryKey: ["school-settings"],
    queryFn: async () => {
      try {
        const { data, error } = await supabasePublic
          .from("school_settings")
          .select("id, school_name, tagline, description, logo_url, banner_url, emis_code, address, phone, email, established_year, total_students, total_teachers, pass_percentage")
          .eq("id", 1)
          .single();
        if (error) throw error;
        // Normalise URLs to https so mobile Chrome never blocks them
        return {
          ...data,
          logo_url: safeMediaUrl(data.logo_url),
          banner_url: safeMediaUrl(data.banner_url),
        };
      } catch (err) {
        console.warn("[useSchoolSettings] Query failed, using fallback:", err);
        return fallbackSettings;
      }
    },
    // FIX: Increased staleTime from 30s → 5min.
    // On mobile, a 30s staleTime means every time the user opens a new tab
    // or the browser wakes the app from background (common on Android), React
    // Query immediately fires a background refetch. During that refetch window
    // `settings` becomes `undefined` momentarily → banner/logo disappear.
    // 5 minutes is still short enough that changes appear quickly after save.
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: true,
    // FIX: placeholderData keeps the PREVIOUS cached value visible while
    // a background refetch runs, so the banner/logo never flash away.
    // Using a function form so it only returns non-null cached data.
    placeholderData: (previousData) => previousData ?? fallbackSettings,
  });
}

export { fallbackSettings };

    
