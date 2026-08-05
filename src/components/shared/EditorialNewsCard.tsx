import { memo, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Quote, Clock, Volume2, ArrowUpRight, Sparkles } from "lucide-react";
import { format } from "date-fns";
import {
  detectTextLanguage,
  estimateReadingTime,
} from "@/lib/newsUtils";
import type { NewsItem } from "@/hooks/useNews";

/* ────────────────────────────────────────────────────────────────────────────
 *  EditorialNewsCard
 *  ─────────────────────────────────────────────────────────────────────────
 *  A PhD-level research-paper-styled news card. Renders the same `NewsItem`
 *  that admins publish from the Announcements panel, but presents it as if it
 *  were a typeset article in an academic dispatch — serif masthead, gold
 *  hairlines, drop cap, journal-style numbering, RTL-aware for Urdu.
 *
 *  The palette is deliberately editorial: ivory/parchment ground, ink-black
 *  headlines, antique-gold rules, deep crimson eyebrow, slate-blue meta. No
 *  loud greens — the school's forest-green primary only appears as a faint
 *  tint so the card still feels at home in the existing theme.
 *
 *  Props:
 *    • item      – NewsItem from useNews()
 *    • index     – position in the list (used for the journal article number)
 *    • featured  – when true, renders the larger 2-col layout for the lead
 *                  story (homepage hero news + /news page hero)
 *    • onListen  – callback when the "Listen" pill is clicked; receives the
 *                  mouse event so the parent can prevent navigation
 *  ───────────────────────────────────────────────────────────────────────── */

interface Props {
  item: NewsItem;
  index?: number;
  featured?: boolean;
  onListen?: (item: NewsItem, e: React.MouseEvent) => void;
}

/* Tiny roman numerals for the journal article number — supports up to ~20. */
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

/* Ornamental corner tick — used on image & masthead frames. */
const CornerTicks = () => (
  <>
    <span className="pointer-events-none absolute top-3 left-3 w-2.5 h-2.5 border-t-[1.5px] border-l-[1.5px] border-gold/80" />
    <span className="pointer-events-none absolute top-3 right-3 w-2.5 h-2.5 border-t-[1.5px] border-r-[1.5px] border-gold/80" />
    <span className="pointer-events-none absolute bottom-3 left-3 w-2.5 h-2.5 border-b-[1.5px] border-l-[1.5px] border-gold/80" />
    <span className="pointer-events-none absolute bottom-3 right-3 w-2.5 h-2.5 border-b-[1.5px] border-r-[1.5px] border-gold/80" />
  </>
);

/* ── Masthead: shown when an article has no photo ── */
const Masthead = ({
  title,
  lang,
  size = "sm",
}: {
  title: string;
  lang: "ur" | "en";
  size?: "sm" | "lg";
}) => {
  const initial = (title?.trim()?.[0] || "G").toUpperCase();
  const big = size === "lg";
  return (
    <div
      className="w-full h-full relative overflow-hidden"
      style={{
        background:
          "linear-gradient(160deg, hsl(42 45% 95%) 0%, hsl(40 38% 91%) 55%, hsl(36 32% 86%) 100%)",
      }}
    >
      {/* concentric gold rings, off-center */}
      <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full border border-gold/25" />
      <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full border border-gold/15" />
      <div className="absolute -left-8 -bottom-8 w-28 h-28 rounded-full border border-gold/15" />

      {/* hairline inner frame */}
      <div className="absolute inset-3 border border-gold/15 rounded-md" />
      <CornerTicks />

      {/* opening-quote glyph */}
      <Quote
        className={`absolute text-primary/10 rotate-180 ${
          big ? "w-16 h-16 top-6 left-6" : "w-10 h-10 top-4 left-4"
        }`}
        strokeWidth={1.5}
      />

      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 relative px-4">
        <span
          className={`font-display italic font-semibold text-primary leading-none ${
            big ? "text-7xl" : "text-5xl"
          }`}
          style={{ fontFamily: "var(--font-display)" }}
          dir={lang === "ur" ? "rtl" : "ltr"}
        >
          {initial}
        </span>
        <span className="text-[9px] font-bold uppercase tracking-[0.32em] text-primary/55">
          {lang === "ur" ? "سرکاری اعلان" : "Official Dispatch"}
        </span>
      </div>
    </div>
  );
};

