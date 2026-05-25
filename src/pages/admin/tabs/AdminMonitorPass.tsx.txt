/**
 * AdminMonitorPass.tsx — GHS Babi Khel
 *
 * Class Monitor / Hall Pass Generator — Advanced edition
 *
 *  ✓ Multi-select pass reasons (any number)
 *  ✓ NO "Time Issued" field on the card
 *  ✓ Full QR code (no clipping) — card height enlarged & layout retuned
 *  ✓ Full-HD canvas (3× scale → 1200 × 2160 px PNG)
 *  ✓ Saved passes persist (localStorage) across class switches & tab changes
 *  ✓ Admin can EDIT Serial No / Session / EMIS / Date inline before generating
 *  ✓ Admin can EDIT or DELETE any previously saved pass
 *  ✓ School logo loaded live from Supabase school_settings.logo_url
 *  ✓ Light-blue Copilot-inspired palette throughout
 *
 *  File location: src/pages/admin/tabs/AdminMonitorPass.tsx
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import QRCode from "qrcode";
import {
  ShieldCheck, Printer, Download, Trash2, Pencil, Save, X, Plus,
  BookOpen, Coffee, FileText, AlertCircle, UserCheck, Clock, Sparkles,
  Hash, Calendar, Building2, Award, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import { useSchoolSettings, fallbackSettings } from "@/hooks/useSchoolSettings";

/* ──────────────────────────────────────────────────────────────────────────
   School defaults
   ────────────────────────────────────────────────────────────────────────── */
const SCHOOL_NAME = "GOVERNMENT HIGH SCHOOL";
const SCHOOL_SUB  = "GHS Babi Khel · District Mohmand · KPK";
const DEFAULT_SESSION = `${new Date().getFullYear()}–${new Date().getFullYear() + 1}`;
const DEFAULT_EMIS = "60673";
const CLASSES = ["6", "7", "8", "9", "10"];
const STORAGE_KEY = "ghs.monitorPasses.v2";

/* ──────────────────────────────────────────────────────────────────────────
   Reasons
   ────────────────────────────────────────────────────────────────────────── */
interface Reason {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
}

// Unified light-blue / Copilot palette — every chip uses the same brand blue
const CHIP_COLOR = "#2563eb";

const REASONS: Reason[] = [
  { id: "canteen",   label: "Canteen / Mess",      icon: <Coffee className="w-4 h-4" />,      color: CHIP_COLOR },
  { id: "restroom",  label: "Restroom / Break",    icon: <Clock className="w-4 h-4" />,       color: CHIP_COLOR },
  { id: "office",    label: "Official Errand",     icon: <FileText className="w-4 h-4" />,    color: CHIP_COLOR },
  { id: "library",   label: "Library Visit",       icon: <BookOpen className="w-4 h-4" />,    color: CHIP_COLOR },
  { id: "principal", label: "Principal's Office",  icon: <UserCheck className="w-4 h-4" />,   color: CHIP_COLOR },
  { id: "medical",   label: "Medical / First Aid", icon: <AlertCircle className="w-4 h-4" />, color: CHIP_COLOR },
];

const REASON_BY_ID: Record<string, Reason> =
  Object.fromEntries(REASONS.map((r) => [r.id, r]));

/* ──────────────────────────────────────────────────────────────────────────
   Canvas dimensions — full HD on download (CSS-displayed at 400×720)
   ────────────────────────────────────────────────────────────────────────── */
const CARD_W = 400;
const CARD_H = 720;
const SCALE  = 4; // 4× = 1600 × 2880 PNG output (Full HD+)

/* ──────────────────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────────────────── */
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
const pad2 = (n: number) => String(n).padStart(2, "0");

function generateSerial(cls: string, reasonIds: string[]): string {
  const now = new Date();
  const rkey = reasonIds.length === 0
    ? "GEN"
    : reasonIds.length === 1
      ? reasonIds[0].slice(0, 3).toUpperCase()
      : "MUL";
  const rand = Math.floor(Math.random() * 900 + 100);
  return `MP-${cls}-${rkey}-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${rand}`;
}
const todayStr = () =>
  new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

/* ──────────────────────────────────────────────────────────────────────────
   Persistence
   ────────────────────────────────────────────────────────────────────────── */
