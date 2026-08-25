import { memo, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Quote, Clock, Volume2, ArrowUpRight, Sparkles, Feather, Pin } from "lucide-react";
import { format } from "date-fns";
import {
  detectTextLanguage,
  estimateReadingTime,
} from "@/lib/newsUtils";
import type { NewsItem } from "@/hooks/useNews";

/* ────────────────────────────────────────────────────────────────────────────
 *  EditorialNewsCard  —  v2 (advanced)
 *  ─────────────────────────────────────────────────────────────────────────
 *  PhD-level research-paper-styled news card. Major improvements over v1:
 *
 *  • Urdu titles now use the proper Noto Nastaliq Urdu font (via .font-urdu
 *    utility) — fixes the "distracted ع" issue where Latin serifs were
 *    rendering Urdu letters as broken isolated glyphs.
 *  • Masthead redesigned — no more single 'ع + Official Dispatch' repeated
 *    on every card. Instead, a multi-element EMBLEM: school monogram +
 *    decorative quill + dual-tone gold rule + bilingual "GHS BABI KHEL /
 *    گھس بابی خیل" masthead line + edition tag. Reads like the masthead
 *    of a printed journal, not a missing-image fallback.
 *  • Image card gets the same emblem overlaid bottom-left as a "plate
 *    credit" so it always feels editorial, image or not.
 *  • More advanced styling: paper-grain texture, dual-tone animated
 *    gradient borders, journal flourishes (rules + diamonds), shimmering
 *    hover state, drop caps in crimson, italic serif headline.
 *  • Same restrained palette — ivory ground, ink text, antique gold,
 *    deep crimson (#7a1f2b), slate-blue (#1e3a5f). No big greens.
 *
 *  Props:
 *    • item      – NewsItem from useNews()
 *    • index     – list position (used for journal article number)
 *    • featured  – when true, renders the larger 2-col lead-story layout
 *    • onListen  – callback fired when the "Listen" pill is clicked
 *  ───────────────────────────────────────────────────────────────────────── */

interface Props {
  item: NewsItem;
  index?: number;
  featured?: boolean;
  onListen?: (item: NewsItem, e: React.MouseEvent) => void;
}

const toRoman = (n: number): string => {
  const map: [number, string][] = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  let v = n;
  for (const [val, sym] of map) {
    while (v >= val) { out += sym; v -= val; }
  }
  return out || "I";
};

/* ── Decorative journal flourishes ── */
const Diamond = ({ className = "" }: { className?: string }) => (
  <span className={`inline-block w-1.5 h-1.5 rotate-45 ${className}`} />
);

const GoldRule = ({ className = "" }: { className?: string }) => (
  <div className={`h-px bg-gradient-to-r from-transparent via-gold to-transparent ${className}`} />
);

/* ──────────────────────────────────────────────────────────────────────────
 *  SchoolSeal — hexagonal gold-ringed frame containing the school's actual
 *  logo image (served from /public/icon-512.png). The hexagon shape (pointy
 *  top) gives the seal a heraldic crest feel — replacing the previous
 *  circular frame. Sized via the `size` prop so it can be reused on both
 *  compact cards, featured cards, and the NewsDetail no-image fallback.
 *
 *  Implementation notes:
 *   • `clip-path: polygon(...)` cuts both the outer gold ring and the inner
 *     ivory+image div into the same hexagon — the 2px inset on the inner
 *     div is what creates the visible gold ring around the logo.
 *   • `filter: drop-shadow(...)` is used instead of `box-shadow` because
 *     box-shadows are clipped by clip-path (they don't follow the polygon),
 *     whereas `filter: drop-shadow` does follow the clipped shape.
 *   • The previous hairline inner `ring-[0.5px]` was removed because
 *     box-shadow rings also don't follow clip-path.
 * ────────────────────────────────────────────────────────────────────────── */
const HEXAGON_CLIP =
  "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

