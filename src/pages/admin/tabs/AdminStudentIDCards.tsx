/**
 * AdminStudentIDCards.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates professional double-sided student ID cards for GHS Babi Khel.
 * • Admin: generate + bulk-download all students or per-class
 * • Users: view their own ID card
 *
 * Card size: CR80 standard (85.6 × 54 mm) — same as a credit card
 * At 96 dpi screen: 323 × 204 px  |  print: 3.37" × 2.13"
 * We render at 2× (646 × 408 px) for sharp output.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSchoolSettings, safeMediaUrl } from "@/hooks/useSchoolSettings";
import {
  CreditCard, Download, Loader2, Search, Users, ChevronDown,
  IdCard, CheckSquare, RotateCcw, Grid3X3, List, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";
import QRCode from "qrcode";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Student {
  id: string;
  full_name: string;
  roll_number: string;
  class: string;
  father_name: string | null;
  photo_url: string | null;
  is_active: boolean;
}

interface CardData {
  student: Student;
  qrDataUrl: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CLASSES = ["6", "7", "8", "9", "10"];
const CARD_W = 638;   // px at 2× density
const CARD_H = 404;   // px at 2× density
const SCHOOL_NAME = "GHS Babi Khel";
const SCHOOL_LOCATION = "District Mohmand, KPK";
const SCHOOL_EMAIL = "ghsbabkhel@edu.pk";
const SCHOOL_PHONE = "+92-XXX-XXXXXXX"; // fallback

// School logo as embedded base64 — we load it from settings, fallback to SVG placeholder
const LOGO_PLACEHOLDER = `data:image/svg+xml;base64,${btoa(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="48" fill="#1e3a6e" stroke="#c8a84b" stroke-width="3"/>
  <text x="50" y="38" text-anchor="middle" font-size="11" fill="white" font-family="serif" font-weight="bold">GHS</text>
  <text x="50" y="52" text-anchor="middle" font-size="7" fill="#c8a84b" font-family="serif">BABI KHEL</text>
  <text x="50" y="65" text-anchor="middle" font-size="5.5" fill="white" font-family="serif">EST. 2018</text>
</svg>`)}`;

// ─── QR Generator ─────────────────────────────────────────────────────────────
async function generateQR(student: Student): Promise<string> {
  const data = [
    `Name: ${student.full_name}`,
    `Roll No: ${student.roll_number}`,
    `Class: ${student.class}`,
    student.father_name ? `Father: ${student.father_name}` : "",
    `School: ${SCHOOL_NAME}`,
    `ID: ${student.id.slice(0, 8).toUpperCase()}`,
  ].filter(Boolean).join("\n");

  return QRCode.toDataURL(data, {
    width: 120,
    margin: 1,
    color: { dark: "#1e3a6e", light: "#ffffff" },
    errorCorrectionLevel: "M",
  });
}

// ─── Load image as base64 ─────────────────────────────────────────────────────
async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = url;
  });
}

// ─── Canvas Card Renderer ─────────────────────────────────────────────────────
async function renderCardFront(
  student: Student,
  qrDataUrl: string,
  logoUrl: string | null,
  schoolPhone: string,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;

  // ── Background ──────────────────────────────────────────────────────────────
  // Deep navy gradient
  const bgGrad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  bgGrad.addColorStop(0, "#0f1f45");
  bgGrad.addColorStop(0.6, "#1e3a6e");
  bgGrad.addColorStop(1, "#0d2a5a");
  ctx.fillStyle = bgGrad;
  roundRect(ctx, 0, 0, CARD_W, CARD_H, 24);
  ctx.fill();

  // Subtle diagonal pattern
  ctx.save();
  ctx.globalAlpha = 0.04;
  for (let x = -CARD_H; x < CARD_W + CARD_H; x += 28) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + CARD_H, CARD_H);
    ctx.stroke();
  }
  ctx.restore();

  // Gold top stripe
  const goldGrad = ctx.createLinearGradient(0, 0, CARD_W, 0);
  goldGrad.addColorStop(0, "#c8a84b");
  goldGrad.addColorStop(0.5, "#e8c96a");
  goldGrad.addColorStop(1, "#c8a84b");
  ctx.fillStyle = goldGrad;
  ctx.fillRect(0, 0, CARD_W, 52);
  // Clip top stripe to card corners
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  roundRect(ctx, 0, 0, CARD_W, CARD_H, 24);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();

  // ── School Header (in gold stripe) ──────────────────────────────────────────
  // Logo
  const LOGO_SIZE = 40;
  const LOGO_X = 18;
  const LOGO_Y = 6;
  try {
    const logoSrc = safeMediaUrl(logoUrl) ?? LOGO_PLACEHOLDER;
    const logoImg = await loadImage(logoSrc);
    ctx.save();
    ctx.beginPath();
    ctx.arc(LOGO_X + LOGO_SIZE / 2, LOGO_Y + LOGO_SIZE / 2, LOGO_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logoImg, LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE);
    ctx.restore();
  } catch {
    // fallback circle
    ctx.save();
    ctx.fillStyle = "#1e3a6e";
    ctx.beginPath();
    ctx.arc(LOGO_X + LOGO_SIZE / 2, LOGO_Y + LOGO_SIZE / 2, LOGO_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("GHS", LOGO_X + LOGO_SIZE / 2, LOGO_Y + LOGO_SIZE / 2 + 5);
    ctx.restore();
  }

  // School name & location
  ctx.fillStyle = "#1e3a6e";
  ctx.font = "bold 17px Georgia, serif";
  ctx.textAlign = "left";
  ctx.fillText("GHS BABI KHEL", 66, 24);
  ctx.font = "10px Georgia, serif";
  ctx.fillStyle = "#2d4a80";
  ctx.fillText("DISTRICT MOHMAND · KPK · PAKISTAN", 66, 39);

  // STUDENT ID badge (right side of header)
  ctx.fillStyle = "#1e3a6e";
  ctx.font = "bold 10px Georgia, serif";
  ctx.textAlign = "right";
  ctx.fillText("STUDENT ID CARD", CARD_W - 16, 24);
  ctx.font = "8.5px Georgia, serif";
  ctx.fillStyle = "#2d4a80";
  ctx.fillText("Est. 2018", CARD_W - 16, 38);

  ctx.textAlign = "left";

  // ── Content Area ────────────────────────────────────────────────────────────
  const CONTENT_Y = 60;
  const PHOTO_X = 22;
  const PHOTO_Y = CONTENT_Y + 8;
  const PHOTO_W = 100;
  const PHOTO_H = 118;

  // Photo frame (white border)
  ctx.fillStyle = "#c8a84b";
  roundRect(ctx, PHOTO_X - 3, PHOTO_Y - 3, PHOTO_W + 6, PHOTO_H + 6, 8);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  roundRect(ctx, PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H, 6);
  ctx.fill();

  // Student photo
  let photoLoaded = false;
  if (student.photo_url) {
    try {
      const photoImg = await loadImage(safeMediaUrl(student.photo_url)!);
      ctx.save();
      roundRect(ctx, PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H, 6);
      ctx.clip();
      // cover-fit the photo
      const scale = Math.max(PHOTO_W / photoImg.width, PHOTO_H / photoImg.height);
      const sw = PHOTO_W / scale;
      const sh = PHOTO_H / scale;
      const sx = (photoImg.width - sw) / 2;
      const sy = (photoImg.height - sh) / 2;
      ctx.drawImage(photoImg, sx, sy, sw, sh, PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H);
      ctx.restore();
      photoLoaded = true;
    } catch { /* fall through to silhouette */ }
  }

  if (!photoLoaded) {
    // Silhouette placeholder
    ctx.save();
    ctx.fillStyle = "#e8f0fc";
    roundRect(ctx, PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H, 6);
    ctx.fill();
    // Head
    ctx.fillStyle = "#b0bcd4";
    ctx.beginPath();
    ctx.arc(PHOTO_X + PHOTO_W / 2, PHOTO_Y + 36, 22, 0, Math.PI * 2);
    ctx.fill();
    // Body
    ctx.beginPath();
    ctx.arc(PHOTO_X + PHOTO_W / 2, PHOTO_Y + PHOTO_H + 18, 38, Math.PI, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  }

  // ── Student Details ──────────────────────────────────────────────────────────
  const DX = PHOTO_X + PHOTO_W + 18;
  const DY = CONTENT_Y + 12;
  const LINE_H = 22;

  // Name
  ctx.fillStyle = "#e8c96a";
  ctx.font = "bold 18px Georgia, serif";
  const name = student.full_name.length > 20 ? student.full_name.slice(0, 18) + "…" : student.full_name;
  ctx.fillText(name, DX, DY);

  // Gold divider
  ctx.fillStyle = "#c8a84b";
  ctx.fillRect(DX, DY + 5, 180, 2);

  // Fields
  const fields: [string, string][] = [
    ["CLASS", `Grade ${student.class}`],
    ["ROLL NO.", student.roll_number],
    ...(student.father_name ? [["FATHER", student.father_name.length > 18 ? student.father_name.slice(0, 16) + "…" : student.father_name] as [string, string]] : []),
    ["STATUS", student.is_active ? "Active" : "Inactive"],
  ];

  fields.forEach(([label, value], i) => {
    const fy = DY + 18 + i * LINE_H;
    ctx.fillStyle = "#94a8d0";
    ctx.font = "9px 'Courier New', monospace";
    ctx.fillText(label, DX, fy);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px Georgia, serif";
    ctx.fillText(value, DX, fy + 13);
  });

  // ── QR Code ──────────────────────────────────────────────────────────────────
  const QR_SIZE = 88;
  const QR_X = CARD_W - QR_SIZE - 18;
  const QR_Y = CONTENT_Y + 8;

  ctx.fillStyle = "#ffffff";
  roundRect(ctx, QR_X - 4, QR_Y - 4, QR_SIZE + 8, QR_SIZE + 8, 8);
  ctx.fill();

  try {
    const qrImg = await loadImage(qrDataUrl);
    ctx.drawImage(qrImg, QR_X, QR_Y, QR_SIZE, QR_SIZE);
  } catch { /* skip QR */ }

  ctx.fillStyle = "#94a8d0";
  ctx.font = "8px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText("SCAN TO VERIFY", QR_X + QR_SIZE / 2, QR_Y + QR_SIZE + 14);
  ctx.textAlign = "left";

  // ── ID Code at bottom ────────────────────────────────────────────────────────
  const BOT_Y = CARD_H - 36;

  // Bottom bar
  const botGrad = ctx.createLinearGradient(0, BOT_Y - 2, 0, CARD_H);
  botGrad.addColorStop(0, "rgba(0,0,0,0)");
  botGrad.addColorStop(1, "rgba(0,0,0,0.4)");
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, BOT_Y - 10, CARD_W, 50);

  // Barcode-style ID
  ctx.fillStyle = "#c8a84b";
  ctx.font = "bold 10px 'Courier New', monospace";
  ctx.textAlign = "left";
  ctx.fillText(`ID: ${student.id.slice(0, 8).toUpperCase()}`, 22, CARD_H - 16);

  // Session year
  ctx.fillStyle = "#94a8d0";
  ctx.font = "9px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText(`SESSION ${new Date().getFullYear()}–${new Date().getFullYear() + 1}`, CARD_W / 2, CARD_H - 16);

  // EMIS
  ctx.fillStyle = "#94a8d0";
  ctx.font = "9px 'Courier New', monospace";
  ctx.textAlign = "right";
  ctx.fillText("EMIS: 60673", CARD_W - 22, CARD_H - 16);
  ctx.textAlign = "left";

  return canvas.toDataURL("image/png");
}

