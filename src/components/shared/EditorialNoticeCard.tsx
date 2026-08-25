import { memo, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Clock,
  Volume2,
  ArrowUpRight,
  Pin,
  AlertCircle,
  Feather,
  Quote,
  Calendar,
  Tag,
} from "lucide-react";
import { format } from "date-fns";
import {
  detectTextLanguage,
  estimateReadingTime,
} from "@/lib/newsUtils";
import type { Notice } from "@/hooks/useNotices";

/* ────────────────────────────────────────────────────────────────────────────
 *  EditorialNoticeCard  —  v1 (advanced)
 *  ─────────────────────────────────────────────────────────────────────────
 *  PhD-level research-paper-styled notice card. Companion to EditorialNewsCard
 *  — shares the same restrained palette (ivory ground, ink text, antique
 *  gold, deep crimson #7a1f2b, slate-blue #1e3a5f) and the same decorative
 *  vocabulary (paper grain, corner ticks, dual-tone gold rules, diamond
 *  ornaments, circular school seal, language-aware masthead).
 *
 *  Differences from EditorialNewsCard:
 *    • No image support (the notices table has no image_url column) — the
 *      MastheadEmblem is always shown.
 *    • Top-right badge stack reads Pinned / Urgent / Category, language-aware.
 *    • Compact single-column layout (no featured variant) — notices are short
 *      by nature and don't need a hero layout.
 *    • Footer shows "expires at" date if present (in addition to created_at).
 *
 *  Props:
 *    • item      – Notice from useNotices()
 *    • index     – list position (used for journal article number)
 *    • onListen  – callback fired when the "Listen" pill is clicked
 *  ───────────────────────────────────────────────────────────────────────── */