const SchoolSeal = ({
  size = "sm",
  className = "",
}: {
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) => {
  const dims =
    size === "lg" ? "w-24 h-24"
    : size === "md" ? "w-20 h-20"
    : size === "xs" ? "w-12 h-12"
    : "w-16 h-16";
  return (
    <div
      className={`relative ${dims} ${className}`}
      style={{ filter: "drop-shadow(0 4px 8px rgba(122,31,43,0.35))" }}
    >
      {/* Outer gold hexagon (gradient ring) */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, hsl(43 70% 58%) 0%, hsl(43 85% 72%) 50%, hsl(43 70% 58%) 100%)",
          clipPath: HEXAGON_CLIP,
          WebkitClipPath: HEXAGON_CLIP,
        }}
      >
        {/* Inner hexagon — ivory ground + logo image, inset 2px to reveal
            the outer gold ring as a uniform hexagonal border. */}
        <div
          className="absolute inset-[2px] bg-[hsl(45_30%_96%)] overflow-hidden flex items-center justify-center"
          style={{ clipPath: HEXAGON_CLIP, WebkitClipPath: HEXAGON_CLIP }}
        >
          <img
            src="/icon-512.png"
            alt="GHS Babi Khel school seal"
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>
    </div>
  );
};

const CornerTicks = () => (
  <>
    <span className="pointer-events-none absolute top-3 left-3 w-2.5 h-2.5 border-t-[1.5px] border-l-[1.5px] border-gold/80" />
    <span className="pointer-events-none absolute top-3 right-3 w-2.5 h-2.5 border-t-[1.5px] border-r-[1.5px] border-gold/80" />
    <span className="pointer-events-none absolute bottom-3 left-3 w-2.5 h-2.5 border-b-[1.5px] border-l-[1.5px] border-gold/80" />
    <span className="pointer-events-none absolute bottom-3 right-3 w-2.5 h-2.5 border-b-[1.5px] border-r-[1.5px] border-gold/80" />
  </>
);

/* ──────────────────────────────────────────────────────────────────────────
 *  MastheadEmblem — the journal-style nameplate shown when there's no
 *  photo (and as an overlay credit on photo cards). Replaces the old
 *  "single letter + 'Official Dispatch'" placeholder.
 *
 *  Layers (top → bottom):
 *    1. Tiny diamond + "EST. 2018" header line (with right-side roman numerals)
 *    2. School monogram — a serif "GHS" inside a hexagonal gold ring
 *    3. Bilingual school name: "GHS BABI KHEL" (Latin) + "گھس بابی خیل" (Urdu)
 *    4. Dual-tone gold rule + diamond ornament
 *    5. Edition tag — "EDITORIAL DISPATCH · ISSUE №X"
 * ────────────────────────────────────────────────────────────────────────── */