async function renderCardBack(
  student: Student,
  logoUrl: string | null,
  schoolPhone: string,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;

  // ── Background ──────────────────────────────────────────────────────────────
  ctx.fillStyle = "#f8faff";
  roundRect(ctx, 0, 0, CARD_W, CARD_H, 24);
  ctx.fill();

  // Subtle grid
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.strokeStyle = "#1e3a6e";
  ctx.lineWidth = 1;
  for (let x = 0; x < CARD_W; x += 20) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CARD_H); ctx.stroke();
  }
  for (let y = 0; y < CARD_H; y += 20) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CARD_W, y); ctx.stroke();
  }
  ctx.restore();

  // Top stripe
  const goldGrad = ctx.createLinearGradient(0, 0, CARD_W, 0);
  goldGrad.addColorStop(0, "#c8a84b");
  goldGrad.addColorStop(0.5, "#e8c96a");
  goldGrad.addColorStop(1, "#c8a84b");
  ctx.fillStyle = goldGrad;
  ctx.fillRect(0, 0, CARD_W, 40);
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  roundRect(ctx, 0, 0, CARD_W, CARD_H, 24);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();

  // "BACK" label in stripe
  ctx.fillStyle = "#1e3a6e";
  ctx.font = "bold 13px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("STUDENT IDENTIFICATION CARD", CARD_W / 2, 26);
  ctx.textAlign = "left";

  // ── Logo (centered watermark) ─────────────────────────────────────────────
  const WM_SIZE = 130;
  const WM_X = (CARD_W - WM_SIZE) / 2;
  const WM_Y = (CARD_H - WM_SIZE) / 2 + 20;
  try {
    const logoSrc = safeMediaUrl(logoUrl) ?? LOGO_PLACEHOLDER;
    const logoImg = await loadImage(logoSrc);
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.drawImage(logoImg, WM_X, WM_Y, WM_SIZE, WM_SIZE);
    ctx.restore();
  } catch { /* skip */ }

  // ── Rules text ────────────────────────────────────────────────────────────
  const rules = [
    "1.  This card must be carried at all times on school premises.",
    "2.  If found, please return to GHS Babi Khel, District Mohmand.",
    "3.  This card is non-transferable and property of the school.",
    "4.  Loss of card must be reported to the school administration.",
    "5.  Tampering with this card is subject to disciplinary action.",
  ];

  ctx.fillStyle = "#1e3a6e";
  ctx.font = "bold 11px Georgia, serif";
  ctx.fillText("TERMS & CONDITIONS", 28, 72);

  ctx.fillStyle = "#2d4a80";
  ctx.font = "10px Georgia, serif";
  rules.forEach((rule, i) => {
    ctx.fillText(rule, 28, 94 + i * 17);
  });

  // ── Signature line ────────────────────────────────────────────────────────
  const SIG_Y = CARD_H - 78;
  ctx.strokeStyle = "#1e3a6e";
  ctx.lineWidth = 1.2;

  // Principal sig
  ctx.beginPath();
  ctx.moveTo(30, SIG_Y);
  ctx.lineTo(160, SIG_Y);
  ctx.stroke();
  ctx.fillStyle = "#1e3a6e";
  ctx.font = "9px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("Principal's Signature", 95, SIG_Y + 14);
  ctx.font = "bold 9px Georgia, serif";
  ctx.fillText("GHS Babi Khel", 95, SIG_Y + 27);

  // Student sig
  ctx.beginPath();
  ctx.moveTo(240, SIG_Y);
  ctx.lineTo(370, SIG_Y);
  ctx.stroke();
  ctx.font = "9px Georgia, serif";
  ctx.fillText("Student's Signature", 305, SIG_Y + 14);

  ctx.textAlign = "left";

  // ── Contact info ──────────────────────────────────────────────────────────
  ctx.fillStyle = "#1e3a6e";
  ctx.font = "bold 10px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText(SCHOOL_EMAIL, CARD_W / 2, CARD_H - 20);
  ctx.font = "9px Georgia, serif";
  ctx.fillStyle = "#6b82b4";
  ctx.fillText("GHS Babi Khel · District Mohmand · KPK · Pakistan · Est. 2018", CARD_W / 2, CARD_H - 8);
  ctx.textAlign = "left";

  // ── Magnetic stripe (bottom decorative) ─────────────────────────────────
  const MS_Y = CARD_H - 46;
  const msGrad = ctx.createLinearGradient(0, MS_Y, CARD_W, MS_Y);
  msGrad.addColorStop(0, "#1e3a6e");
  msGrad.addColorStop(0.5, "#2d4a80");
  msGrad.addColorStop(1, "#1e3a6e");
  ctx.fillStyle = msGrad;
  ctx.fillRect(0, MS_Y - 2, CARD_W, 28);
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  roundRect(ctx, 0, 0, CARD_W, CARD_H, 24);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();

  // Barcode marks on stripe
  ctx.fillStyle = "#ffffff";
  let bx = 420;
  for (let i = 0; i < 60; i++) {
    const w = Math.random() > 0.5 ? 2 : 1;
    if (bx + w > CARD_W - 20) break;
    if (Math.random() > 0.4) {
      ctx.fillRect(bx, MS_Y + 4, w, 18);
    }
    bx += w + 2;
  }

  return canvas.toDataURL("image/png");
}

