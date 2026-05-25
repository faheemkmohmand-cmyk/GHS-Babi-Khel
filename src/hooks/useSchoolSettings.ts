import { useQuery } from "@tanstack/react-query";
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

export function safeMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/^http:\/\//i, "https://");
}

// Persistent cache key — survives sign-in/sign-out, page reloads, and
// browser tab restarts. This is the fix for the "logo & banner disappear
// after sign-in/sign-out on mobile Chrome" bug: even if Supabase fetch
// fails or is slow during an auth state change, we still have the last
// known good settings on disk so the UI never shows the empty fallback.
const CACHE_KEY = "ghs-school-settings-v1";

function readCache(): SchoolSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "school_name" in parsed) {
      return parsed as SchoolSettings;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeCache(s: SchoolSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
}

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
  } as SchoolSettings;
}

export function useSchoolSettings() {
  return useQuery<SchoolSettings>({
    queryKey: ["school-settings"],
    queryFn: async () => {
      // Attempt 1: public client (no auth — immune to refresh-token issues)
      try {
        const fresh = await fetchSettings(supabasePublic);
        writeCache(fresh);
        return fresh;
      } catch (publicErr) {
        console.warn("[useSchoolSettings] Public client failed:", publicErr);
      }

      // Attempt 2: authenticated client
      try {
        const fresh = await fetchSettings(supabase);
        writeCache(fresh);
        return fresh;
      } catch (authErr) {
        console.warn("[useSchoolSettings] Authenticated client failed:", authErr);
      }

      // Both fetches failed: return last known good settings from
      // localStorage so logo/banner stay visible. If nothing cached yet,
      // fall back to the safe defaults.
      const cached = readCache();
      return cached ?? fallbackSettings;
    },
    // Hydrate immediately from localStorage so logo/banner render on the
    // very first paint — even before Supabase responds. This is what
    // makes sign-in / sign-out smooth on mobile Chrome.
    initialData: () => readCache() ?? undefined,
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Keep showing previous data while refetching — never blank out.
    placeholderData: (previousData) => previousData ?? readCache() ?? fallbackSettings,
  });
}
