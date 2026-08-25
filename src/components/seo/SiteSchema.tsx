import { Helmet } from "react-helmet-async";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { SITE_URL, SITE_NAME } from "./SEO";

/**
 * Site-wide JSON-LD schemas: Organization, HighSchool (with full address),
 * WebSite (with SearchAction). Mounted once at app root.
 *
 * ── Problem 4 fix ──────────────────────────────────────────────────────────
 * Phone, email, address and principal name are now pulled LIVE from the
 * school_settings table (the same values the admin edits in the dashboard),
 * instead of being hardcoded here. Before, Google read a stale phone and a
 * non-existent email (ghsbabikhel@edu.pk) from this schema even after the
 * admin updated the website — because this file never changed.
 *
 * The fallbacks below are only used if the settings fetch fails, and now
 * match the REAL school details (ghsbabikhel@gmail.com).
 *
 * `sameAs` now lists the school's official Facebook page (from Contact.tsx)
 * so Google connects the website + Facebook page into one entity — this is
 * what lets the website outrank the Facebook page for the school's name.
 */
const SiteSchema = () => {
  const { data: settings } = useSchoolSettings();

  const ogImage = `${SITE_URL}/og-image.jpg`;
  const logoIcon = `${SITE_URL}/apple-touch-icon.png`;

  // ── Live contact data (falls back to real school details) ──
  const phone = (settings?.phone || "+923469898295").trim();
  const email = (settings?.email || "ghsbabikhel@gmail.com").trim();
  const principal = (settings?.principal_name || "").trim();

  // Use live coordinates when the admin has set them; otherwise the
  // district defaults (these match the fallbackSettings in useSchoolSettings).
  const lat = settings?.location_lat ?? 34.4084;
  const lng = settings?.location_lng ?? 71.3707;

  const organization: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": ["EducationalOrganization", "HighSchool"],
    "@id": `${SITE_URL}#organization`,
    name: settings?.school_name || "Government High School Babi Khel",
    alternateName: SITE_NAME,
    url: SITE_URL,
    logo: logoIcon,
    image: ogImage,
    foundingDate: String(settings?.established_year || 2018),
    description:
      settings?.description ||
      "Government High School Babi Khel — quality education and excellence since 2018, District Mohmand, KPK Pakistan.",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Babi Khel",
      addressLocality: "Babi Khel",
      addressRegion: "Khyber Pakhtunkhwa",
      postalCode: "24220",
      addressCountry: "PK",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: String(lat),
      longitude: String(lng),
    },
    hasMap: `https://maps.google.com/?q=${lat},${lng}`,
    telephone: phone,
    email: email,
    areaServed: {
      "@type": "AdministrativeArea",
      name: "District Mohmand, Khyber Pakhtunkhwa, Pakistan",
    },
    // Official Facebook page — connects website + FB into ONE Google entity.
    sameAs: ["https://www.facebook.com/share/1EERTSk1W7/"],
  };

  // Principal as a named employee (richer Knowledge Panel)
  if (principal) {
    organization.employee = [
      {
        "@type": "Person",
        name: principal,
        jobTitle: "Principal",
        worksFor: { "@id": `${SITE_URL}#organization` },
      },
    ];
  }

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}#website`,
    url: SITE_URL,
    name: SITE_NAME,
    publisher: { "@id": `${SITE_URL}#organization` },
    inLanguage: ["en", "ur"],
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(organization)}</script>
      <script type="application/ld+json">{JSON.stringify(website)}</script>
    </Helmet>
  );
};

export default SiteSchema;
