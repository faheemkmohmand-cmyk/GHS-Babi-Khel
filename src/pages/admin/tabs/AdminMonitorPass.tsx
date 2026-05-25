/**
 * AdminMonitorPass.tsx — GHS Babi Khel
 *
 * Class Monitor / Hall Pass Generator
 * ─ Portrait CR80-ish card (400 × 620 px displayed, 2× HD canvas for download)
 * ─ Premium deep-blue theme, Copilot-inspired dashboard UI
 * ─ Classes 6–10, multiple pass reasons
 * ─ Live preview, Print/Download button
 * ─ Fully mobile-friendly
 */

import { useState, useRef, useCallback } from "react";
import QRCode from "qrcode";
import {
  ShieldCheck, Printer, Download, ChevronDown,
  BookOpen, Coffee, FileText, AlertCircle, UserCheck, Clock, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

// ── School constants ──────────────────────────────────────────────────────────
const SCHOOL_NAME    = "GOVERNMENT HIGH SCHOOL";
const SCHOOL_SUB     = "GHS Babi Khel · District Mohmand · KPK";
const EMIS_CODE      = "60673";
const SESSION        = `${new Date().getFullYear()}–${new Date().getFullYear() + 1}`;

// ── Classes ───────────────────────────────────────────────────────────────────
const CLASSES = ["6", "7", "8", "9", "10"];

// ── Pass reasons ──────────────────────────────────────────────────────────────
interface Reason {
  id: string;
  label: string;
  urdu: string;
  icon: React.ReactNode;
  color: string; // badge bg
}

const REASONS: Reason[] = [
  { id: "canteen",   label: "Canteen / Mess",       urdu: "کینٹین",       icon: <Coffee   className="w-4 h-4" />, color: "#f59e0b" },
  { id: "restroom",  label: "Restroom / Break",      urdu: "واش روم",      icon: <Clock    className="w-4 h-4" />, color: "#06b6d4" },
  { id: "office",    label: "Official Errand",       urdu: "دفتری کام",    icon: <FileText className="w-4 h-4" />, color: "#8b5cf6" },
  { id: "library",   label: "Library Visit",         urdu: "لائبریری",     icon: <BookOpen className="w-4 h-4" />, color: "#10b981" },
  { id: "principal", label: "Principal's Office",    urdu: "پرنسپل آفس",   icon: <UserCheck className="w-4 h-4" />, color: "#ef4444" },
  { id: "medical",   label: "Medical / First Aid",   urdu: "طبی امداد",    icon: <AlertCircle className="w-4 h-4" />, color: "#f43f5e" },
];

// ── Canvas card dimensions ────────────────────────────────────────────────────
const CARD_W = 400;
const CARD_H = 620;
const SCALE  = 2; // 2× for HD download

// ── Helpers ───────────────────────────────────────────────────────────────────
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function pad2(n: number) { return String(n).padStart(2, "0"); }

function generateSerial(cls: string, reasonId: string): string {
  const now = new Date();
  return `MP-${cls}-${reasonId.slice(0, 3).toUpperCase()}-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`;
}

function getDateStr() {
  return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function getTimeStr() {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

// ── Embedded logo (GHS Babi Khel seal, same as ID card) ──────────────────────
const LOGO_B64 = "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";
const LOGO_SRC = `data:image/png;base64,${LOGO_B64}`;

// ── Main canvas renderer ──────────────────────────────────────────────────────
async function renderPass(
  cls: string,
  reason: Reason,
  serial: string,
  dateStr: string,
  timeStr: string
): Promise<HTMLCanvasElement> {
  const CW = CARD_W * SCALE;
  const CH = CARD_H * SCALE;

  const canvas = document.createElement("canvas");
  canvas.width  = CW;
  canvas.height = CH;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const W = CARD_W;
  const H = CARD_H;

  // ── 1. Card background — white with subtle blue tint ─────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0,   "#f0f7ff");
  bgGrad.addColorStop(1,   "#e8f1ff");
  rrect(ctx, 0, 0, W, H, 22);
  ctx.fillStyle = bgGrad;
  ctx.fill();

  // Subtle grid texture
  ctx.save();
  ctx.strokeStyle = "#c8deff";
  ctx.lineWidth = 0.6;
  ctx.globalAlpha = 0.35;
  for (let x = 0; x <= W; x += 18) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y <= H; y += 18) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Card outer glow border
  ctx.save();
  rrect(ctx, 1, 1, W - 2, H - 2, 21);
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 2.5;
  ctx.globalAlpha = 0.7;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();

  // ── 2. Deep-blue header ───────────────────────────────────────────────────
  const HDR_H = 130;
  const hdrGrad = ctx.createLinearGradient(0, 0, W, HDR_H);
  hdrGrad.addColorStop(0,   "#0f172a");
  hdrGrad.addColorStop(0.5, "#1e3a6e");
  hdrGrad.addColorStop(1,   "#0f172a");
  ctx.save();
  rrect(ctx, 0, 0, W, HDR_H + 22, 22);
  ctx.clip();
  ctx.fillStyle = hdrGrad;
  ctx.fillRect(0, 0, W, HDR_H);
  ctx.restore();
  ctx.fillStyle = hdrGrad;
  ctx.fillRect(0, HDR_H - 22, W, 22); // flat bottom seam

  // Header shimmer lines
  ctx.save();
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.18;
  for (let x = -H; x < W + H; x += 28) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + HDR_H, HDR_H); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Logo circle
  const LOGO_R = 30;
  const LOGO_X = W / 2;
  const LOGO_Y = 40;
  ctx.save();
  // Glow ring
  const glowGrad = ctx.createRadialGradient(LOGO_X, LOGO_Y, LOGO_R - 2, LOGO_X, LOGO_Y, LOGO_R + 10);
  glowGrad.addColorStop(0, "rgba(96,165,250,0.5)");
  glowGrad.addColorStop(1, "rgba(96,165,250,0)");
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(LOGO_X, LOGO_Y, LOGO_R + 10, 0, Math.PI * 2);
  ctx.fill();

  // White circle bg
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(LOGO_X, LOGO_Y, LOGO_R + 3, 0, Math.PI * 2);
  ctx.fill();

  // Logo
  const logo = new Image();
  logo.crossOrigin = "anonymous";
  await new Promise<void>((res) => {
    logo.onload = () => res();
    logo.onerror = () => res();
    logo.src = LOGO_SRC;
  });
  ctx.beginPath();
  ctx.arc(LOGO_X, LOGO_Y, LOGO_R, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(logo, LOGO_X - LOGO_R, LOGO_Y - LOGO_R, LOGO_R * 2, LOGO_R * 2);
  ctx.restore();

  // School name
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 15px 'Georgia', serif";
  ctx.textAlign = "center";
  ctx.fillText(SCHOOL_NAME, W / 2, LOGO_Y + LOGO_R + 18);

  ctx.fillStyle = "#93c5fd";
  ctx.font = "10.5px 'Georgia', serif";
  ctx.fillText(SCHOOL_SUB, W / 2, LOGO_Y + LOGO_R + 32);

  // ── 3. Gold accent divider ────────────────────────────────────────────────
  const goldGrad = ctx.createLinearGradient(0, 0, W, 0);
  goldGrad.addColorStop(0,   "transparent");
  goldGrad.addColorStop(0.1, "#d4a017");
  goldGrad.addColorStop(0.5, "#f5d060");
  goldGrad.addColorStop(0.9, "#d4a017");
  goldGrad.addColorStop(1,   "transparent");
  ctx.fillStyle = goldGrad;
  ctx.fillRect(0, HDR_H, W, 3);

  // ── 4. MONITOR PASS title block ───────────────────────────────────────────
  const TITLE_Y = HDR_H + 28;

  // Pill background for title
  const pillGrad = ctx.createLinearGradient(W * 0.1, 0, W * 0.9, 0);
  pillGrad.addColorStop(0, "#1e40af");
  pillGrad.addColorStop(0.5, "#2563eb");
  pillGrad.addColorStop(1, "#1e40af");
  ctx.save();
  rrect(ctx, W * 0.08, TITLE_Y - 14, W * 0.84, 44, 22);
  ctx.fillStyle = pillGrad;
  ctx.fill();

  // Glow on pill
  ctx.shadowColor = "#3b82f6";
  ctx.shadowBlur  = 18;
  rrect(ctx, W * 0.08, TITLE_Y - 14, W * 0.84, 44, 22);
  ctx.strokeStyle = "#60a5fa";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 21px 'Georgia', serif";
  ctx.textAlign = "center";
  ctx.letterSpacing = "3px";
  ctx.fillText("✦  MONITOR PASS  ✦", W / 2, TITLE_Y + 14);
  ctx.letterSpacing = "0px";

  // ── 5. CLASS badge ────────────────────────────────────────────────────────
  const CLS_Y = TITLE_Y + 56;

  ctx.fillStyle = "#1e3a6e";
  ctx.font = "bold 12px 'Georgia', serif";
  ctx.textAlign = "center";
  ctx.fillText("CLASS / GRADE", W / 2, CLS_Y);

  ctx.fillStyle = "#0f172a";
  ctx.font = `bold 48px 'Georgia', serif`;
  ctx.textAlign = "center";
  ctx.fillText(`Class ${cls}`, W / 2, CLS_Y + 48);

  // Underline accent
  const ulGrad = ctx.createLinearGradient(W * 0.25, 0, W * 0.75, 0);
  ulGrad.addColorStop(0,   "transparent");
  ulGrad.addColorStop(0.3, "#3b82f6");
  ulGrad.addColorStop(0.7, "#3b82f6");
  ulGrad.addColorStop(1,   "transparent");
  ctx.fillStyle = ulGrad;
  ctx.fillRect(W * 0.25, CLS_Y + 56, W * 0.5, 2);

  // ── 6. Reason / Purpose block ─────────────────────────────────────────────
  const RSN_Y = CLS_Y + 80;

  ctx.fillStyle = "#1e3a6e";
  ctx.font = "bold 11px 'Georgia', serif";
  ctx.textAlign = "center";
  ctx.fillText("PURPOSE OF VISIT", W / 2, RSN_Y);

  // Reason pill
  const rsnBg = reason.color;
  const rsnPillW = 240;
  const rsnPillH = 46;
  const rsnPillX = (W - rsnPillW) / 2;
  const rsnPillY = RSN_Y + 10;

  ctx.save();
  // Shadow
  ctx.shadowColor = rsnBg;
  ctx.shadowBlur  = 16;
  rrect(ctx, rsnPillX, rsnPillY, rsnPillW, rsnPillH, 23);
  ctx.fillStyle = rsnBg;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  // Reason text
  ctx.fillStyle = "#ffffff";
  ctx.font      = "bold 16px 'Georgia', serif";
  ctx.textAlign = "center";
  ctx.fillText(reason.label, W / 2, rsnPillY + 18);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font      = "13px 'Georgia', serif";
  ctx.fillText(reason.urdu, W / 2, rsnPillY + 34);

  // ── 7. Info fields ────────────────────────────────────────────────────────
  const INFO_Y = RSN_Y + 80;

  const infoFields: [string, string][] = [
    ["Serial No.",  serial],
    ["Date",        dateStr],
    ["Time Issued", timeStr],
    ["Session",     SESSION],
    ["EMIS Code",   EMIS_CODE],
  ];

  const FX = 24;
  const FW = W - 48;
  let fy  = INFO_Y;

  for (const [label, value] of infoFields) {
    // Row bg
    ctx.fillStyle = "rgba(30,58,110,0.07)";
    rrect(ctx, FX, fy, FW, 32, 8);
    ctx.fill();

    ctx.fillStyle = "#1d4ed8";
    ctx.font      = "bold 10px 'Courier New', monospace";
    ctx.textAlign = "left";
    ctx.fillText(label.toUpperCase(), FX + 10, fy + 13);

    ctx.fillStyle = "#0f172a";
    ctx.font      = "bold 12px 'Courier New', monospace";
    ctx.textAlign = "right";
    const maxLen = 28;
    const v = value.length > maxLen ? value.slice(0, maxLen - 1) + "…" : value;
    ctx.fillText(v, FX + FW - 10, fy + 20);

    fy += 36;
  }

  // ── 8. QR Code ────────────────────────────────────────────────────────────
  const QR_Y = fy + 10;
  const QR_SZ = 100;
  const QR_X  = (W - QR_SZ) / 2;

  const qrDataUrl = await QRCode.toDataURL(
    `GHS Babi Khel Monitor Pass\nClass: ${cls}\nPurpose: ${reason.label}\nSerial: ${serial}\nDate: ${dateStr}\nEMIS: ${EMIS_CODE}`,
    { width: QR_SZ * 2, margin: 1, color: { dark: "#0f172a", light: "#f0f7ff" }, errorCorrectionLevel: "M" }
  );

  // QR background
  ctx.fillStyle = "#ffffff";
  rrect(ctx, QR_X - 8, QR_Y - 8, QR_SZ + 16, QR_SZ + 16, 12);
  ctx.fill();
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth   = 1.5;
  rrect(ctx, QR_X - 8, QR_Y - 8, QR_SZ + 16, QR_SZ + 16, 12);
  ctx.stroke();

  const qrImg = new Image();
  qrImg.src = qrDataUrl;
  await new Promise<void>((res) => { qrImg.onload = () => res(); qrImg.onerror = () => res(); });
  ctx.drawImage(qrImg, QR_X, QR_Y, QR_SZ, QR_SZ);

  ctx.fillStyle = "#1d4ed8";
  ctx.font      = "bold 9px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText("SCAN TO VERIFY PASS", W / 2, QR_Y + QR_SZ + 16);

  // ── 9. Bottom bar ─────────────────────────────────────────────────────────
  const BOT_H = 30;
  const botGrad = ctx.createLinearGradient(0, 0, W, 0);
  botGrad.addColorStop(0,   "#0f172a");
  botGrad.addColorStop(0.5, "#1e3a6e");
  botGrad.addColorStop(1,   "#0f172a");
  ctx.save();
  rrect(ctx, 0, H - BOT_H - 22, W, BOT_H + 22, 22);
  ctx.clip();
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, H - BOT_H, W, BOT_H);
  ctx.restore();
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, H - BOT_H - 5, W, 5);

  ctx.fillStyle = "#93c5fd";
  ctx.font      = "10px 'Georgia', serif";
  ctx.textAlign = "center";
  ctx.fillText("GHS BABI KHEL  ·  DISTRICT MOHMAND  ·  KPK", W / 2, H - BOT_H + 16);

  return canvas;
}