const MastheadEmblem = ({
  articleNo,
  lang,
  size = "sm",
}: {
  articleNo: string;
  lang: "ur" | "en";
  size?: "sm" | "lg";
}) => {
  const big = size === "lg";
  return (
    <div className="w-full h-full relative overflow-hidden paper-grain flex flex-col items-center justify-center">
      {/* Concentric gold rings, off-center */}
      <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full border border-gold/25" />
      <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full border border-gold/15" />
      <div className="absolute -left-10 -bottom-10 w-32 h-32 rounded-full border border-gold/15" />

      {/* Hairline inner frame */}
      <div className="absolute inset-3 border border-gold/15 rounded-md" />
      <CornerTicks />

      {/* Subtle opening-quote watermark in the top-left corner */}
      <Quote
        className={`absolute text-primary/8 rotate-180 ${big ? "w-20 h-20 top-5 left-5" : "w-12 h-12 top-3 left-3"}`}
        strokeWidth={1.2}
      />

      <div className={`relative z-10 flex flex-col items-center ${big ? "gap-2 px-6" : "gap-1 px-3"}`}>
        {/* Top line: EST · diamond · roman numeral */}
        <div className="flex items-center gap-1.5 text-[7px] font-bold uppercase tracking-[0.3em] text-primary/55">
          <span>EST. 2018</span>
          <Diamond className="bg-gold/70" />
          <span>№ {articleNo}</span>
        </div>

        {/* School seal — hexagonal gold-ringed frame around the actual logo.
            Compact cards use the smaller "xs" (48px) seal to fit in h-32. */}
        <SchoolSeal size={big ? "lg" : "xs"} />

        {/* School name — language-aware (one language only, matching the article) */}
        <div className="text-center min-h-[1.2rem]">
          {lang === "ur" ? (
            <p
              className={`font-urdu-display text-primary ${big ? "text-base" : "text-[11px]"}`}
              dir="rtl"
            >
              گورنمنٹ ہائی سکول بابی خیل
            </p>
          ) : (
            <p
              className={`font-display font-bold text-primary tracking-[0.15em] uppercase ${big ? "text-base" : "text-[10px]"}`}
              style={{ fontFamily: "var(--font-display)" }}
            >
              GHS Babi Khel
            </p>
          )}
        </div>

        {/* Dual-tone gold rule with center diamond */}
        <div className={`flex items-center gap-1.5 w-full ${big ? "max-w-[140px]" : "max-w-[100px]"}`}>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent to-gold/70" />
          <Diamond className="bg-gold/80" />
          <div className="flex-1 h-px bg-gradient-to-l from-transparent to-gold/70" />
        </div>

        {/* Edition tag */}
        <p className={`text-[7px] font-bold uppercase tracking-[0.32em] text-[hsl(348_55%_28%)] ${big ? "text-[10px]" : ""}`}>
          {lang === "ur" ? "اداریہ" : "Editorial Dispatch"}
        </p>
      </div>
    </div>
  );
};

/* ── Framed image with editorial overlay ── */
const FramedImage = ({
  src,
  alt,
  lang,
  articleNo,
}: {
  src: string;
  alt: string;
  lang: "ur" | "en";
  articleNo: string;
}) => (
  <div className="w-full h-full relative overflow-hidden bg-secondary">
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="w-full h-full object-cover transition-transform duration-[800ms] ease-out group-hover:scale-[1.06]"
    />
    {/* ink wash so the image reads as a printed plate */}
    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/0 to-black/10" />
    <div className="absolute inset-0 ring-1 ring-inset ring-black/10" />
    <CornerTicks />

    {/* Bottom-left "plate credit" — same emblem-style tag, sits over the
        image so even photo cards carry the editorial signature. */}
    <div className="absolute bottom-3 left-3 px-2 py-1 rounded-sm bg-[hsl(348_55%_28%)]/85 backdrop-blur-sm shadow-md flex items-center gap-1.5">
      <Feather className="w-2.5 h-2.5 text-[hsl(45_40%_95%)]" />
      <span className="text-[8px] font-bold uppercase tracking-[0.22em] text-[hsl(45_40%_95%)]">
        {lang === "ur" ? "تصویر" : "Plate"} · № {articleNo}
      </span>
    </div>
  </div>
);

/* ── "Listen" pill — crimson gradient, matches editorial palette ── */
const ListenPill = ({
  onClick,
  lang,
}: {
  onClick: (e: React.MouseEvent) => void;
  lang: "ur" | "en";
}) => (
  <button
    onClick={onClick}
    aria-label={lang === "ur" ? "سننے کے لیے دبائیں" : "Listen to this article"}
    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide
               bg-gradient-to-r from-[hsl(348_55%_28%)] to-[hsl(348_50%_22%)] text-[hsl(45_40%_95%)]
               shadow-sm hover:shadow-md hover:brightness-110 active:scale-95 transition-all
               ring-1 ring-[hsl(348_55%_28%)]/30"
  >
    <Volume2 className="w-3 h-3" />
    <span>{lang === "ur" ? "سنئیں" : "Listen"}</span>
  </button>
);