// ─── Helper: rounded rect path ───────────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Download helpers ────────────────────────────────────────────────────────
async function downloadSingleCard(student: Student, qrDataUrl: string, logoUrl: string | null, phone: string) {
  const [front, back] = await Promise.all([
    renderCardFront(student, qrDataUrl, logoUrl, phone),
    renderCardBack(student, logoUrl, phone),
  ]);

  // Stitch front + back side-by-side on one PNG
  const combined = document.createElement("canvas");
  combined.width = CARD_W * 2 + 20;
  combined.height = CARD_H + 80;
  const ctx = combined.getContext("2d")!;
  ctx.fillStyle = "#e8edf5";
  ctx.fillRect(0, 0, combined.width, combined.height);
  ctx.fillStyle = "#1e3a6e";
  ctx.font = "bold 14px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("FRONT", CARD_W / 2, 24);
  ctx.fillText("BACK", CARD_W + 20 + CARD_W / 2, 24);

  const frontImg = await loadImage(front);
  const backImg = await loadImage(back);
  ctx.drawImage(frontImg, 0, 36);
  ctx.drawImage(backImg, CARD_W + 20, 36);

  ctx.fillStyle = "#6b82b4";
  ctx.font = "11px Georgia, serif";
  ctx.fillText(`${student.full_name} · Class ${student.class} · Roll No. ${student.roll_number}`, combined.width / 2, combined.height - 14);

  const link = document.createElement("a");
  link.download = `ID_Card_${student.full_name.replace(/\s+/g, "_")}_Class${student.class}_Roll${student.roll_number}.png`;
  link.href = combined.toDataURL("image/png");
  link.click();
}

