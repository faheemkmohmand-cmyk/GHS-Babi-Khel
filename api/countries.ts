// api/countries.ts
// Vercel Serverless Function — serves country data from a reliable static source.
//
// Why: restcountries.com v3.1 API was DEPRECATED in 2026 and now requires an
// API key. This caused "Could not load country data" errors on the World Explorer.
//
// This proxy fetches the open-source country dataset (countriesV2.json) from
// the official apilayer/restcountries GitHub repo and transforms it to the
// v3.1 format that the frontend expects (cca2, cca3, name.common, flags.png, etc.).
//
// Cached for 24 hours on the server to minimize GitHub API calls.
//
// Browser → /api/countries → this function → GitHub raw → transformed JSON

const DATA_URL = "https://raw.githubusercontent.com/apilayer/restcountries/master/src/main/resources/countriesV2.json";

// In-memory cache (survives warm serverless invocations)
let cachedData: any[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 86400000; // 24 hours

// Transform v2 format → v3.1 format
function transformCountry(c: any) {
  // v2: alpha2Code, alpha3Code, name, flag, callingCodes, currencies, languages, etc.
  // v3.1: cca2, cca3, name.common, flags.png, idd.root+suffixes, currencies{code:{name,symbol}}, etc.

  const currencies: Record<string, { name: string; symbol: string }> = {};
  if (Array.isArray(c.currencies)) {
    for (const cur of c.currencies) {
      if (cur.code && cur.code !== "(none)") {
        currencies[cur.code] = {
          name: cur.name || cur.code,
          symbol: cur.symbol || "",
        };
      }
    }
  }

  const languages: Record<string, string> = {};
  if (Array.isArray(c.languages)) {
    for (const lang of c.languages) {
      if (lang.iso639_1) {
        languages[lang.iso639_1] = lang.name;
      } else if (lang.iso639_2) {
        languages[lang.iso639_2] = lang.name;
      } else if (lang.name) {
        languages[lang.name.toLowerCase().slice(0, 2)] = lang.name;
      }
    }
  }

  // Flag URLs — use flagcdn.com which is free and reliable
  const cca2 = (c.alpha2Code || "").toLowerCase();
  const flagPng = `https://flagcdn.com/w320/${cca2}.png`;
  const flagSvg = `https://flagcdn.com/${cca2}.svg`;

  // Coat of arms — not available in v2, leave empty
  const coatOfArms: { png?: string; svg?: string } = {};

  return {
    cca2: c.alpha2Code || "",
    cca3: c.alpha3Code || "",
    name: {
      common: c.name || "",
      official: c.nativeName || c.name || "",
    },
    capital: c.capital ? [c.capital] : [],
    population: c.population || 0,
    area: c.area || 0,
    region: c.region || "",
    subregion: c.subregion || "",
    languages: Object.keys(languages).length > 0 ? languages : undefined,
    currencies: Object.keys(currencies).length > 0 ? currencies : undefined,
    borders: c.borders || [],
    flags: { png: flagPng, svg: flagSvg, alt: `Flag of ${c.name}` },
    coatOfArms,
    latlng: c.latlng || [0, 0],
    timezones: c.timezones || [],
    continents: [c.region ? (c.region === "Americas" ? "North America" : c.region) : ""],
    fifa: c.cioc || "",
    tld: c.topLevelDomain || [],
    independent: c.independent !== false,
    unMember: c.numericCode ? true : false,
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "public, max-age=86400"); // CDN cache 24h

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Check in-memory cache
  if (cachedData && Date.now() - cacheTime < CACHE_TTL) {
    return res.status(200).json(cachedData);
  }

  try {
    const response = await fetch(DATA_URL, {
      headers: { "User-Agent": "GHSBabiKhel/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`GitHub returned ${response.status}`);
    }

    const rawCountries: any[] = await response.json();

    // Transform to v3.1 format
    const transformed = rawCountries.map(transformCountry);

    // Sort alphabetically by common name
    transformed.sort((a, b) =>
      (a.name.common || "").localeCompare(b.name.common || "")
    );

    // Cache in memory
    cachedData = transformed;
    cacheTime = Date.now();

    return res.status(200).json(transformed);
  } catch (err: any) {
    console.error("Countries proxy error:", err);

    // If we have stale cached data, serve it
    if (cachedData) {
      return res.status(200).json(cachedData);
    }

    return res.status(500).json({
      error: "Failed to fetch country data",
      detail: err.message,
    });
  }
}