// ── React component ───────────────────────────────────────────────────────────
const AdminMonitorPass = () => {
  const [selectedClass,  setSelectedClass]  = useState<string>("6");
  const [selectedReason, setSelectedReason] = useState<Reason>(REASONS[0]);
  const [generating,     setGenerating]     = useState(false);
  const [previewUrl,     setPreviewUrl]     = useState<string | null>(null);
  const [serial,         setSerial]         = useState(() => generateSerial("6", REASONS[0].id));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Re-generate serial when class or reason changes
  const updateSerial = useCallback((cls: string, reasonId: string) => {
    setSerial(generateSerial(cls, reasonId));
  }, []);

  const handleClassChange = (cls: string) => {
    setSelectedClass(cls);
    updateSerial(cls, selectedReason.id);
    setPreviewUrl(null);
  };

  const handleReasonChange = (r: Reason) => {
    setSelectedReason(r);
    updateSerial(selectedClass, r.id);
    setPreviewUrl(null);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const newSerial = generateSerial(selectedClass, selectedReason.id);
      setSerial(newSerial);
      const canvas = await renderPass(
        selectedClass,
        selectedReason,
        newSerial,
        getDateStr(),
        getTimeStr()
      );
      canvasRef.current = canvas;
      setPreviewUrl(canvas.toDataURL("image/png"));
      toast.success("Pass generated!");
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate pass");
    }
    setGenerating(false);
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `monitor-pass-class${selectedClass}-${selectedReason.id}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
    toast.success("Pass downloaded!");
  };

  const handlePrint = () => {
    if (!previewUrl) return;
    const win = window.open("", "_blank", "width=500,height=750");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Monitor Pass - Class ${selectedClass}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: white; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
          img  { max-width: 400px; width: 100%; height: auto; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.15); }
          @media print {
            body { margin: 0; }
            img  { box-shadow: none; width: 85mm; height: auto; }
          }
        </style>
      </head>
      <body>
        <img src="${previewUrl}" onload="window.print();" />
      </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-600" />
            Monitor Pass Generator
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Generate class monitor / hall passes for GHS Babi Khel · Portrait HD cards
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-xs font-semibold text-blue-700 dark:text-blue-300">
          <Sparkles className="w-3.5 h-3.5" />
          Class 6 – 10
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Controls panel ─────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Class selector */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Select Class
            </p>
            <div className="grid grid-cols-5 gap-2">
              {CLASSES.map((cls) => (
                <button
                  key={cls}
                  onClick={() => handleClassChange(cls)}
                  className={`relative py-3 rounded-xl text-sm font-bold transition-all duration-200 border-2 ${
                    selectedClass === cls
                      ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200 dark:shadow-blue-900 scale-105"
                      : "bg-background text-foreground border-border hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950"
                  }`}
                >
                  <span className="block text-[10px] font-medium opacity-70">Grade</span>
                  <span className="text-base">{cls}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Reason selector */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Purpose / Reason
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {REASONS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleReasonChange(r)}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all duration-200 ${
                    selectedReason.id === r.id
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-sm"
                      : "border-border bg-background hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50"
                  }`}
                >
                  <span
                    className="flex items-center justify-center w-9 h-9 rounded-xl text-white shrink-0"
                    style={{ backgroundColor: r.color }}
                  >
                    {r.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{r.label}</p>
                    <p className="text-xs text-muted-foreground" dir="rtl">{r.urdu}</p>
                  </div>
                  {selectedReason.id === r.id && (
                    <div className="ml-auto w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Serial preview */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
              Pass Serial
            </p>
            <code className="block w-full px-4 py-3 rounded-xl bg-muted text-foreground text-sm font-mono tracking-wider border border-border break-all">
              {serial}
            </code>
          </div>

          {/* Generate button */}
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full h-12 text-base font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200 dark:shadow-blue-900 transition-all"
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Generating…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" />
                Generate Pass
              </span>
            )}
          </Button>

          {/* Download / Print */}
          {previewUrl && (
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={handleDownload}
                className="h-11 rounded-xl border-2 font-semibold gap-2"
              >
                <Download className="w-4 h-4" />
                Download PNG
              </Button>
              <Button
                variant="outline"
                onClick={handlePrint}
                className="h-11 rounded-xl border-2 font-semibold gap-2"
              >
                <Printer className="w-4 h-4" />
                Print Pass
              </Button>
            </div>
          )}
        </div>

        {/* ── Live preview ───────────────────────────────────────────── */}
        <div className="flex flex-col items-center justify-start gap-4">
          <p className="self-start text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Live Preview
          </p>

          {previewUrl ? (
            <div className="relative w-full max-w-[340px] mx-auto">
              {/* Glow */}
              <div
                className="absolute inset-0 rounded-2xl blur-2xl opacity-30"
                style={{ background: "linear-gradient(135deg,#3b82f6,#1d4ed8)" }}
              />
              <img
                src={previewUrl}
                alt="Monitor Pass Preview"
                className="relative w-full rounded-2xl shadow-2xl border border-blue-200 dark:border-blue-800"
                style={{ aspectRatio: `${CARD_W}/${CARD_H}` }}
              />
            </div>
          ) : (
            <div
              className="w-full max-w-[340px] mx-auto rounded-2xl border-2 border-dashed border-border bg-muted/40 flex flex-col items-center justify-center gap-3 text-muted-foreground"
              style={{ aspectRatio: `${CARD_W}/${CARD_H}` }}
            >
              <ShieldCheck className="w-12 h-12 opacity-30" />
              <p className="text-sm font-medium text-center px-6">
                Select a class and reason,<br />then click <strong>Generate Pass</strong>
              </p>
              <ChevronDown className="w-5 h-5 opacity-40 animate-bounce" />
            </div>
          )}

          {/* Info chips */}
          {previewUrl && (
            <div className="flex flex-wrap justify-center gap-2 text-xs">
              <span className="px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold">
                Class {selectedClass}
              </span>
              <span
                className="px-3 py-1 rounded-full text-white font-semibold"
                style={{ backgroundColor: selectedReason.color }}
              >
                {selectedReason.label}
              </span>
              <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground font-mono">
                HD · {CARD_W * SCALE}×{CARD_H * SCALE}px
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminMonitorPass;