interface Props {
  item: Notice;
  index?: number;
  onListen?: (item: Notice, e: React.MouseEvent) => void;
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

const CornerTicks = () => (
  <>
    <span className="pointer-events-none absolute top-3 left-3 w-2.5 h-2.5 border-t-[1.5px] border-l-[1.5px] border-gold/80" />
    <span className="pointer-events-none absolute top-3 right-3 w-2.5 h-2.5 border-t-[1.5px] border-r-[1.5px] border-gold/80" />
    <span className="pointer-events-none absolute bottom-3 left-3 w-2.5 h-2.5 border-b-[1.5px] border-l-[1.5px] border-gold/80" />
    <span className="pointer-events-none absolute bottom-3 right-3 w-2.5 h-2.5 border-b-[1.5px] border-r-[1.5px] border-gold/80" />
  </>
);

/* ── Hexagonal school seal (logo image inside a gold-ringed frame) ──
 *  Same pointy-top hexagon + gold gradient ring as EditorialNewsCard's
 *  SchoolSeal — both card families share the same heraldic crest look.
 *  Adds "xs" (48px) for use in compact masthead. */
const HEXAGON_CLIP =
  "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

const SchoolSeal = ({
  size = "sm",
  className = "",
}: {
  size?: "xs" | "sm" | "md";
  className?: string;
}) => {
  const dims =
    size === "md" ? "w-20 h-20"
    : size === "xs" ? "w-12 h-12"
    : "w-16 h-16";
  return (
    <div
      className={`relative ${dims} ${className}`}
      style={{ filter: "drop-shadow(0 4px 8px rgba(122,31,43,0.35))" }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, hsl(43 70% 58%) 0%, hsl(43 85% 72%) 50%, hsl(43 70% 58%) 100%)",
          clipPath: HEXAGON_CLIP,
          WebkitClipPath: HEXAGON_CLIP,
        }}
      >
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

/* ──────────────────────────────────────────────────────────────────────────
 *  MastheadEmblem — always shown (notices have no images).
 * ────────────────────────────────────────────────────────────────────────── */
const MastheadEmblem = ({
  articleNo,
  lang,
}: {
  articleNo: string;
  lang: "ur" | "en";
}) => (
  <div className="w-full h-full relative overflow-hidden paper-grain flex flex-col items-center justify-center">
    {/* Concentric gold rings, off-center */}
    <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full border border-gold/25" />
    <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full border border-gold/15" />
    <div className="absolute -left-10 -bottom-10 w-32 h-32 rounded-full border border-gold/15" />

    {/* Hairline inner frame */}
    <div className="absolute inset-3 border border-gold/15 rounded-md" />
    <CornerTicks />

    {/* Subtle opening-quote watermark */}
    <Quote
      className="absolute text-primary/8 rotate-180 w-10 h-10 top-2 left-2"
      strokeWidth={1.2}
    />

    <div className="relative z-10 flex flex-col items-center gap-1 px-3">
      {/* Top line: EST · diamond · roman numeral */}
      <div className="flex items-center gap-1.5 text-[7px] font-bold uppercase tracking-[0.3em] text-primary/55">
        <span>EST. 2018</span>
        <Diamond className="bg-gold/70" />
        <span>№ {articleNo}</span>
      </div>

      <SchoolSeal size="xs" />

      {/* School name — language-aware (one language only) */}
      <div className="text-center min-h-[1.2rem]">
        {lang === "ur" ? (
          <p className="font-urdu-display text-primary text-[11px]" dir="rtl">
            گورنمنٹ ہائی سکول بابی خیل
          </p>
        ) : (
          <p
            className="font-display font-bold text-primary tracking-[0.15em] uppercase text-[10px]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            GHS Babi Khel
          </p>
        )}
      </div>

      {/* Dual-tone gold rule */}
      <div className="flex items-center gap-1.5 w-full max-w-[100px]">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent to-gold/70" />
        <Diamond className="bg-gold/80" />
        <div className="flex-1 h-px bg-gradient-to-l from-transparent to-gold/70" />
      </div>

      {/* Edition tag */}
      <p className="text-[7px] font-bold uppercase tracking-[0.32em] text-[hsl(348_55%_28%)]">
        {lang === "ur" ? "اطلاعیہ" : "Notice Dispatch"}
      </p>
    </div>
  </div>
);

/* ── "Listen" pill ── */
const ListenPill = ({
  onClick,
  lang,
}: {
  onClick: (e: React.MouseEvent) => void;
  lang: "ur" | "en";
}) => (
  <button
    onClick={onClick}
    aria-label={lang === "ur" ? "سننے کے لیے دبائیں" : "Listen to this notice"}
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
 *  Title — language-aware (compact: shrunk from text-xl/text-lg to text-base)
 * ────────────────────────────────────────────────────────────────────────── */
const Title = ({ title, lang }: { title: string; lang: "ur" | "en" }) => {
  if (lang === "ur") {
    return (
      <h3 dir="rtl" className="font-urdu-display text-foreground leading-[1.6] text-sm">
        {title}
      </h3>
    );
  }
  return (
    <h3
      dir="ltr"
      className="font-display font-semibold text-foreground leading-[1.12] text-base"
      style={{ fontFamily: "var(--font-display)" }}
    >
      {title}
    </h3>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
 *  Content preview — drop cap for English, plain Nastaliq for Urdu.
 *  Shrunk to text-[12px] line-clamp-2 to fit the smaller compact card.
 * ────────────────────────────────────────────────────────────────────────── */
const ContentPreview = ({ content, lang }: { content: string; lang: "ur" | "en" }) => {
  if (!content) return null;
  if (lang === "ur") {
    return (
      <p dir="rtl" className="font-urdu text-foreground/80 leading-[2] text-[12px] line-clamp-2">
        {content}
      </p>
    );
  }
  return (
    <p
      dir="ltr"
      className="text-foreground/80 leading-[1.6] line-clamp-2
                 first-letter:font-display first-letter:font-bold
                 first-letter:mr-1.5 first-letter:float-left
                 first-letter:text-[1.8rem] first-letter:leading-[0.85]
                 first-letter:text-[hsl(348_55%_28%)] text-[12px]"
      style={{ fontFamily: "var(--font-body)" }}
    >
      {content}
    </p>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
 *  EditorialNoticeCard — main component
 * ────────────────────────────────────────────────────────────────────────── */
const EditorialNoticeCard = ({ item, index = 0, onListen }: Props) => {
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
  const expiryText = (() => {
    if (!item.expires_at) return "";
    try { return format(new Date(item.expires_at), "d MMMM yyyy"); }
    catch { return ""; }
  })();
  const articleNo = toRoman(index + 1);
  const detailUrl = `/notices/${item.id}`;

  const handleListen = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onListen?.(item, e);
  };

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

        {/* Masthead emblem area — shrunk from h-44 (176px) to h-32 (128px) */}
        <div className="relative h-32 overflow-hidden">
          <MastheadEmblem articleNo={articleNo} lang={titleLang} />
          {/* Top-right badge stack: Pinned / Urgent / Category */}
          <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1">
            {item.is_pinned && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[7px] font-bold uppercase tracking-[0.25em] bg-gradient-to-r from-[hsl(43_70%_48%)] to-[hsl(43_80%_55%)] text-[hsl(348_55%_22%)] shadow-md ring-1 ring-[hsl(43_70%_48%)]/40">
                <Pin className="w-2 h-2" />
                {titleLang === "ur" ? "پن" : "Pinned"}
              </span>
            )}
            {item.is_urgent && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[7px] font-bold uppercase tracking-[0.25em] bg-[hsl(348_55%_28%)] text-[hsl(45_40%_95%)] shadow-md ring-1 ring-[hsl(348_55%_28%)]/30 animate-pulse">
                <AlertCircle className="w-2 h-2" />
                {titleLang === "ur" ? "فوری" : "Urgent"}
              </span>
            )}
          </div>
        </div>

        {/* Body — shrunk from p-5 to p-4, tighter spacing */}
        <div className="p-4 flex flex-col flex-1">
          {/* Eyebrow row: category + article number */}
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-[0.32em] text-[hsl(348_55%_28%)]">
              <Tag className="w-2 h-2" />
              {item.category}
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-[hsl(348_55%_28%_40%)] to-transparent" />
            <span className="text-[8px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              №&nbsp;{articleNo}
            </span>
          </div>

          {/* Title */}
          <Title title={item.title} lang={titleLang} />

          {/* Meta — date is prominent */}
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
            {expiryText && (
              <>
                <span className="w-1 h-1 rounded-full bg-gold/60 self-center" />
                <span className="inline-flex items-center gap-1 italic">
                  <Calendar className="w-2 h-2" />
                  {titleLang === "ur" ? "ختم" : "Expires"} {expiryText}
                </span>
              </>
            )}
          </div>

          {/* Content preview */}
          <ContentPreview content={item.content || ""} lang={contentLang} />

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

        {/* Subtle signature watermark bottom-left */}
        <span className="pointer-events-none absolute bottom-2 left-2 text-[7px] uppercase tracking-[0.25em] text-muted-foreground/40 italic flex items-center gap-1">
          <Feather className="w-2 h-2" />
          {titleLang === "ur" ? "اطلاعیہ محکمہ" : "Notice Desk"}
        </span>
      </Link>
    </motion.article>
  );
};

export default memo(EditorialNoticeCard);