/* ── Image with editorial framing ── */
const FramedImage = ({
  src,
  alt,
  lang,
}: {
  src: string;
  alt: string;
  lang: "ur" | "en";
}) => (
  <div className="w-full h-full relative overflow-hidden bg-secondary">
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="w-full h-full object-cover transition-transform duration-[800ms] ease-out group-hover:scale-[1.06]"
    />
    {/* sepia/ink wash so the image reads as a printed plate, not a stock photo */}
    <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/0 to-black/10" />
    <div className="absolute inset-0 ring-1 ring-inset ring-black/10" />
    <CornerTicks />
    <span className="absolute top-3 right-3 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.25em] bg-white/85 text-foreground/80 backdrop-blur-sm rounded-sm shadow-sm">
      {lang === "ur" ? "تصویر" : "Plate"}
    </span>
  </div>
);

/* ── The "Listen" pill ── */
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
    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide
               bg-gradient-to-r from-[hsl(348_55%_28%)] to-[hsl(348_50%_22%)] text-[hsl(45_40%_95%)]
               shadow-sm hover:shadow-md hover:brightness-110 active:scale-95 transition-all"
  >
    <Volume2 className="w-3 h-3" />
    <span>{lang === "ur" ? "سنئیں" : "Listen"}</span>
  </button>
);

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

  /* Date in "5 August 2026" form, plus a roman numeral article number. */
  const dateText = (() => {
    try {
      return format(new Date(item.created_at), "d MMMM yyyy");
    } catch {
      return "";
    }
  })();
  const articleNo = toRoman(index + 1);

  const handleListen = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onListen?.(item, e);
  };

  /* The detail route — clicking the card or "Read paper" arrow goes there. */
  const detailUrl = `/news/${item.id}`;

  /* ─── FEATURED LAYOUT (large 2-col, used for the lead story) ─── */
  if (featured) {
    return (
      <motion.article
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="group relative"
      >
        <Link
          to={detailUrl}
          className="block relative bg-card rounded-md overflow-hidden shadow-[0_10px_40px_-12px_rgba(0,0,0,0.25)] hover:shadow-[0_18px_55px_-12px_rgba(0,0,0,0.35)] transition-all duration-500 border border-gold/30"
        >
          {/* Top hairline rule with double-strike (journal masthead style) */}
          <div className="h-[3px] w-full bg-gradient-to-r from-transparent via-gold to-transparent" />
          <div className="h-px w-full bg-gold/40" />

          <div className="grid md:grid-cols-2">
            {/* Left: image / masthead */}
            <div className="relative h-72 md:h-auto md:min-h-[26rem] overflow-hidden">
              {item.image_url ? (
                <FramedImage src={item.image_url} alt={item.title} lang={titleLang} />
              ) : (
                <Masthead title={item.title} lang={titleLang} size="lg" />
              )}
              {/* Featured ribbon */}
              <span className="absolute top-4 left-4 z-10 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[9px] font-bold uppercase tracking-[0.28em] bg-[hsl(348_55%_28%)] text-[hsl(45_40%_95%)] shadow-md">
                <Sparkles className="w-3 h-3" />
                {titleLang === "ur" ? "نمایاں" : "Featured"}
              </span>
            </div>

            {/* Right: text */}
            <div className="p-7 md:p-10 flex flex-col justify-center relative">
              {/* Eyebrow */}
              <div className="flex items-center gap-3 mb-5">
                <span className="text-[10px] font-bold uppercase tracking-[0.32em] text-[hsl(348_55%_28%)]">
                  {titleLang === "ur" ? "خلاصہ" : "Abstract"}
                </span>
                <span className="h-px flex-1 bg-gradient-to-r from-[hsl(348_55%_28%_40%)] to-transparent" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                  №&nbsp;{articleNo}
                </span>
              </div>

              {/* Title */}
              <h2
                className="font-display font-semibold text-foreground leading-[1.1] text-3xl md:text-[2.4rem]"
                style={{ fontFamily: "var(--font-display)" }}
                dir={titleLang === "ur" ? "rtl" : "ltr"}
              >
                {item.title}
              </h2>

              {/* Meta row */}
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground mt-4 mb-5">
                <span className="font-semibold tracking-wide text-[hsl(215_45%_28%)]">
                  {dateText}
                </span>
                <span className="w-1 h-1 rounded-full bg-gold/60" />
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {readTime}
                </span>
                <span className="w-1 h-1 rounded-full bg-gold/60" />
                <span className="italic">
                  {titleLang === "ur" ? "اردو اشاعت" : "English Edition"}
                </span>
              </div>

              {/* Drop-cap content preview */}
              {item.content && (
                <p
                  className="text-foreground/80 leading-[1.75] text-[15px] line-clamp-4
                             first-letter:font-display first-letter:font-bold first-letter:text-[3.4rem]
                             first-letter:leading-[0.85] first-letter:mr-2 first-letter:float-left
                             first-letter:text-[hsl(348_55%_28%)]"
                  style={{ fontFamily: "var(--font-body)" }}
                  dir={contentLang === "ur" ? "rtl" : "ltr"}
                >
                  {item.content}
                </p>
              )}

              {/* Footer: signature + actions */}
              <div className="mt-7 pt-5 border-t border-gold/30 flex items-center justify-between flex-wrap gap-3">
                <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground italic">
                  — GHS Babi Khel · Editorial Desk
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

          {/* Bottom double rule */}
          <div className="h-px w-full bg-gold/40" />
          <div className="h-[3px] w-full bg-gradient-to-r from-transparent via-gold/70 to-transparent" />
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
        className="block h-full bg-card rounded-md overflow-hidden shadow-[0_6px_28px_-12px_rgba(0,0,0,0.22)] hover:shadow-[0_14px_38px_-12px_rgba(0,0,0,0.32)] transition-all duration-400 border border-gold/30 hover:border-gold/60 flex flex-col"
      >
        {/* Top double rule */}
        <div className="h-[3px] w-full bg-gradient-to-r from-transparent via-gold to-transparent" />
        <div className="h-px w-full bg-gold/40" />

        {/* Image / masthead */}
        <div className="relative h-44 overflow-hidden">
          {item.image_url ? (
            <FramedImage src={item.image_url} alt={item.title} lang={titleLang} />
          ) : (
            <Masthead title={item.title} lang={titleLang} size="sm" />
          )}
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col flex-1">
          {/* Eyebrow row */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[9px] font-bold uppercase tracking-[0.32em] text-[hsl(348_55%_28%)]">
              {titleLang === "ur" ? "خلاصہ" : "Abstract"}
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-[hsl(348_55%_28%_40%)] to-transparent" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              №&nbsp;{articleNo}
            </span>
          </div>

          {/* Title */}
          <h3
            className="font-display font-semibold text-foreground leading-[1.15] text-xl line-clamp-3"
            style={{ fontFamily: "var(--font-display)" }}
            dir={titleLang === "ur" ? "rtl" : "ltr"}
          >
            {item.title}
          </h3>

          {/* Meta */}
          <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-[10px] text-muted-foreground mt-3 mb-3">
            <span className="font-semibold tracking-wide text-[hsl(215_45%_28%)]">
              {dateText}
            </span>
            <span className="w-1 h-1 rounded-full bg-gold/60" />
            <span className="inline-flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" /> {readTime}
            </span>
          </div>

          {/* Drop-cap content preview */}
          {item.content && (
            <p
              className="text-foreground/75 leading-[1.7] text-[13px] line-clamp-3
                         first-letter:font-display first-letter:font-bold first-letter:text-[2.4rem]
                         first-letter:leading-[0.85] first-letter:mr-1.5 first-letter:float-left
                         first-letter:text-[hsl(348_55%_28%)]"
              style={{ fontFamily: "var(--font-body)" }}
              dir={contentLang === "ur" ? "rtl" : "ltr"}
            >
              {item.content}
            </p>
          )}

          {/* Footer */}
          <div className="mt-auto pt-4 flex items-center justify-between gap-2">
            <ListenPill onClick={handleListen} lang={titleLang} />
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[hsl(348_55%_28%)] group-hover:gap-1.5 transition-all">
              {titleLang === "ur" ? "مزید" : "Read"}
              <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Bottom double rule */}
        <div className="h-px w-full bg-gold/40" />
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-gold/70 to-transparent" />
      </Link>
    </motion.article>
  );
};

export default memo(EditorialNewsCard);
