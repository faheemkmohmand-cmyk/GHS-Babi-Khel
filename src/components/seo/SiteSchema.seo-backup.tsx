import { Helmet } from "react-helmet-async";
import { SITE_URL, SITE_NAME } from "./SEO";

/**
 * Site-wide JSON-LD: Organization, EducationalOrganization, WebSite (with SearchAction).
 * Mounted once at the app root. Additive-only; does not affect rendering.
 */
const SiteSchema = () => {
  const logo = `${SITE_URL}/apple-touch-icon.png`;

  const organization = {
    "@context": "https://schema.org",
    "@type": ["EducationalOrganization", "HighSchool", "LocalBusiness"],
    "@id": `${SITE_URL}#organization`,
    name: "Government High School Babi Khel",
    alternateName: SITE_NAME,
    url: SITE_URL,
    logo,
    image: logo,
    foundingDate: "2018",
    description:
      "Government High School Babi Khel — quality education and excellence since 2018, District Mohmand, KPK Pakistan.",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Babi Khel",
      addressLocality: "Babi Khel",
      addressRegion: "Khyber Pakhtunkhwa",
      addressCountry: "PK",
    },
    areaServed: {
      "@type": "AdministrativeArea",
      name: "District Mohmand, KPK",
    },
    email: "ghsbabkhel@edu.pk",
    sameAs: [],
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}#website`,
    url: SITE_URL,
    name: SITE_NAME,
    publisher: { "@id": `${SITE_URL}#organization` },
    inLanguage: "en",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/notices?q={search_term_string}`,
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
