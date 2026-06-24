// src/pages/dashboard/tabs/WorldExplorer.tsx
// APIs: REST Countries (restcountries.com) + FlagCDN — NO API key needed

import { useState, useEffect, useCallback, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Country {
  cca2: string;
  cca3: string;
  name: { common: string; official: string };
  capital?: string[];
  population: number;
  area: number;
  region: string;
  subregion?: string;
  languages?: Record<string, string>;
  currencies?: Record<string, { name: string; symbol: string }>;
  borders?: string[];
  flags: { png: string; svg: string; alt?: string };
  coatOfArms?: { png?: string; svg?: string };
  latlng: [number, number];
  timezones: string[];
  continents: string[];
  fifa?: string;
  tld?: string[];
  independent?: boolean;
  unMember?: boolean;
}

type ExplorerTab = "map" | "week" | "compare" | "quiz";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString();

const flagUrl = (cca2: string, size: 64 | 160 | 320 = 160) =>
  `https://flagcdn.com/w${size}/${cca2.toLowerCase()}.png`;

// Week seed — same country all week so students can study it
function countryOfWeekIndex(total: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const week = Math.floor((+now - +start) / (7 * 86400000));
  return (week * 1013) % total; // prime-multiplied to spread well
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Animated spinner */
const Spinner = ({ label = "Loading…" }: { label?: string }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-12">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    <p className="text-sm text-muted-foreground">{label}</p>
  </div>
);

/** Population bar relative to China (1.4B) */
const PopBar = ({ pop }: { pop: number }) => {
  const pct = Math.min(100, (pop / 1_400_000_000) * 100);
  return (
    <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
      <div
        className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};

/** Single country profile card */
const CountryCard = ({
  country,
  allCountries,
  onBorderClick,
}: {
  country: Country;
  allCountries: Country[];
  onBorderClick: (cca3: string) => void;
}) => {
  const langs = country.languages ? Object.values(country.languages).join(", ") : "—";
  const currencies = country.currencies
    ? Object.values(country.currencies)
        .map((c) => `${c.name} (${c.symbol})`)
        .join(", ")
    : "—";

  const borderCountries = (country.borders ?? [])
    .map((b) => allCountries.find((c) => c.cca3 === b))
    .filter(Boolean) as Country[];

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/10 to-emerald-500/10 px-5 py-4 flex items-center gap-4">
        <img
          src={flagUrl(country.cca2, 160)}
          alt={`Flag of ${country.name.common}`}
          className="w-20 h-auto rounded-lg shadow-md border border-border object-cover"
          loading="lazy"
        />
        <div className="min-w-0">
          <h3 className="text-lg font-heading font-bold text-foreground leading-tight">
            {country.name.common}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {country.name.official}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              {country.region}
            </span>
            {country.subregion && (
              <span className="text-[10px] bg-secondary text-muted-foreground px-2 py-0.5 rounded-full">
                {country.subregion}
              </span>
            )}
          </div>
        </div>
        {country.coatOfArms?.png && (
          <img
            src={country.coatOfArms.png}
            alt="Coat of arms"
            className="w-12 h-12 object-contain ml-auto shrink-0 opacity-80"
            loading="lazy"
          />
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 p-4">
        {[
          { label: "🏛️ Capital", value: country.capital?.join(", ") ?? "—" },
          { label: "🌍 Continent", value: country.continents?.join(", ") ?? country.region },
          { label: "💬 Languages", value: langs },
          { label: "💰 Currency", value: currencies },
          { label: "📐 Area", value: country.area ? `${fmt(Math.round(country.area))} km²` : "—" },
          { label: "🕐 Timezone", value: country.timezones?.[0] ?? "—" },
          { label: "🌐 Domain", value: country.tld?.join(", ") ?? "—" },
          { label: "⚽ FIFA", value: country.fifa ?? "—" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-secondary rounded-xl p-3">
            <p className="text-[10px] text-muted-foreground font-medium">{label}</p>
            <p className="text-xs font-semibold text-foreground mt-0.5 line-clamp-2">{value}</p>
          </div>
        ))}
      </div>

      {/* Population */}
      <div className="px-4 pb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground font-medium">👥 Population</span>
          <span className="font-bold text-foreground">{fmt(country.population)}</span>
        </div>
        <PopBar pop={country.population} />
      </div>

      {/* Borders */}
      {borderCountries.length > 0 && (
        <div className="px-4 pb-4">
          <p className="text-[10px] text-muted-foreground font-semibold mb-2 uppercase tracking-wide">
            🗺️ Bordering Countries
          </p>
          <div className="flex flex-wrap gap-2">
            {borderCountries.map((b) => (
              <button
                key={b.cca3}
                onClick={() => onBorderClick(b.cca3)}
                className="flex items-center gap-1.5 bg-secondary hover:bg-primary/10 border border-border hover:border-primary/30 rounded-lg px-2.5 py-1.5 transition-colors"
              >
                <img
                  src={flagUrl(b.cca2, 64)}
                  alt=""
                  className="w-5 h-auto rounded-sm border border-border/50"
                />
                <span className="text-[11px] font-medium text-foreground">{b.name.common}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── FlyTo helper — flies map to a country when selected ─────────────────────
// FIX #2: This component lives inside MapContainer so it can call useMap().
// When `country` changes it fires flyTo, solving the "search doesn't move map" bug.
function FlyToCountry({ country }: { country: Country | null }) {
  const map = useMap();
  useEffect(() => {
    if (country) {
      map.flyTo([country.latlng[0], country.latlng[1]], 4, { duration: 1 });
    }
  }, [country, map]);
  return null;
}

// ─── Map click handler ────────────────────────────────────────────────────────

function WorldMapLayer({
  countries,
  onSelect,
  selectedCca2,
}: {
  countries: Country[];
  onSelect: (c: Country) => void;
  selectedCca2: string | null;
}) {
  const [geoData, setGeoData] = useState<GeoJSON.FeatureCollection | null>(null);
  const map = useMap();

  useEffect(() => {
    // Try multiple GeoJSON sources in case one is down
    const sources = [
      "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson",
      "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
    ];
    let sourceIdx = 0;
    const tryFetch = () => {
      if (sourceIdx >= sources.length) return;
      fetch(sources[sourceIdx])
        .then((r) => { if (!r.ok) throw new Error("Failed"); return r.json(); })
        .then(setGeoData)
        .catch(() => { sourceIdx++; tryFetch(); });
    };
    tryFetch();
  }, []);

  const nameMap = useRef<Map<string, Country>>(new Map());
  useEffect(() => {
    const m = new Map<string, Country>();
    countries.forEach((c) => {
      m.set(c.name.common.toLowerCase(), c);
      m.set(c.cca2.toLowerCase(), c);
      m.set(c.cca3.toLowerCase(), c);
    });
    nameMap.current = m;
  }, [countries]);

  const style = useCallback(
    (feature?: GeoJSON.Feature) => {
      const name = (feature?.properties?.ADMIN || "").toLowerCase();
      const iso2 = (feature?.properties?.ISO_A2 || "").toLowerCase();
      const found =
        nameMap.current.get(name) || nameMap.current.get(iso2);
      const isSelected = found?.cca2.toLowerCase() === selectedCca2?.toLowerCase();
      return {
        fillColor: isSelected ? "#22c55e" : "#3b82f6",
        fillOpacity: isSelected ? 0.6 : 0.15,
        color: isSelected ? "#16a34a" : "#1d4ed8",
        weight: isSelected ? 2 : 0.5,
        opacity: 0.8,
      };
    },
    [selectedCca2]
  );

  const onEachFeature = useCallback(
    (feature: GeoJSON.Feature, layer: L.Layer) => {
      (layer as L.Path).on("click", () => {
        const name = (feature.properties?.ADMIN || "").toLowerCase();
        const iso2 = (feature.properties?.ISO_A2 || "").toLowerCase();
        const found = nameMap.current.get(name) || nameMap.current.get(iso2);
        if (found) {
          onSelect(found);
          // flyTo is now handled by FlyToCountry component via selectedCca2 state
          map.flyTo([found.latlng[0], found.latlng[1]], 4, { duration: 1 });
        }
      });
      (layer as L.Path).on("mouseover", function () {
        (this as L.Path).setStyle({ fillOpacity: 0.4 });
      });
      (layer as L.Path).on("mouseout", function () {
        (this as L.Path).setStyle(style(feature));
      });
    },
    [onSelect, map, style]
  );

  if (!geoData) return null;

  return <GeoJSON key={selectedCca2} data={geoData} style={style} onEachFeature={onEachFeature} />;
}

// ─── Tab: Interactive Map ─────────────────────────────────────────────────────

const MapTab = ({
  countries,
  allCountries,
}: {
  countries: Country[];
  allCountries: Country[];
}) => {
  const [selected, setSelected] = useState<Country | null>(null);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<Country[]>([]);

  const handleSearch = (q: string) => {
    setSearch(q);
    if (q.trim().length < 2) { setSuggestions([]); return; }
    const lq = q.toLowerCase();
    setSuggestions(
      countries.filter((c) => c.name.common.toLowerCase().includes(lq)).slice(0, 6)
    );
  };

  const pickCountry = (c: Country) => {
    setSelected(c);
    setSearch("");
    setSuggestions([]);
    // FIX #2: flyTo is handled by FlyToCountry inside MapContainer
  };

  const handleBorder = (cca3: string) => {
    const c = allCountries.find((x) => x.cca3 === cca3);
    if (c) setSelected(c);
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="🔍 Search any country…"
          className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/40"
        />
        {suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-[1000] bg-card border border-border rounded-xl shadow-lg mt-1 overflow-hidden">
            {suggestions.map((c) => (
              <button
                key={c.cca2}
                onClick={() => pickCountry(c)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary transition-colors text-left"
              >
                <img src={flagUrl(c.cca2, 64)} alt="" className="w-7 h-auto rounded border border-border/50" />
                <span className="text-sm font-medium text-foreground">{c.name.common}</span>
                <span className="text-xs text-muted-foreground ml-auto">{c.region}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map — FIX #1: satellite tiles (Esri WorldImagery, free, no key) */}
      <div className="rounded-2xl overflow-hidden border border-border shadow-sm" style={{ height: 320 }}>
        <MapContainer
          center={[20, 0]}
          zoom={2}
          minZoom={1}
          maxZoom={6}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
        >
          {/* FIX #1: Satellite tile layer */}
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
          />
          {/* FIX #2: This component flies the map whenever `selected` changes */}
          <FlyToCountry country={selected} />
          <WorldMapLayer
            countries={countries}
            onSelect={setSelected}
            selectedCca2={selected?.cca2 ?? null}
          />
        </MapContainer>
      </div>
      <p className="text-xs text-muted-foreground text-center -mt-1">
        👆 Click any country on the map — or search above
      </p>

      {/* Profile */}
      {selected ? (
        <CountryCard country={selected} allCountries={allCountries} onBorderClick={handleBorder} />
      ) : (
        <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-2">
          <p className="text-3xl">🌍</p>
          <p className="text-sm font-semibold text-foreground">Tap a country to explore it</p>
          <p className="text-xs text-muted-foreground">See flag, population, currency, languages &amp; borders</p>
        </div>
      )}
    </div>
  );
};

// ─── Tab: Country of the Week ─────────────────────────────────────────────────

const WeekTab = ({
  countries,
  allCountries,
}: {
  countries: Country[];
  allCountries: Country[];
}) => {
  const idx = countryOfWeekIndex(countries.length);
  const country = countries[idx];

  if (!country) return <Spinner label="Finding country of the week…" />;

  const handleBorder = (_cca3: string) => {
    // no-op in week tab
  };

  const facts = [
    `${country.name.common} covers an area of ${fmt(Math.round(country.area ?? 0))} km².`,
    `The official name is "${country.name.official}".`,
    `Its capital city is ${country.capital?.[0] ?? "unknown"}.`,
    `People here speak ${Object.values(country.languages ?? {}).slice(0, 2).join(" and ")}.`,
    `The currency used is ${Object.values(country.currencies ?? {}).map((c) => c.name).join(" and ")}.`,
    `${country.name.common} is in ${country.subregion ?? country.region}.`,
    `Population: ${fmt(country.population)} people live here.`,
  ].filter((f) => !f.includes("undefined") && !f.includes("unknown"));

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex items-start gap-3">
        <span className="text-2xl">📅</span>
        <div>
          <p className="text-sm font-bold text-foreground">Country of the Week</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            A new country every week — study it, quiz your friends!
          </p>
        </div>
      </div>

      <CountryCard country={country} allCountries={allCountries} onBorderClick={handleBorder} />

      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <p className="text-sm font-bold text-foreground">📚 Study Notes</p>
        <ul className="space-y-2">
          {facts.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-foreground">
              <span className="text-primary font-bold shrink-0 mt-0.5">•</span>
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// ─── FIX #3: Picker lifted OUTSIDE CompareTab so it never remounts on re-render
// When Picker was defined inside CompareTab, React re-created the component type
// on every render, causing React to unmount+remount the input (losing focus & text).
const ComparePicker = ({
  label,
  search,
  sugs,
  onSearch,
  onPick,
  country,
}: {
  label: string;
  search: string;
  sugs: Country[];
  onSearch: (q: string) => void;
  onPick: (c: Country) => void;
  country: Country | null;
}) => (
  <div className="flex-1 min-w-0">
    <p className="text-xs font-semibold text-muted-foreground mb-1">{label}</p>
    <div className="relative">
      <input
        type="text"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Type country…"
        className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
      />
      {sugs.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 bg-card border border-border rounded-xl shadow-lg mt-0.5 overflow-hidden">
          {sugs.map((c) => (
            <button
              key={c.cca2}
              onClick={() => onPick(c)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary text-left"
            >
              <img src={flagUrl(c.cca2, 64)} alt="" className="w-6 h-auto rounded" />
              <span className="text-xs font-medium">{c.name.common}</span>
            </button>
          ))}
        </div>
      )}
    </div>
    {country && (
      <div className="mt-2 flex items-center gap-2">
        <img src={flagUrl(country.cca2, 160)} alt="" className="w-10 h-auto rounded border border-border" />
        <span className="text-xs font-bold text-foreground">{country.name.common}</span>
      </div>
    )}
  </div>
);

// ─── Tab: Country Comparison ──────────────────────────────────────────────────

const CompareTab = ({ countries }: { countries: Country[] }) => {
  const [a, setA] = useState<Country | null>(null);
  const [b, setB] = useState<Country | null>(null);
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");
  const [sugsA, setSugsA] = useState<Country[]>([]);
  const [sugsB, setSugsB] = useState<Country[]>([]);

  // FIX #3: useCallback keeps handler references stable across renders
  const handleSearchA = useCallback((q: string) => {
    setSearchA(q);
    if (q.length < 2) { setSugsA([]); return; }
    const lq = q.toLowerCase();
    setSugsA(countries.filter((c) => c.name.common.toLowerCase().includes(lq)).slice(0, 5));
  }, [countries]);

  const handleSearchB = useCallback((q: string) => {
    setSearchB(q);
    if (q.length < 2) { setSugsB([]); return; }
    const lq = q.toLowerCase();
    setSugsB(countries.filter((c) => c.name.common.toLowerCase().includes(lq)).slice(0, 5));
  }, [countries]);

  const pickA = useCallback((c: Country) => {
    setA(c);
    setSearchA(c.name.common);
    setSugsA([]);
  }, []);

  const pickB = useCallback((c: Country) => {
    setB(c);
    setSearchB(c.name.common);
    setSugsB([]);
  }, []);

  const metrics: { label: string; keyA: (c: Country) => string; winner?: "higher" | "lower" }[] = [
    { label: "🏛️ Capital",    keyA: (c) => c.capital?.[0] ?? "—" },
    { label: "🌍 Region",     keyA: (c) => c.region },
    { label: "👥 Population", keyA: (c) => fmt(c.population), winner: "higher" },
    { label: "📐 Area (km²)", keyA: (c) => fmt(Math.round(c.area ?? 0)), winner: "higher" },
    { label: "💬 Languages",  keyA: (c) => Object.values(c.languages ?? {}).join(", ") || "—" },
    { label: "💰 Currency",   keyA: (c) => Object.values(c.currencies ?? {}).map((x) => x.symbol).join(", ") || "—" },
    { label: "🌐 Domain",     keyA: (c) => c.tld?.join(", ") ?? "—" },
    { label: "🕐 Timezone",   keyA: (c) => c.timezones?.[0] ?? "—" },
    { label: "⚽ FIFA",       keyA: (c) => c.fifa ?? "—" },
    { label: "🇺🇳 UN Member", keyA: (c) => c.unMember ? "Yes ✅" : "No ❌" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <ComparePicker
          label="Country A"
          search={searchA}
          sugs={sugsA}
          onSearch={handleSearchA}
          onPick={pickA}
          country={a}
        />
        <div className="flex items-end pb-3">
          <span className="text-xl font-black text-muted-foreground">VS</span>
        </div>
        <ComparePicker
          label="Country B"
          search={searchB}
          sugs={sugsB}
          onSearch={handleSearchB}
          onPick={pickB}
          country={b}
        />
      </div>

      {a && b ? (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-3 bg-secondary">
            <div className="p-3 text-center">
              <img src={flagUrl(a.cca2, 160)} alt="" className="w-12 h-auto mx-auto rounded border border-border mb-1" />
              <p className="text-xs font-bold text-foreground">{a.name.common}</p>
            </div>
            <div className="p-3 flex items-center justify-center">
              <span className="text-lg font-black text-muted-foreground">VS</span>
            </div>
            <div className="p-3 text-center">
              <img src={flagUrl(b.cca2, 160)} alt="" className="w-12 h-auto mx-auto rounded border border-border mb-1" />
              <p className="text-xs font-bold text-foreground">{b.name.common}</p>
            </div>
          </div>
          {/* Rows */}
          {metrics.map(({ label, keyA, winner }, i) => {
            const va = keyA(a);
            const vb = keyA(b);
            const numA = parseFloat(va.replace(/,/g, ""));
            const numB = parseFloat(vb.replace(/,/g, ""));
            const aWins = winner && !isNaN(numA) && !isNaN(numB)
              ? (winner === "higher" ? numA > numB : numA < numB)
              : false;
            const bWins = winner && !isNaN(numA) && !isNaN(numB)
              ? (winner === "higher" ? numB > numA : numB < numA)
              : false;
            return (
              <div
                key={label}
                className={`grid grid-cols-3 border-t border-border text-xs ${i % 2 === 0 ? "bg-card" : "bg-secondary/40"}`}
              >
                <div className={`p-2.5 text-center font-semibold ${aWins ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
                  {va} {aWins && "🏆"}
                </div>
                <div className="p-2.5 text-center text-muted-foreground font-medium text-[10px] flex items-center justify-center">
                  {label}
                </div>
                <div className={`p-2.5 text-center font-semibold ${bWins ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
                  {bWins && "🏆"} {vb}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-2">
          <p className="text-3xl">⚖️</p>
          <p className="text-sm font-semibold text-foreground">Pick two countries to compare</p>
          <p className="text-xs text-muted-foreground">Population, area, currency, languages and more</p>
        </div>
      )}
    </div>
  );
};

// ─── Tab: Flag Quiz ───────────────────────────────────────────────────────────

interface QuizQuestion {
  country: Country;
  options: Country[];
  correct: number;
}

function makeQuestions(countries: Country[], count = 10): QuizQuestion[] {
  const shuffled = [...countries].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((country) => {
    const wrong = countries
      .filter((c) => c.cca2 !== country.cca2)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    const options = [...wrong, country].sort(() => Math.random() - 0.5);
    return { country, options, correct: options.indexOf(country) };
  });
}

const QuizTab = ({ countries }: { countries: Country[] }) => {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [started, setStarted] = useState(false);

  const start = () => {
    const qs = makeQuestions(countries, 10);
    setQuestions(qs);
    setQIdx(0);
    setSelected(null);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setDone(false);
    setStarted(true);
  };

  const answer = (idx: number) => {
    if (selected !== null) return;
    setSelected(idx);
    const correct = questions[qIdx].correct === idx;
    if (correct) {
      setScore((s) => s + 1);
      const ns = streak + 1;
      setStreak(ns);
      setBestStreak((b) => Math.max(b, ns));
    } else {
      setStreak(0);
    }
  };

  const next = () => {
    if (qIdx + 1 >= questions.length) {
      setDone(true);
    } else {
      setQIdx((i) => i + 1);
      setSelected(null);
    }
  };

  if (!started) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-4">
        <p className="text-5xl">🚩</p>
        <p className="text-lg font-heading font-bold text-foreground">Flag Quiz</p>
        <p className="text-sm text-muted-foreground">
          10 questions — identify the country from its flag!
        </p>
        <button
          onClick={start}
          className="bg-primary text-white font-bold rounded-xl px-8 py-3 text-sm hover:bg-primary/90 active:scale-95 transition-all"
        >
          🎮 Start Quiz
        </button>
      </div>
    );
  }

  if (done) {
    const pct = Math.round((score / questions.length) * 100);
    const grade =
      pct === 100 ? "🏆 Perfect!" :
      pct >= 80   ? "⭐ Excellent!" :
      pct >= 60   ? "👍 Good Job!" :
      pct >= 40   ? "📚 Keep Studying!" :
                    "🌱 Try Again!";
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-4">
        <p className="text-5xl">{pct === 100 ? "🏆" : pct >= 60 ? "⭐" : "📚"}</p>
        <p className="text-xl font-heading font-bold text-foreground">{grade}</p>
        <div className="bg-secondary rounded-2xl p-4 space-y-2">
          <p className="text-3xl font-black text-primary">{score}/{questions.length}</p>
          <p className="text-sm text-muted-foreground">Score — {pct}%</p>
          {bestStreak > 1 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
              🔥 Best Streak: {bestStreak} in a row!
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {questions.map((q, i) => (
            <div key={i} className="flex items-center gap-2 text-xs bg-secondary rounded-lg p-2">
              <img src={flagUrl(q.country.cca2, 64)} alt="" className="w-7 h-auto rounded" />
              <span className="font-medium text-foreground truncate">{q.country.name.common}</span>
            </div>
          ))}
        </div>
        <button
          onClick={start}
          className="bg-primary text-white font-bold rounded-xl px-8 py-3 text-sm hover:bg-primary/90 active:scale-95 transition-all w-full"
        >
          🔄 Play Again
        </button>
      </div>
    );
  }

  const q = questions[qIdx];
  if (!q) return null;

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Question {qIdx + 1} of {questions.length}</span>
        <span className="font-bold text-primary">Score: {score}</span>
        {streak > 1 && <span className="text-amber-500 font-bold">🔥 {streak} streak!</span>}
      </div>
      <div className="w-full bg-secondary rounded-full h-1.5">
        <div
          className="h-1.5 rounded-full bg-primary transition-all duration-300"
          style={{ width: `${((qIdx + 1) / questions.length) * 100}%` }}
        />
      </div>

      {/* Flag */}
      <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center gap-3">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Which country is this flag?</p>
        <img
          src={flagUrl(q.country.cca2, 320)}
          alt="Mystery flag"
          className="w-48 h-auto rounded-xl shadow-md border border-border"
        />
      </div>

      {/* Options */}
      <div className="grid grid-cols-2 gap-2">
        {q.options.map((opt, i) => {
          const isCorrect = i === q.correct;
          const isSelected = i === selected;
          const revealed = selected !== null;
          let cls = "border border-border bg-card text-foreground hover:bg-secondary";
          if (revealed && isCorrect) cls = "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300";
          else if (revealed && isSelected && !isCorrect) cls = "border-red-400 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400";
          return (
            <button
              key={opt.cca2}
              onClick={() => answer(i)}
              disabled={revealed}
              className={`rounded-xl px-4 py-3 text-sm font-semibold transition-all active:scale-95 flex items-center gap-2 ${cls}`}
            >
              <img src={flagUrl(opt.cca2, 64)} alt="" className="w-6 h-auto rounded shrink-0" />
              <span className="text-left leading-tight">{opt.name.common}</span>
              {revealed && isCorrect && <span className="ml-auto">✅</span>}
              {revealed && isSelected && !isCorrect && <span className="ml-auto">❌</span>}
            </button>
          );
        })}
      </div>

      {selected !== null && (
        <button
          onClick={next}
          className="w-full bg-primary text-white font-bold rounded-xl py-3 text-sm hover:bg-primary/90 active:scale-95 transition-all"
        >
          {qIdx + 1 >= questions.length ? "📊 See Results" : "➡️ Next Question"}
        </button>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WorldExplorer() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ExplorerTab>("map");

  useEffect(() => {
    // Use our serverless proxy instead of the deprecated restcountries.com v3.1 API.
    // The proxy fetches from a reliable GitHub-hosted dataset and transforms it
    // to the v3.1 format. This fixes "Could not load country data" errors.
    const PROXY_URL = "/api/countries";

    fetch(PROXY_URL)
      .then((r) => { if (!r.ok) throw new Error("API error"); return r.json(); })
      .then((data: Country[]) => {
        const sorted = [...data].sort((a, b) =>
          (a.name?.common || "").localeCompare(b.name?.common || "")
        );
        setCountries(sorted);
      })
      .catch(() => {
        // Fallback: fetch directly from the GitHub-hosted countriesV2 dataset
        // (same source the /api/countries proxy uses, but without the proxy layer).
        // restcountries.com v3.1 was deprecated in 2026 and requires an API key,
        // so we no longer use it here.
        const RAW_URL = "https://raw.githubusercontent.com/apilayer/restcountries/master/src/main/resources/countriesV2.json";
        fetch(RAW_URL)
          .then((r) => { if (!r.ok) throw new Error("API error"); return r.json(); })
          .then((raw: any[]) => {
            // Minimal v2→v3.1 shape transform for the fallback path
            const data: Country[] = raw.map((c) => {
              const cca2 = (c.alpha2Code || "").toLowerCase();
              const currencies: Record<string, { name: string; symbol: string }> = {};
              if (Array.isArray(c.currencies)) {
                for (const cur of c.currencies) {
                  if (cur.code && cur.code !== "(none)") {
                    currencies[cur.code] = { name: cur.name || cur.code, symbol: cur.symbol || "" };
                  }
                }
              }
              const languages: Record<string, string> = {};
              if (Array.isArray(c.languages)) {
                for (const lang of c.languages) {
                  const key = lang.iso639_1 || lang.iso639_2 || lang.name?.toLowerCase().slice(0, 2) || "";
                  if (key) languages[key] = lang.name;
                }
              }
              return {
                cca2: c.alpha2Code || "",
                cca3: c.alpha3Code || "",
                name: { common: c.name || "", official: c.nativeName || c.name || "" },
                capital: c.capital ? [c.capital] : [],
                population: c.population || 0,
                area: c.area || 0,
                region: c.region || "",
                subregion: c.subregion || "",
                languages: Object.keys(languages).length ? languages : undefined,
                currencies: Object.keys(currencies).length ? currencies : undefined,
                borders: c.borders || [],
                flags: {
                  png: `https://flagcdn.com/w320/${cca2}.png`,
                  svg: `https://flagcdn.com/${cca2}.svg`,
                  alt: `Flag of ${c.name}`,
                },
                coatOfArms: {},
                latlng: c.latlng || [0, 0],
                timezones: c.timezones || [],
                continents: [c.region || ""],
                fifa: c.cioc || "",
                tld: c.topLevelDomain || [],
                independent: c.independent !== false,
                unMember: !!c.numericCode,
              } as Country;
            });
            const sorted = [...data].sort((a, b) =>
              (a.name?.common || "").localeCompare(b.name?.common || "")
            );
            setCountries(sorted);
          })
          .catch(() => setError("Could not load country data. Please check your internet connection."));
      })
      .finally(() => setLoading(false));
  }, []);

  const tabs: { id: ExplorerTab; label: string; emoji: string }[] = [
    { id: "map",     label: "Map",     emoji: "🗺️" },
    { id: "week",    label: "Of Week", emoji: "📅" },
    { id: "compare", label: "Compare", emoji: "⚖️" },
    { id: "quiz",    label: "Quiz",    emoji: "🚩" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-lg font-heading font-bold text-foreground flex items-center gap-2">
          🌍 World Explorer
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Interactive country profiles · Country of the Week · Compare · Flag Quiz
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary rounded-xl p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === t.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>{t.emoji}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <Spinner label="Loading world data…" />
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 text-center">
          <p className="text-2xl mb-2">⚠️</p>
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : (
        <>
          {activeTab === "map"     && <MapTab     countries={countries} allCountries={countries} />}
          {activeTab === "week"    && <WeekTab    countries={countries} allCountries={countries} />}
          {activeTab === "compare" && <CompareTab countries={countries} />}
          {activeTab === "quiz"    && <QuizTab    countries={countries} />}
        </>
      )}

      <p className="text-[10px] text-muted-foreground text-center">
        Data: REST Countries API · Flags: FlagCDN · Map: Esri Satellite — all free, no API key
      </p>
    </div>
  );
}
