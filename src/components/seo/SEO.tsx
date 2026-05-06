import { Helmet } from "react-helmet-async";

const SITE_URL = "https://ghsbabkhel.lovable.app";
const SITE_NAME = "GHS Babi Khel";
const DEFAULT_IMAGE = `${SITE_URL}/apple-touch-icon.png`;

export interface SEOProps {
  title: string;
  description: string;
  path?: string;
  image?: string;
  keywords?: string;
  type?: "website" | "article" | "profile";
  noIndex?: boolean;
  jsonLd?: Record<string, any> | Record<string, any>[];
  breadcrumbs?: { name: string; path: string }[];
}

/**
 * SEO component — additive only. Uses react-helmet-async to inject
 * meta tags, Open Graph, Twitter cards, canonical, and JSON-LD.
 * Does not affect rendering or layout.
 */
const SEO = ({
  title,
  description,
  path = "",
  image = DEFAULT_IMAGE,
  keywords,
  type = "website",
  noIndex = false,
  jsonLd,
  breadcrumbs,
}: SEOProps) => {
  const fullTitle = title.includes(SITE_NAME)
    ? title
    : `${title} | ${SITE_NAME}`;
  const url = `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`.replace(/\/$/, "") || SITE_URL;

  const schemas: Record<string, any>[] = [];
  if (jsonLd) {
    if (Array.isArray(jsonLd)) schemas.push(...jsonLd);
    else schemas.push(jsonLd);
  }

  if (breadcrumbs && breadcrumbs.length > 0) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbs.map((b, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: b.name,
        item: `${SITE_URL}${b.path.startsWith("/") ? b.path : `/${b.path}`}`,
      })),
    });
  }

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      <meta name="author" content={SITE_NAME} />
      <meta
        name="robots"
        content={
          noIndex
            ? "noindex, nofollow"
            : "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1"
        }
      />
      <link rel="canonical" href={url} />

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="en_PK" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {schemas.map((s, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(s)}
        </script>
      ))}
    </Helmet>
  );
};

export default SEO;
export { SITE_URL, SITE_NAME };