async function downloadBulkCards(
  students: Student[],
  logoUrl: string | null,
  phone: string,
  onProgress: (p: number) => void
) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    const qr = await generateQR(s);
    const [front, back] = await Promise.all([
      renderCardFront(s, qr, logoUrl, phone),
      renderCardBack(s, logoUrl, phone),
    ]);

    // Stitch combined
    const combined = document.createElement("canvas");
    combined.width = CARD_W * 2 + 20;
    combined.height = CARD_H + 80;
    const ctx = combined.getContext("2d")!;
    ctx.fillStyle = "#e8edf5";
    ctx.fillRect(0, 0, combined.width, combined.height);
    ctx.fillStyle = "#1e3a6e";
    ctx.font = "bold 14px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("FRONT", CARD_W / 2, 24);
    ctx.fillText("BACK", CARD_W + 20 + CARD_W / 2, 24);
    const frontImg = await loadImage(front);
    const backImg = await loadImage(back);
    ctx.drawImage(frontImg, 0, 36);
    ctx.drawImage(backImg, CARD_W + 20, 36);

    const blob = await new Promise<Blob>((res) => combined.toBlob((b) => res(b!)));
    const folder = zip.folder(`Class_${s.class}`)!;
    folder.file(`${s.roll_number}_${s.full_name.replace(/\s+/g, "_")}.png`, blob);

    onProgress(Math.round(((i + 1) / students.length) * 100));
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement("a");
  link.download = `GHS_Babi_Khel_ID_Cards.zip`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Card Preview Component ───────────────────────────────────────────────────