interface SavedPass {
  id: string;          // uuid-ish
  cls: string;
  reasonIds: string[];
  serial: string;
  session: string;
  emis: string;
  date: string;
  dataUrl: string;     // PNG preview
  createdAt: number;
}

function loadAll(): SavedPass[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function saveAll(list: SavedPass[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

/* ──────────────────────────────────────────────────────────────────────────
   Canvas renderer
   ────────────────────────────────────────────────────────────────────────── */
async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

interface RenderInput {
  cls: string;
  reasons: Reason[];     // 1..n
  serial: string;
  date: string;
  session: string;
  emis: string;
  logoUrl: string | null;
}

async function renderPass(input: RenderInput): Promise<HTMLCanvasElement> {
  const { cls, reasons, serial, date, session, emis, logoUrl } = input;

  const CW = CARD_W * SCALE;
  const CH = CARD_H * SCALE;
  const canvas = document.createElement("canvas");
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const W = CARD_W;
  const H = CARD_H;

  /* 1. Card background — soft light-blue, Copilot-style */
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0,    "#eaf4ff");
  bgGrad.addColorStop(0.5,  "#f4faff");
  bgGrad.addColorStop(1,    "#dbeafe");
  rrect(ctx, 0, 0, W, H, 24);
  ctx.fillStyle = bgGrad;
  ctx.fill();

  // Subtle dotted grid
  ctx.save();
  ctx.fillStyle = "#b9d6fb";
  ctx.globalAlpha = 0.35;
  for (let x = 12; x < W; x += 20) {
    for (let y = 12; y < H; y += 20) {
      ctx.beginPath();
      ctx.arc(x, y, 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // Outer border
  ctx.save();
  rrect(ctx, 1.2, 1.2, W - 2.4, H - 2.4, 23);
  ctx.strokeStyle = "#60a5fa";
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.85;
  ctx.stroke();
  ctx.restore();

  /* 2. Header band — Copilot light-blue gradient */
  const HDR_H = 134;
  const hdrGrad = ctx.createLinearGradient(0, 0, W, HDR_H);
  hdrGrad.addColorStop(0,   "#1e3a8a");
  hdrGrad.addColorStop(0.5, "#2563eb");
  hdrGrad.addColorStop(1,   "#1e3a8a");
  ctx.save();
  rrect(ctx, 0, 0, W, HDR_H + 22, 24);
  ctx.clip();
  ctx.fillStyle = hdrGrad;
  ctx.fillRect(0, 0, W, HDR_H);
  ctx.restore();
  ctx.fillStyle = hdrGrad;
  ctx.fillRect(0, HDR_H - 22, W, 22);

  // Header shine
  ctx.save();
  ctx.strokeStyle = "#93c5fd";
  ctx.lineWidth = 0.8;
  ctx.globalAlpha = 0.18;
  for (let x = -H; x < W + H; x += 26) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + HDR_H, HDR_H); ctx.stroke();
  }
  ctx.restore();

  // Logo
  const LOGO_R = 34;
  const LOGO_X = W / 2;
  const LOGO_Y = 44;

  // Glow ring
  ctx.save();
  const glow = ctx.createRadialGradient(LOGO_X, LOGO_Y, LOGO_R - 2, LOGO_X, LOGO_Y, LOGO_R + 12);
  glow.addColorStop(0, "rgba(147,197,253,0.65)");
  glow.addColorStop(1, "rgba(147,197,253,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(LOGO_X, LOGO_Y, LOGO_R + 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // White circle backing
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(LOGO_X, LOGO_Y, LOGO_R + 3, 0, Math.PI * 2);
  ctx.fill();

  // Logo image (Supabase) OR fallback letters
  const logo = logoUrl ? await loadImage(logoUrl) : null;
  ctx.save();
  ctx.beginPath();
  ctx.arc(LOGO_X, LOGO_Y, LOGO_R, 0, Math.PI * 2);
  ctx.clip();
  if (logo) {
    ctx.drawImage(logo, LOGO_X - LOGO_R, LOGO_Y - LOGO_R, LOGO_R * 2, LOGO_R * 2);
  } else {
    // Crest-style fallback so the disc never looks empty
    const fg = ctx.createLinearGradient(LOGO_X - LOGO_R, LOGO_Y - LOGO_R, LOGO_X + LOGO_R, LOGO_Y + LOGO_R);
    fg.addColorStop(0, "#1e3a8a");
    fg.addColorStop(1, "#3b82f6");
    ctx.fillStyle = fg;
    ctx.fillRect(LOGO_X - LOGO_R, LOGO_Y - LOGO_R, LOGO_R * 2, LOGO_R * 2);
    ctx.fillStyle = "#fde68a";
    ctx.font = "bold 26px 'Georgia', serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("GHS", LOGO_X, LOGO_Y);
  }
  ctx.restore();
  ctx.textBaseline = "alphabetic";

  // School name
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 15px 'Georgia', serif";
  ctx.textAlign = "center";
  ctx.fillText(SCHOOL_NAME, W / 2, LOGO_Y + LOGO_R + 22);

  ctx.fillStyle = "#bfdbfe";
  ctx.font = "10.5px 'Georgia', serif";
  ctx.fillText(SCHOOL_SUB, W / 2, LOGO_Y + LOGO_R + 36);

  /* 3. Gold divider */
  const goldGrad = ctx.createLinearGradient(0, 0, W, 0);
  goldGrad.addColorStop(0,   "transparent");
  goldGrad.addColorStop(0.1, "#d4a017");
  goldGrad.addColorStop(0.5, "#fbe78b");
  goldGrad.addColorStop(0.9, "#d4a017");
  goldGrad.addColorStop(1,   "transparent");
  ctx.fillStyle = goldGrad;
  ctx.fillRect(0, HDR_H, W, 3);

  /* 4. MONITOR PASS title pill */
  const TITLE_Y = HDR_H + 30;
  const pillGrad = ctx.createLinearGradient(W * 0.1, 0, W * 0.9, 0);
  pillGrad.addColorStop(0,   "#1d4ed8");
  pillGrad.addColorStop(0.5, "#3b82f6");
  pillGrad.addColorStop(1,   "#1d4ed8");
  ctx.save();
  rrect(ctx, W * 0.08, TITLE_Y - 14, W * 0.84, 42, 21);
  ctx.fillStyle = pillGrad;
  ctx.fill();
  ctx.shadowColor = "#60a5fa";
  ctx.shadowBlur  = 14;
  rrect(ctx, W * 0.08, TITLE_Y - 14, W * 0.84, 42, 21);
  ctx.strokeStyle = "#bfdbfe";
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px 'Georgia', serif";
  ctx.textAlign = "center";
  ctx.fillText("✦  MONITOR PASS  ✦", W / 2, TITLE_Y + 14);

  /* 5. Class badge */
  const CLS_Y = TITLE_Y + 58;
  ctx.fillStyle = "#1e3a8a";
  ctx.font = "bold 11px 'Georgia', serif";
  ctx.textAlign = "center";
  ctx.fillText("CLASS / GRADE", W / 2, CLS_Y);

  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 44px 'Georgia', serif";
  ctx.fillText(`Class ${cls}`, W / 2, CLS_Y + 44);

  const ulGrad = ctx.createLinearGradient(W * 0.25, 0, W * 0.75, 0);
  ulGrad.addColorStop(0,   "transparent");
  ulGrad.addColorStop(0.3, "#3b82f6");
  ulGrad.addColorStop(0.7, "#3b82f6");
  ulGrad.addColorStop(1,   "transparent");
  ctx.fillStyle = ulGrad;
  ctx.fillRect(W * 0.25, CLS_Y + 52, W * 0.5, 2);

  /* 6. Purpose block — supports multiple reasons */
  const RSN_Y = CLS_Y + 74;
  ctx.fillStyle = "#1e3a8a";
  ctx.font = "bold 10.5px 'Georgia', serif";
  ctx.textAlign = "center";
  ctx.fillText(reasons.length > 1 ? "PURPOSES OF VISIT" : "PURPOSE OF VISIT", W / 2, RSN_Y);

  // Build chip rows (wrap)
  const chipsY = RSN_Y + 12;
  const chipH  = 26;
  const padX   = 12;
  ctx.font     = "bold 11.5px 'Inter', system-ui, sans-serif";

  // Measure & layout into rows
  const widths = reasons.map((r) => ctx.measureText(r.label).width + padX * 2);
  const gap = 6;
  const rows: { items: { r: Reason; w: number }[]; total: number }[] = [];
  let curr: { r: Reason; w: number }[] = [];
  let currW = 0;
  reasons.forEach((r, i) => {
    const w = widths[i];
    if (curr.length && currW + gap + w > W - 32) {
      rows.push({ items: curr, total: currW });
      curr = []; currW = 0;
    }
    if (curr.length) currW += gap;
    curr.push({ r, w });
    currW += w;
  });
  if (curr.length) rows.push({ items: curr, total: currW });

  const maxRows = Math.min(rows.length, 2); // keep card height stable
  let cy = chipsY;
  for (let ri = 0; ri < maxRows; ri++) {
    const row = rows[ri];
    let cx = (W - row.total) / 2;
    for (const { r, w } of row.items) {
      ctx.save();
      ctx.shadowColor = r.color;
      ctx.shadowBlur  = 8;
      rrect(ctx, cx, cy, w, chipH, 13);
      ctx.fillStyle = r.color;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11.5px 'Inter', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(r.label, cx + w / 2, cy + 17);
      ctx.restore();
      cx += w + gap;
    }
    cy += chipH + 6;
  }
  // If we truncated, show "+N more"
  if (rows.length > maxRows) {
    const more = reasons.length - rows.slice(0, maxRows).reduce((s, r) => s + r.items.length, 0);
    ctx.fillStyle = "#1e3a8a";
    ctx.font = "bold 10px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`+${more} more`, W / 2, cy + 12);
    cy += 14;
  }

  /* 7. Info rows — NO Time Issued */
  const INFO_Y = Math.max(cy + 10, RSN_Y + 70);
  const infoFields: [string, string][] = [
    ["Serial No.", serial],
    ["Date",       date],
    ["Session",    session],
    ["EMIS Code",  emis],
  ];
  const FX = 22;
  const FW = W - 44;
  let fy = INFO_Y;
  for (const [label, value] of infoFields) {
    ctx.fillStyle = "rgba(30,58,138,0.07)";
    rrect(ctx, FX, fy, FW, 30, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(96,165,250,0.35)";
    ctx.lineWidth = 0.8;
    rrect(ctx, FX, fy, FW, 30, 8);
    ctx.stroke();

    ctx.fillStyle = "#1d4ed8";
    ctx.font = "bold 9.5px 'Courier New', monospace";
    ctx.textAlign = "left";
    ctx.fillText(label.toUpperCase(), FX + 10, fy + 12);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 11.5px 'Courier New', monospace";
    ctx.textAlign = "right";
    const v = value.length > 30 ? value.slice(0, 29) + "…" : value;
    ctx.fillText(v, FX + FW - 10, fy + 20);

    fy += 34;
  }

  /* 8. QR — guaranteed inside the card */
  const BOT_H = 30;
  const QR_LABEL_H = 14;
  const availBottom = H - BOT_H - 8 - QR_LABEL_H; // top of QR label = availBottom; QR sits above
  const QR_SZ = Math.min(110, availBottom - fy - 16);
  const QR_Y = fy + 8;
  const QR_X = (W - QR_SZ) / 2;

  const qrPayload = [
    "GHS Babi Khel Monitor Pass",
    `Class: ${cls}`,
    `Purpose: ${reasons.map((r) => r.label).join(", ") || "—"}`,
    `Serial: ${serial}`,
    `Date: ${date}`,
    `Session: ${session}`,
    `EMIS: ${emis}`,
  ].join("\n");
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    width: Math.round(QR_SZ * SCALE * 1.5),
    margin: 1,
    color: { dark: "#0f172a", light: "#ffffff" },
    errorCorrectionLevel: "M",
  });

  // White card + blue border
  ctx.fillStyle = "#ffffff";
  rrect(ctx, QR_X - 7, QR_Y - 7, QR_SZ + 14, QR_SZ + 14, 10);
  ctx.fill();
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 1.4;
  rrect(ctx, QR_X - 7, QR_Y - 7, QR_SZ + 14, QR_SZ + 14, 10);
  ctx.stroke();

  const qrImg = await loadImage(qrDataUrl);
  if (qrImg) ctx.drawImage(qrImg, QR_X, QR_Y, QR_SZ, QR_SZ);

  ctx.fillStyle = "#1d4ed8";
  ctx.font = "bold 9px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText("SCAN TO VERIFY PASS", W / 2, QR_Y + QR_SZ + 13);

  /* 9. Bottom bar */
  const botGrad = ctx.createLinearGradient(0, 0, W, 0);
  botGrad.addColorStop(0,   "#1e3a8a");
  botGrad.addColorStop(0.5, "#2563eb");
  botGrad.addColorStop(1,   "#1e3a8a");
  ctx.save();
  rrect(ctx, 0, H - BOT_H - 22, W, BOT_H + 22, 24);
  ctx.clip();
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, H - BOT_H, W, BOT_H);
  ctx.restore();

  ctx.fillStyle = "#bfdbfe";
  ctx.font = "10px 'Georgia', serif";
  ctx.textAlign = "center";
  ctx.fillText("GHS BABI KHEL  ·  DISTRICT MOHMAND  ·  KPK", W / 2, H - BOT_H + 18);

  return canvas;
}

/* ──────────────────────────────────────────────────────────────────────────
   Component
   ────────────────────────────────────────────────────────────────────────── */
const AdminMonitorPass = () => {
  const { data: school } = useSchoolSettings();
  const logoUrl = school?.logo_url ?? fallbackSettings.logo_url;

  const [selectedClass, setSelectedClass] = useState<string>("6");
  const [selectedReasonIds, setSelectedReasonIds] = useState<string[]>([REASONS[0].id]);
  const [serial,  setSerial]  = useState<string>(() => generateSerial("6", [REASONS[0].id]));
  const [date,    setDate]    = useState<string>(todayStr());
  const [session, setSession] = useState<string>(DEFAULT_SESSION);
  const [emis,    setEmis]    = useState<string>(school?.emis_code || DEFAULT_EMIS);

  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [saved, setSaved] = useState<SavedPass[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Hydrate emis from supabase when available
  useEffect(() => {
    if (school?.emis_code && !editingId) setEmis(school.emis_code);
  }, [school?.emis_code, editingId]);

  // Load persisted passes (so switching tabs/classes never loses them)
  useEffect(() => { setSaved(loadAll()); }, []);

  const selectedReasons = useMemo<Reason[]>(
    () => selectedReasonIds.map((id) => REASON_BY_ID[id]).filter(Boolean),
    [selectedReasonIds]
  );

  /* ── selection handlers ── */
  const toggleReason = (id: string) => {
    setSelectedReasonIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      setSerial(generateSerial(selectedClass, next));
      return next;
    });
    setPreviewUrl(null);
  };

  const handleClassChange = (cls: string) => {
    setSelectedClass(cls);
    setSerial(generateSerial(cls, selectedReasonIds));
    setPreviewUrl(null);
  };

  const regenerateSerial = () => {
    setSerial(generateSerial(selectedClass, selectedReasonIds));
    toast.success("New serial generated");
  };

  const resetForm = () => {
    setSelectedClass("6");
    setSelectedReasonIds([REASONS[0].id]);
    setSerial(generateSerial("6", [REASONS[0].id]));
    setDate(todayStr());
    setSession(DEFAULT_SESSION);
    setEmis(school?.emis_code || DEFAULT_EMIS);
    setPreviewUrl(null);
    setEditingId(null);
  };

  /* ── generate / save ── */
  const handleGenerate = async () => {
    if (selectedReasonIds.length === 0) {
      toast.error("Select at least one reason");
      return;
    }
    setGenerating(true);
    try {
      const canvas = await renderPass({
        cls: selectedClass,
        reasons: selectedReasons,
        serial,
        date,
        session,
        emis,
        logoUrl,
      });
      canvasRef.current = canvas;
      const dataUrl = canvas.toDataURL("image/png");
      setPreviewUrl(dataUrl);

      // Persist (insert or update)
      const list = loadAll();
      if (editingId) {
        const idx = list.findIndex((p) => p.id === editingId);
        if (idx !== -1) {
          list[idx] = {
            ...list[idx],
            cls: selectedClass,
            reasonIds: selectedReasonIds,
            serial, session, emis, date, dataUrl,
          };
        }
        toast.success("Pass updated");
      } else {
        const entry: SavedPass = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          cls: selectedClass,
          reasonIds: selectedReasonIds,
          serial, session, emis, date, dataUrl,
          createdAt: Date.now(),
        };
        list.unshift(entry);
        setEditingId(entry.id);
        toast.success("Pass generated & saved");
      }
      saveAll(list);
      setSaved(list);
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate pass");
    }
    setGenerating(false);
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `monitor-pass-class${selectedClass}-${serial}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
    toast.success("HD pass downloaded");
  };

  const handlePrint = () => {
    if (!previewUrl) return;
    const win = window.open("", "_blank", "width=520,height=820");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html><html><head><title>Monitor Pass - Class ${selectedClass}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh}
        img{max-width:400px;width:100%;height:auto;border-radius:14px;box-shadow:0 6px 28px rgba(30,58,138,.18)}
        @media print{body{margin:0}img{box-shadow:none;width:85mm;height:auto}}
      </style></head>
      <body><img src="${previewUrl}" onload="setTimeout(()=>window.print(),120)" /></body></html>
    `);
    win.document.close();
  };

  /* ── saved list actions ── */
  const handleEditSaved = (p: SavedPass) => {
    setEditingId(p.id);
    setSelectedClass(p.cls);
    setSelectedReasonIds(p.reasonIds);
    setSerial(p.serial);
    setDate(p.date);
    setSession(p.session);
    setEmis(p.emis);
    setPreviewUrl(p.dataUrl);
    toast("Editing pass — change fields & click Save", { icon: "✏️" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const handleDeleteSaved = (id: string) => {
    if (!confirm("Delete this pass permanently?")) return;
    const list = loadAll().filter((p) => p.id !== id);
    saveAll(list);
    setSaved(list);
    if (editingId === id) resetForm();
    toast.success("Pass deleted");
  };

  /* ──────────────────────────────────────────────────────────────────────
     UI
     ────────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-600" />
            Monitor Pass Generator
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Multi-reason · Full-HD · Persistent · Editable — for Classes 6–10
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800 text-xs font-semibold text-sky-700 dark:text-sky-300">
          <Sparkles className="w-3.5 h-3.5" />
          {saved.length} saved pass{saved.length === 1 ? "" : "es"}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Controls ─────────────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Class selector */}
          <div className="rounded-2xl border border-sky-200 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/30 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-sky-700 dark:text-sky-300 mb-3">
              Select Class
            </p>
            <div className="grid grid-cols-5 gap-2">
              {CLASSES.map((cls) => (
                <button
                  key={cls}
                  onClick={() => handleClassChange(cls)}
                  className={`relative py-3 rounded-xl text-sm font-bold transition-all duration-200 border-2 ${
                    selectedClass === cls
                      ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-sky-200 dark:shadow-blue-950 scale-105"
                      : "bg-white dark:bg-slate-900 text-foreground border-sky-200 dark:border-sky-900 hover:border-blue-400 hover:bg-sky-50 dark:hover:bg-sky-950"
                  }`}
                >
                  <span className="block text-[10px] font-medium opacity-70">Grade</span>
                  <span className="text-base">{cls}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Reasons — multi-select */}
          <div className="rounded-2xl border border-sky-200 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/30 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-widest text-sky-700 dark:text-sky-300">
                Purpose / Reason
                <span className="ml-2 text-[10px] font-medium text-muted-foreground normal-case">
                  (tap multiple)
                </span>
              </p>
              {selectedReasonIds.length > 0 && (
                <button
                  onClick={() => { setSelectedReasonIds([]); setPreviewUrl(null); }}
                  className="text-[11px] font-semibold text-blue-600 hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {REASONS.map((r) => {
                const active = selectedReasonIds.includes(r.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => toggleReason(r.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all duration-200 ${
                      active
                        ? "border-blue-500 bg-sky-100/70 dark:bg-blue-950/60 shadow-sm"
                        : "border-sky-200 dark:border-sky-900 bg-white dark:bg-slate-900 hover:border-blue-300 hover:bg-sky-50 dark:hover:bg-sky-950/50"
                    }`}
                  >
                    <span
                      className="flex items-center justify-center w-9 h-9 rounded-xl text-white shrink-0"
                      style={{ backgroundColor: r.color }}
                    >
                      {r.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{r.label}</p>
                    </div>
                    <span
                      className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                        active
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "border-sky-300 dark:border-sky-700"
                      }`}
                    >
                      {active && (
                        <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="currentColor">
                          <path d="M7.5 13.5 4 10l1.4-1.4 2.1 2.1 5.1-5.1L14 7z" />
                        </svg>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Editable details */}
          <div className="rounded-2xl border border-sky-200 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/30 p-5 shadow-sm space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-sky-700 dark:text-sky-300">
              Pass Details (editable)
            </p>

            <EditField icon={<Hash className="w-4 h-4" />} label="Serial No." value={serial}
              onChange={setSerial} action={
                <button onClick={regenerateSerial}
                  className="text-[11px] font-semibold text-blue-600 hover:underline">
                  Auto
                </button>
              } />

            <div className="grid grid-cols-2 gap-3">
              <EditField icon={<Calendar className="w-4 h-4" />} label="Date" value={date} onChange={setDate} />
              <EditField icon={<Award className="w-4 h-4" />} label="Session" value={session} onChange={setSession} />
            </div>

            <EditField icon={<Building2 className="w-4 h-4" />} label="EMIS Code" value={emis} onChange={setEmis} />
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-3">
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full h-12 text-base font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-sky-200 dark:shadow-blue-950 transition-all"
            >
              {generating ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Generating…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  {editingId ? <Save className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                  {editingId ? "Save Changes" : "Generate & Save Pass"}
                </span>
              )}
            </Button>

            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={handleDownload} disabled={!previewUrl}
                className="h-11 rounded-xl border-2 border-sky-200 dark:border-sky-800 font-semibold gap-2">
                <Download className="w-4 h-4" /> Download HD
              </Button>
              <Button variant="outline" onClick={handlePrint} disabled={!previewUrl}
                className="h-11 rounded-xl border-2 border-sky-200 dark:border-sky-800 font-semibold gap-2">
                <Printer className="w-4 h-4" /> Print
              </Button>
            </div>

            {editingId && (
              <button
                onClick={resetForm}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Create new pass instead
              </button>
            )}
          </div>
        </div>

        {/* ── Live preview ─────────────────────────────────────────── */}
        <div className="flex flex-col items-center justify-start gap-4">
          <p className="self-start text-xs font-bold uppercase tracking-widest text-sky-700 dark:text-sky-300">
            Live Preview
          </p>

          {previewUrl ? (
            <div className="relative w-full max-w-[340px] mx-auto">
              <div
                className="absolute inset-0 rounded-2xl blur-2xl opacity-30"
                style={{ background: "linear-gradient(135deg,#60a5fa,#1d4ed8)" }}
              />
              <img
                src={previewUrl}
                alt="Monitor Pass Preview"
                className="relative w-full rounded-2xl shadow-2xl border border-sky-200 dark:border-sky-800"
                style={{ aspectRatio: `${CARD_W}/${CARD_H}` }}
              />
            </div>
          ) : (
            <div
              className="w-full max-w-[340px] mx-auto rounded-2xl border-2 border-dashed border-sky-300 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/30 flex flex-col items-center justify-center gap-3 text-muted-foreground"
              style={{ aspectRatio: `${CARD_W}/${CARD_H}` }}
            >
              <ShieldCheck className="w-12 h-12 opacity-30" />
              <p className="text-sm font-medium text-center px-6">
                Pick class, reason(s) & details,<br />then click <strong>Generate Pass</strong>
              </p>
              <ChevronDown className="w-5 h-5 opacity-40 animate-bounce" />
            </div>
          )}

          {previewUrl && (
            <div className="flex flex-wrap justify-center gap-2 text-xs">
              <span className="px-3 py-1 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-semibold">
                Class {selectedClass}
              </span>
              {selectedReasons.slice(0, 3).map((r) => (
                <span key={r.id} className="px-3 py-1 rounded-full text-white font-semibold"
                  style={{ backgroundColor: r.color }}>
                  {r.label}
                </span>
              ))}
              {selectedReasons.length > 3 && (
                <span className="px-3 py-1 rounded-full bg-slate-200 dark:bg-slate-800 font-semibold">
                  +{selectedReasons.length - 3}
                </span>
              )}
              <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground font-mono">
                HD · {CARD_W * SCALE}×{CARD_H * SCALE}px
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Saved passes (persistent) ─────────────────────────────── */}
      <div className="rounded-2xl border border-sky-200 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/30 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-bold uppercase tracking-widest text-sky-700 dark:text-sky-300">
            Saved Passes
            <span className="ml-2 text-[10px] font-medium text-muted-foreground normal-case">
              (persist across class & tab switches)
            </span>
          </p>
          {saved.length > 0 && (
            <button
              onClick={() => {
                if (!confirm("Delete ALL saved passes?")) return;
                saveAll([]);
                setSaved([]);
                resetForm();
                toast.success("Cleared");
              }}
              className="text-[11px] font-semibold text-red-600 hover:underline"
            >
              Clear all
            </button>
          )}
        </div>

        {saved.length === 0 ? (
          <p className="text-sm text-center text-muted-foreground py-6">
            No saved passes yet. Generate one above and it will appear here.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {saved.map((p) => {
              const rs = p.reasonIds.map((id) => REASON_BY_ID[id]).filter(Boolean);
              return (
                <div key={p.id}
                  className={`group relative rounded-xl border-2 bg-white dark:bg-slate-900 overflow-hidden transition-all ${
                    editingId === p.id ? "border-blue-500 ring-2 ring-blue-300" : "border-sky-200 dark:border-sky-900 hover:border-blue-400"
                  }`}>
                  <img src={p.dataUrl} alt={`Pass ${p.serial}`}
                    className="w-full aspect-[400/720] object-cover" />
                  <div className="p-2 space-y-1">
                    <p className="text-[11px] font-bold text-foreground truncate">Class {p.cls} · {p.date}</p>
                    <p className="text-[10px] text-muted-foreground truncate font-mono">{p.serial}</p>
                    <div className="flex flex-wrap gap-1">
                      {rs.slice(0, 2).map((r) => (
                        <span key={r.id} className="px-1.5 py-0.5 rounded-md text-[9px] text-white font-semibold truncate"
                          style={{ backgroundColor: r.color, maxWidth: "100%" }}>
                          {r.label}
                        </span>
                      ))}
                      {rs.length > 2 && <span className="text-[9px] font-semibold text-muted-foreground">+{rs.length - 2}</span>}
                    </div>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 flex opacity-0 group-hover:opacity-100 transition bg-gradient-to-t from-black/80 to-transparent p-1.5 gap-1">
                    <button
                      onClick={() => handleEditSaved(p)}
                      className="flex-1 h-7 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-semibold flex items-center justify-center gap-1"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                    <button
                      onClick={() => handleDeleteSaved(p.id)}
                      className="h-7 px-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-[10px] font-semibold flex items-center justify-center"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
   Small inline-editable field
   ────────────────────────────────────────────────────────────────────────── */
function EditField({
  icon, label, value, onChange, action,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  action?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-900 px-3 py-2">
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-sky-700 dark:text-sky-300">
          {icon} {label}
        </span>
        <div className="flex items-center gap-2">
          {action}
          <button
            onClick={() => setEditing((v) => !v)}
            className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-1"
          >
            {editing ? <><X className="w-3 h-3" /> Done</> : <><Pencil className="w-3 h-3" /> Edit</>}
          </button>
        </div>
      </div>
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => e.key === "Enter" && setEditing(false)}
          className="w-full px-2 py-1.5 rounded-md border border-blue-400 bg-white dark:bg-slate-950 text-sm font-mono text-foreground outline-none focus:ring-2 focus:ring-blue-300"
        />
      ) : (
        <p className="text-sm font-mono text-foreground break-all">{value || <span className="text-muted-foreground italic">—</span>}</p>
      )}
    </div>
  );
}

export default AdminMonitorPass;