/* ──────────────────────────────────────────────────────────────────────────
 *  Title — language-aware. Urdu titles use Noto Nastaliq Urdu with proper
 *  RTL line-height; English titles use Cormorant Garamond italic.
 * ────────────────────────────────────────────────────────────────────────── */
const Title = ({
  title,
  lang,
  variant,
}: {
  title: string;
  lang: "ur" | "en";
  variant: "featured" | "compact";
}) => {
  if (lang === "ur") {
    return (
      <h2
        dir="rtl"
        className={`font-urdu-display text-foreground leading-[1.6] ${
          variant === "featured"
            ? "text-2xl md:text-[1.9rem]"
            : "text-base"
        }`}
      >
        {title}
      </h2>
    );
  }
  return (
    <h2
      dir="ltr"
      className={`font-display font-semibold text-foreground leading-[1.12] ${
        variant === "featured"
          ? "text-2xl md:text-[1.9rem]"
          : "text-base"
      }`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {title}
    </h2>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
 *  Content preview — drop cap for English, plain Nastaliq for Urdu.
 *  (Drop caps don't work in RTL Nastaliq because letters connect — so we
 *   only use the drop-cap effect for Latin-script content.)
 * ────────────────────────────────────────────────────────────────────────── */
const ContentPreview = ({
  content,
  lang,
  variant,
}: {
  content: string;
  lang: "ur" | "en";
  variant: "featured" | "compact";
}) => {
  if (!content) return null;
  if (lang === "ur") {
    return (
      <p
        dir="rtl"
        className={`font-urdu text-foreground/80 leading-[2] ${
          variant === "featured"
            ? "text-[15px] line-clamp-4"
            : "text-[12px] line-clamp-2"
        }`}
      >
        {content}
      </p>
    );
  }
  return (
    <p
      dir="ltr"
      className={`text-foreground/80 leading-[1.6] line-clamp-2
                  first-letter:font-display first-letter:font-bold
                  first-letter:mr-1.5 first-letter:float-left
                  first-letter:text-[hsl(348_55%_28%)]
                  ${variant === "featured"
                    ? "text-[14px] line-clamp-4 first-letter:text-[2.8rem] first-letter:leading-[0.85]"
                    : "text-[12px] first-letter:text-[1.8rem] first-letter:leading-[0.85]"
                  }`}
      style={{ fontFamily: "var(--font-body)" }}
    >
      {content}
    </p>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
 *  EditorialNewsCard — main component
 * ────────────────────────────────────────────────────────────────────────── */
const EditorialNewsCard = ({
  item,
  index = 0,
  featured = false,
  onListen,
}: Props) => {
  const titleLang = useMemo(() => detectTextLanguage(item.title), [item.title]);
  const contentLang = useMemo(
    () => detectTextLanguage(item.content || ""),
    [item.content]
  );
  const readTime = useMemo(
    () => estimateReadingTime(item.content),
    [item.content]
  );
  const dateText = (() => {
    try { return format(new Date(item.created_at), "d MMMM yyyy"); }
    catch { return ""; }
  })();
  const articleNo = toRoman(index + 1);
  const detailUrl = `/news/${item.id}`;

  const handleListen = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onListen?.(item, e);
  };

  /* ─── FEATURED LAYOUT (large 2-col lead story) ─── */
  if (featured) {
    return (
      <motion.article
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="group relative"
      >
        <Link
          to={detailUrl}
          className="block relative bg-card rounded-md overflow-hidden shadow-[0_10px_40px_-12px_rgba(0,0,0,0.25)] hover:shadow-[0_22px_60px_-12px_rgba(0,0,0,0.38)] transition-all duration-500 border border-gold/30 hover:border-gold/70"
        >
          {/* Top triple-rule masthead bar */}
          <div className="relative">
            <div className="h-[3px] w-full bg-gradient-to-r from-transparent via-gold to-transparent" />
            <div className="h-px w-full bg-gold/40" />
            <div className="h-px w-full bg-gradient-to-r from-transparent via-[hsl(348_55%_28%)]/40 to-transparent" />
          </div>

          <div className="grid md:grid-cols-2">
            {/* Left: image / masthead emblem */}
            <div className="relative h-56 md:h-auto md:min-h-[22rem] overflow-hidden">
              {item.image_url ? (
                <FramedImage src={item.image_url} alt={item.title} lang={titleLang} articleNo={articleNo} />
              ) : (
                <MastheadEmblem articleNo={articleNo} lang={titleLang} size="lg" />
              )}
              {/* Featured ribbon */}
              <span className="absolute top-4 left-4 z-10 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[9px] font-bold uppercase tracking-[0.28em] bg-[hsl(348_55%_28%)] text-[hsl(45_40%_95%)] shadow-md ring-1 ring-[hsl(348_55%_28%)]/30">
                <Sparkles className="w-3 h-3" />
                {titleLang === "ur" ? "نمایاں" : "Featured"}
              </span>
              {/* Pinned badge — only when is_pinned is true */}
              {item.is_pinned && (
                <span className="absolute top-4 right-4 z-10 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[9px] font-bold uppercase tracking-[0.28em] bg-gradient-to-r from-[hsl(43_70%_48%)] to-[hsl(43_80%_55%)] text-[hsl(348_55%_22%)] shadow-md ring-1 ring-[hsl(43_70%_48%)]/40">
                  <Pin className="w-3 h-3" />
                  {titleLang === "ur" ? "پن کردہ" : "Pinned"}
                </span>
              )}
            </div>

            {/* Right: text */}
            <div className="p-6 md:p-8 flex flex-col justify-center relative">
              {/* Eyebrow with dual-tone rule + article number */}
              <div className="flex items-center gap-3 mb-5">
                <span className="text-[10px] font-bold uppercase tracking-[0.32em] text-[hsl(348_55%_28%)]">
                  {titleLang === "ur" ? "خلاصہ" : "Abstract"}
                </span>
                <span className="h-px flex-1 bg-gradient-to-r from-[hsl(348_55%_28%_40%)] to-transparent" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                  №&nbsp;{articleNo}
                </span>
              </div>

              {/* Title — language-aware */}
              <Title title={item.title} lang={titleLang} variant="featured" />

              {/* Meta row — date is now the most prominent element */}
              <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground mt-4 mb-5">
                <span
                  className="font-display italic text-[14px] font-semibold text-[hsl(215_45%_28%)] tracking-wide"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {dateText}
                </span>
                <span className="w-1 h-1 rounded-full bg-gold/60 self-center" />
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {readTime}
                </span>
                <span className="w-1 h-1 rounded-full bg-gold/60 self-center" />
                <span className="italic">
                  {titleLang === "ur" ? "اردو اشاعت" : "English Edition"}
                </span>
              </div>

              {/* Content preview */}
              <ContentPreview content={item.content || ""} lang={contentLang} variant="featured" />

              {/* Footer: signature + actions */}
              <div className="mt-7 pt-5 border-t border-gold/30 flex items-center justify-between flex-wrap gap-3">
                <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground italic flex items-center gap-1.5">
                  <Feather className="w-3 h-3 text-gold/70" />
                  {titleLang === "ur" ? "اداریہ محکمہ" : "GHS Babi Khel · Editorial Desk"}
                </span>
                <div className="flex items-center gap-3">
                  <ListenPill onClick={handleListen} lang={titleLang} />
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-[hsl(348_55%_28%)] group-hover:gap-2 transition-all">
                    {titleLang === "ur" ? "مکمل پڑھیں" : "Read paper"}
                    <ArrowUpRight className="w-4 h-4" />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom triple-rule */}
          <div className="relative">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-[hsl(348_55%_28%)]/40 to-transparent" />
            <div className="h-px w-full bg-gold/40" />
            <div className="h-[3px] w-full bg-gradient-to-r from-transparent via-gold/70 to-transparent" />
          </div>
        </Link>
      </motion.article>
    );
  }

  /* ─── COMPACT LAYOUT (side-story card) ─── */
  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.45, ease: "easeOut", delay: (index % 3) * 0.08 }}
      className="group relative h-full"
    >
      <Link
        to={detailUrl}
        className="block h-full bg-card rounded-md overflow-hidden shadow-[0_6px_28px_-12px_rgba(0,0,0,0.22)] hover:shadow-[0_18px_44px_-12px_rgba(0,0,0,0.36)] transition-all duration-400 border border-gold/30 hover:border-gold/70 flex flex-col"
      >
        {/* Top triple-rule */}
        <div className="relative">
          <div className="h-[3px] w-full bg-gradient-to-r from-transparent via-gold to-transparent" />
          <div className="h-px w-full bg-gold/40" />
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[hsl(348_55%_28%)]/40 to-transparent" />
        </div>

        {/* Image / masthead emblem — shrunk from h-48 (192px) to h-32 (128px) */}
        <div className="relative h-32 overflow-hidden">
          {item.image_url ? (
            <FramedImage src={item.image_url} alt={item.title} lang={titleLang} articleNo={articleNo} />
          ) : (
            <MastheadEmblem articleNo={articleNo} lang={titleLang} size="sm" />
          )}
          {/* Pinned badge on compact cards */}
          {item.is_pinned && (
            <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[7px] font-bold uppercase tracking-[0.25em] bg-gradient-to-r from-[hsl(43_70%_48%)] to-[hsl(43_80%_55%)] text-[hsl(348_55%_22%)] shadow-md ring-1 ring-[hsl(43_70%_48%)]/40">
              <Pin className="w-2 h-2" />
              {titleLang === "ur" ? "پن" : "Pinned"}
            </span>
          )}
        </div>

        {/* Body — shrunk from p-5 to p-4, tighter spacing */}
        <div className="p-4 flex flex-col flex-1">
          {/* Eyebrow row */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[8px] font-bold uppercase tracking-[0.32em] text-[hsl(348_55%_28%)]">
              {titleLang === "ur" ? "خلاصہ" : "Abstract"}
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-[hsl(348_55%_28%_40%)] to-transparent" />
            <span className="text-[8px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              №&nbsp;{articleNo}
            </span>
          </div>

          {/* Title */}
          <Title title={item.title} lang={titleLang} variant="compact" />

          {/* Meta */}
          <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1 text-[9px] text-muted-foreground mt-2 mb-2">
            <span
              className="font-display italic text-[11px] font-semibold text-[hsl(215_45%_28%)] tracking-wide"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {dateText}
            </span>
            <span className="w-1 h-1 rounded-full bg-gold/60 self-center" />
            <span className="inline-flex items-center gap-1">
              <Clock className="w-2 h-2" /> {readTime}
            </span>
          </div>

          {/* Content preview */}
          <ContentPreview content={item.content || ""} lang={contentLang} variant="compact" />

          {/* Footer */}
          <div className="mt-auto pt-3 flex items-center justify-between gap-2">
            <ListenPill onClick={handleListen} lang={titleLang} />
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[hsl(348_55%_28%)] group-hover:gap-1.5 transition-all">
              {titleLang === "ur" ? "مزید" : "Read"}
              <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Bottom triple-rule */}
        <div className="relative">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[hsl(348_55%_28%)]/40 to-transparent" />
          <div className="h-px w-full bg-gold/40" />
          <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-gold/70 to-transparent" />
        </div>
      </Link>
    </motion.article>
  );
};

export default memo(EditorialNewsCard);