const CardPreview = ({
  student, logoUrl, phone, isAdmin = true,
}: {
  student: Student; logoUrl: string | null; phone: string; isAdmin?: boolean;
}) => {
  const [side, setSide] = useState<"front" | "back">("front");
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [backUrl, setBackUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const q = await generateQR(student);
      if (!active) return;
      setQr(q);
      const [f, b] = await Promise.all([
        renderCardFront(student, q, logoUrl, phone),
        renderCardBack(student, logoUrl, phone),
      ]);
      if (!active) return;
      setFrontUrl(f);
      setBackUrl(b);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [student.id, logoUrl]);

  const handleDownload = async () => {
    if (!qr) return;
    setDownloading(true);
    try {
      await downloadSingleCard(student, qr, logoUrl, phone);
      toast.success("ID Card downloaded!");
    } catch {
      toast.error("Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Flip toggle */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        <button
          onClick={() => setSide("front")}
          className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
            side === "front"
              ? "bg-[#1e3a6e] text-white shadow-sm"
              : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
          }`}
        >
          Front
        </button>
        <button
          onClick={() => setSide("back")}
          className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
            side === "back"
              ? "bg-[#1e3a6e] text-white shadow-sm"
              : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
          }`}
        >
          Back
        </button>
      </div>

      {/* Card display */}
      <div
        className="relative rounded-2xl overflow-hidden shadow-2xl"
        style={{ width: "100%", maxWidth: 400, aspectRatio: `${CARD_W}/${CARD_H}` }}
      >
        {loading ? (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0f1f45] to-[#1e3a6e] flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#c8a84b]" />
          </div>
        ) : (
          <img
            src={side === "front" ? frontUrl! : backUrl!}
            alt={`ID Card ${side}`}
            className="w-full h-full object-contain transition-opacity duration-300"
            style={{ imageRendering: "crisp-edges" }}
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 w-full justify-center flex-wrap">
        <Button
          size="sm"
          onClick={handleDownload}
          disabled={loading || downloading}
          className="bg-[#1e3a6e] hover:bg-[#2d4a80] text-white"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}
          Download Card
        </Button>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const AdminStudentIDCards = ({ isAdminView = true }: { isAdminView?: boolean }) => {
  const { data: settings } = useSchoolSettings();
  const logoUrl = settings?.logo_url ?? null;
  const phone = settings?.phone ?? SCHOOL_PHONE;

  const [classFilter, setClassFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Load all students (no pagination — we need all for bulk download)
  const { data, isLoading } = useQuery({
    queryKey: ["id-cards-students", classFilter],
    queryFn: async () => {
      let q = supabase
        .from("students")
        .select("id, full_name, roll_number, class, father_name, photo_url, is_active")
        .eq("is_active", true)
        .order("class")
        .order("roll_number");
      if (classFilter !== "all") q = q.eq("class", classFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Student[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const allStudents = data ?? [];
  const filtered = search.trim()
    ? allStudents.filter(
        (s) =>
          s.full_name.toLowerCase().includes(search.toLowerCase()) ||
          s.roll_number.toLowerCase().includes(search.toLowerCase())
      )
    : allStudents;

  const handleBulkDownload = async () => {
    if (!filtered.length) return;
    setBulkDownloading(true);
    setBulkProgress(0);
    try {
      await downloadBulkCards(filtered, logoUrl, phone, setBulkProgress);
      toast.success(`Downloaded ${filtered.length} ID cards!`);
    } catch (e: any) {
      toast.error("Bulk download failed: " + e.message);
    } finally {
      setBulkDownloading(false);
      setBulkProgress(0);
    }
  };

  const openPreview = (student: Student) => {
    setSelectedStudent(student);
    setPreviewOpen(true);
  };

  // Group by class for grid display
  const byClass = CLASSES.reduce<Record<string, Student[]>>((acc, cls) => {
    acc[cls] = filtered.filter((s) => s.class === cls);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <IdCard className="w-6 h-6 text-[#c8a84b]" />
            Student ID Cards
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Generate professional CR80 double-sided ID cards for all students
          </p>
        </div>
        {isAdminView && (
          <Button
            onClick={handleBulkDownload}
            disabled={bulkDownloading || !filtered.length}
            className="bg-[#1e3a6e] hover:bg-[#2d4a80] text-white shrink-0"
          >
            {bulkDownloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {bulkProgress}% …
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Download All ({filtered.length})
              </>
            )}
          </Button>
        )}
      </div>

      {/* ── Progress bar for bulk ───────────────────────────────────────────── */}
      {bulkDownloading && (
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#1e3a6e] to-[#c8a84b] transition-all duration-300 rounded-full"
            style={{ width: `${bulkProgress}%` }}
          />
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or roll number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {CLASSES.map((c) => (
              <SelectItem key={c} value={c}>Class {c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-1 border rounded-lg p-1 bg-background">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded transition-colors ${viewMode === "grid" ? "bg-[#1e3a6e] text-white" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded transition-colors ${viewMode === "list" ? "bg-[#1e3a6e] text-white" : "text-muted-foreground hover:text-foreground"}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Stats ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {CLASSES.map((c) => {
          const count = filtered.filter((s) => s.class === c).length;
          if (!count) return null;
          return (
            <Badge key={c} variant="outline" className="text-xs border-[#1e3a6e] text-[#1e3a6e] dark:border-blue-400 dark:text-blue-400">
              Class {c}: {count} students
            </Badge>
          );
        })}
        <Badge variant="secondary" className="text-xs">
          Total: {filtered.length}
        </Badge>
      </div>

      {/* ── Loading ─────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-[#1e3a6e]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No students found</p>
        </div>
      ) : viewMode === "grid" ? (
        /* ── Grid View ────────────────────────────────────────────────────── */
        <div className="space-y-8">
          {CLASSES.map((cls) => {
            const students = byClass[cls];
            if (!students.length) return null;
            return (
              <div key={cls}>
                {classFilter === "all" && (
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-[#1e3a6e] text-white flex items-center justify-center text-sm font-bold">
                      {cls}
                    </div>
                    <h3 className="font-semibold text-foreground">Class {cls}</h3>
                    <span className="text-xs text-muted-foreground">({students.length} students)</span>
                    {isAdminView && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto text-xs border-[#1e3a6e] text-[#1e3a6e] hover:bg-[#1e3a6e] hover:text-white"
                        onClick={async () => {
                          setBulkDownloading(true);
                          setBulkProgress(0);
                          try {
                            await downloadBulkCards(students, logoUrl, phone, setBulkProgress);
                            toast.success(`Downloaded Class ${cls} ID cards!`);
                          } catch {
                            toast.error("Download failed");
                          } finally {
                            setBulkDownloading(false);
                            setBulkProgress(0);
                          }
                        }}
                        disabled={bulkDownloading}
                      >
                        <Download className="w-3 h-3 mr-1" />
                        Download Class {cls}
                      </Button>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {students.map((s) => (
                    <StudentCardTile
                      key={s.id}
                      student={s}
                      logoUrl={logoUrl}
                      phone={phone}
                      onClick={() => openPreview(s)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── List View ────────────────────────────────────────────────────── */
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1e3a6e] text-white">
                <th className="px-4 py-3 text-left font-semibold">Student</th>
                <th className="px-4 py-3 text-left font-semibold">Class</th>
                <th className="px-4 py-3 text-left font-semibold">Roll No.</th>
                <th className="px-4 py-3 text-left font-semibold hidden sm:table-cell">Father</th>
                <th className="px-4 py-3 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr
                  key={s.id}
                  className={`border-t transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${
                    i % 2 === 0 ? "bg-background" : "bg-slate-50/40 dark:bg-slate-800/20"
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {s.photo_url ? (
                        <img
                          src={safeMediaUrl(s.photo_url)!}
                          alt={s.full_name}
                          className="w-8 h-8 rounded-full object-cover border border-slate-200"
                          crossOrigin="anonymous"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[#1e3a6e]/10 flex items-center justify-center text-[#1e3a6e] font-bold text-xs">
                          {s.full_name.charAt(0)}
                        </div>
                      )}
                      <span className="font-medium text-foreground">{s.full_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">Grade {s.class}</td>
                  <td className="px-4 py-3 font-mono text-sm">{s.roll_number}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{s.father_name || "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => openPreview(s)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#1e3a6e] dark:text-blue-400 hover:underline"
                    >
                      <CreditCard className="w-3 h-3" />
                      View & Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Preview Modal ────────────────────────────────────────────────────── */}
      {previewOpen && selectedStudent && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="font-bold text-lg text-foreground mb-1">{selectedStudent.full_name}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Class {selectedStudent.class} · Roll No. {selectedStudent.roll_number}
            </p>
            <CardPreview
              student={selectedStudent}
              logoUrl={logoUrl}
              phone={phone}
              isAdmin={isAdminView}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Small tile for grid view ─────────────────────────────────────────────────
const StudentCardTile = ({
  student, logoUrl, phone, onClick,
}: {
  student: Student; logoUrl: string | null; phone: string; onClick: () => void;
}) => {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-[#1e3a6e] hover:shadow-md transition-all text-center"
    >
      {/* Mini card front preview */}
      <div
        className="w-full rounded-lg overflow-hidden relative"
        style={{ aspectRatio: `${CARD_W}/${CARD_H}`, background: "linear-gradient(135deg, #0f1f45, #1e3a6e)" }}
      >
        {/* Simplified mini preview */}
        <div className="absolute inset-0 flex flex-col">
          <div className="h-[22%] bg-gradient-to-r from-[#c8a84b] to-[#e8c96a] flex items-center px-2">
            <span className="text-[#1e3a6e] font-bold" style={{ fontSize: "clamp(4px, 1.8vw, 7px)" }}>
              GHS BABI KHEL
            </span>
          </div>
          <div className="flex-1 flex items-center px-1.5 gap-1.5">
            {student.photo_url ? (
              <img
                src={safeMediaUrl(student.photo_url)!}
                alt=""
                crossOrigin="anonymous"
                className="rounded object-cover flex-shrink-0"
                style={{ width: "28%", aspectRatio: "3/4" }}
              />
            ) : (
              <div
                className="rounded bg-slate-600 flex-shrink-0"
                style={{ width: "28%", aspectRatio: "3/4" }}
              />
            )}
            <div className="flex-1 min-w-0 text-left">
              <div className="text-[#e8c96a] font-bold truncate" style={{ fontSize: "clamp(4px, 1.6vw, 6px)" }}>
                {student.full_name}
              </div>
              <div className="text-white/70" style={{ fontSize: "clamp(3px, 1.3vw, 5px)" }}>
                Class {student.class}
              </div>
              <div className="text-white/70" style={{ fontSize: "clamp(3px, 1.3vw, 5px)" }}>
                #{student.roll_number}
              </div>
            </div>
          </div>
        </div>
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-[#1e3a6e]/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <CreditCard className="w-6 h-6 text-[#c8a84b]" />
        </div>
      </div>

      <div className="w-full">
        <p className="text-xs font-semibold text-foreground truncate">{student.full_name}</p>
        <p className="text-[10px] text-muted-foreground">Roll: {student.roll_number}</p>
      </div>
    </button>
  );
};

export default AdminStudentIDCards;

// ── Named export for user dashboard ──────────────────────────────────────────
export const UserStudentIDCards = () => <AdminStudentIDCards isAdminView={false} />;
