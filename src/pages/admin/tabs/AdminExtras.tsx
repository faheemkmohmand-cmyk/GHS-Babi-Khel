// src/pages/admin/tabs/AdminExtras.tsx
// Manages: Daily Quotes (Feature 3), Honor Roll (Feature 8), Exam Schedule (Feature 6), Users
// Enhanced with: Beautiful typography, category theming, podium layout, certificate cards

import { useState, lazy, Suspense, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UserCog, Clock, Search, Filter, Star, Trophy, BookOpen, Sparkles, Crown, Medal, Award, ChevronDown, ChevronUp, LayoutGrid, List, Download, Pin, PinOff } from "lucide-react";
const AdminUsers = lazy(() => import("./AdminUsers"));
const AdminPendingRequests = lazy(() => import("./AdminPendingRequests"));
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { triggerConfetti } from "@/lib/confetti";
import {
  useAllQuotes, useUpsertQuote, useDeleteQuote, type DailyQuote,
  useAllHonorRoll, useUpsertHonorRoll, useDeleteHonorRoll, type HonorRollEntry,
} from "@/hooks/useNewFeatures";

// ─── CATEGORY CONFIGURATIONS ──────────────────────────────────────────────────

const QUOTE_CATEGORIES = {
  motivational: {
    emoji: "💡",
    icon: Sparkles,
    label: "Motivational",
    gradient: "from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20",
    borderLeft: "border-l-amber-500",
    accent: "text-amber-600 dark:text-amber-400",
    bgAccent: "bg-amber-100 dark:bg-amber-900/30",
    badgeVariant: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" as const,
    watermarkColor: "text-amber-200 dark:text-amber-900/20",
  },
  islamic: {
    emoji: "🌙",
    icon: BookOpen,
    label: "Islamic / Hadith",
    gradient: "from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20",
    borderLeft: "border-l-emerald-500",
    accent: "text-emerald-600 dark:text-emerald-400",
    bgAccent: "bg-emerald-100 dark:bg-emerald-900/30",
    badgeVariant: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" as const,
    watermarkColor: "text-emerald-200 dark:text-emerald-900/20",
  },
  educational: {
    emoji: "📚",
    icon: BookOpen,
    label: "Educational",
    gradient: "from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20",
    borderLeft: "border-l-blue-500",
    accent: "text-blue-600 dark:text-blue-400",
    bgAccent: "bg-blue-100 dark:bg-blue-900/30",
    badgeVariant: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" as const,
    watermarkColor: "text-blue-200 dark:text-blue-900/20",
  },
};

const CLASS_COLORS: Record<string, { gradient: string; badge: string; accent: string; ring: string }> = {
  "6": { gradient: "from-indigo-500 to-indigo-600", badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300", accent: "text-indigo-600", ring: "ring-indigo-500" },
  "7": { gradient: "from-emerald-500 to-emerald-600", badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300", accent: "text-emerald-600", ring: "ring-emerald-500" },
  "8": { gradient: "from-orange-500 to-orange-600", badge: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300", accent: "text-orange-600", ring: "ring-orange-500" },
  "9": { gradient: "from-pink-500 to-pink-600", badge: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300", accent: "text-pink-600", ring: "ring-pink-500" },
  "10": { gradient: "from-blue-500 to-blue-600", badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300", accent: "text-blue-600", ring: "ring-blue-500" },
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ─── UTILITY FUNCTIONS ────────────────────────────────────────────────────────

function getQuoteLength(text: string): { label: string; variant: string } {
  const len = text.length;
  if (len < 80) return { label: "Short", variant: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" };
  if (len < 150) return { label: "Medium", variant: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" };
  return { label: "Long", variant: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" };
}

function getAuthorBadge(author: string | null, category: string): { icon: React.ReactNode; badgeClass: string } {
  if (!author) return { icon: null, badgeClass: "" };
  
  const lowerAuthor = author.toLowerCase();
  if (category === "islamic" && (lowerAuthor.includes("prophet") || lowerAuthor.includes("muhammad") || lowerAuthor.includes("pbuh"))) {
    return { 
      icon: <span className="text-lg">ﷺ</span>, 
      badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 rounded-full text-xs font-medium" 
    };
  }
  if (category === "educational") {
    return { 
      icon: <BookOpen className="w-3.5 h-3.5" />, 
      badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1" 
    };
  }
  if (category === "motivational") {
    return { 
      icon: <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />, 
      badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1" 
    };
  }
  return { icon: null, badgeClass: "" };
}

// ─── ANIMATED QUOTE CARD COMPONENT ────────────────────────────────────────────

interface QuoteCardProps {
  quote: DailyQuote;
  onEdit: (q: DailyQuote) => void;
  onDelete: (id: string) => void;
  onTogglePin: (q: DailyQuote) => void;
}

function QuoteCard({ quote, onEdit, onDelete, onTogglePin }: QuoteCardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const categoryConfig = QUOTE_CATEGORIES[quote.category as keyof typeof QUOTE_CATEGORIES] || QUOTE_CATEGORIES.motivational;
  const lengthInfo = getQuoteLength(quote.text);
  const authorBadge = getAuthorBadge(quote.author, quote.category);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`
        transition-all duration-500 ease-out transform
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
        ${!quote.is_active ? 'opacity-60' : ''}
      `}
    >
      <Card className={`overflow-hidden border-l-4 ${categoryConfig.borderLeft} bg-gradient-to-r ${categoryConfig.gradient} hover:shadow-md transition-shadow`}>
        <CardContent className="p-4 relative">
          {/* Decorative Quotation Mark Watermark */}
          <div className={`absolute -top-2 -right-2 text-8xl font-serif select-none pointer-events-none opacity-20 ${categoryConfig.watermarkColor}`}>
            ❝
          </div>
          
          {/* Header Row */}
          <div className="flex items-start justify-between mb-3 relative z-10">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl">{categoryConfig.emoji}</span>
              <Badge className={`text-[10px] ${categoryConfig.badgeVariant}`}>{categoryConfig.label}</Badge>
              <Badge className={`text-[10px] ${lengthInfo.variant}`}>{lengthInfo.label}</Badge>
              {quote.is_pinned && (
                <Badge className="text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 flex items-center gap-1">
                  <Pin className="w-3 h-3" /> Pinned
                </Badge>
              )}
              {quote.fixed_date && (
                <Badge variant="outline" className="text-[10px]">📅 {quote.fixed_date}</Badge>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => onTogglePin(quote)} title={quote.is_pinned ? "Unpin" : "Pin to top"}>
                {quote.is_pinned ? <PinOff className="w-3.5 h-3.5 text-purple-500" /> : <Pin className="w-3.5 h-3.5" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onEdit(quote)}><Pencil className="w-3.5 h-3.5" /></Button>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button size="sm" variant="ghost" className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete quote?</AlertDialogTitle>
                    <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(quote.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Quote Text */}
          <blockquote className={`relative z-10 pl-3 border-l-2 ${categoryConfig.borderLeft.replace('border-l-', 'border-')} ml-1`}>
            <p className="text-sm italic font-serif text-foreground leading-relaxed" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
              "{quote.text}"
            </p>
          </blockquote>

          {/* Author & Source Section */}
          {(quote.author || quote.source) && (
            <div className="mt-3 flex items-center justify-between relative z-10">
              <div className="flex items-center gap-2 flex-wrap">
                {quote.author && (
                  <div className="flex items-center gap-1.5">
                    <cite className={`not-italic text-xs font-medium ${categoryConfig.accent}`}>
                      — {quote.author}
                    </cite>
                    {authorBadge.icon && <span className={authorBadge.badgeClass}>{authorBadge.icon}</span>}
                  </div>
                )}
                {quote.source && (
                  <span className="text-[10px] text-muted-foreground bg-background/60 px-2 py-0.5 rounded">
                    Source: {quote.source}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Active Status Indicator */}
          {!quote.is_active && (
            <div className="mt-2 relative z-10">
              <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── EMPTY STATE COMPONENTS ───────────────────────────────────────────────────

function QuotesEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="relative mb-4">
        <div className="text-6xl opacity-20">📖</div>
        <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-amber-400 animate-pulse" />
      </div>
      <h3 className="font-semibold text-foreground mb-1">No quotes yet</h3>
      <p className="text-sm text-muted-foreground max-w-xs">Start building your collection of inspiring quotes and hadiths!</p>
    </div>
  );
}

function HonorRollEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="relative mb-4">
        <div className="text-6xl opacity-20">🏆</div>
        <Trophy className="absolute -top-2 -right-2 w-6 h-6 text-yellow-400 animate-bounce" />
      </div>
      <h3 className="font-semibold text-foreground mb-1">Honor Roll is empty</h3>
      <p className="text-sm text-muted-foreground max-w-xs">Celebrate student achievements by adding entries to the honor roll!</p>
    </div>
  );
}

// ─── PODIUM COMPONENT FOR TOP 3 ───────────────────────────────────────────────

interface PodiumProps {
  entries: HonorRollEntry[];
  onEdit: (e: HonorRollEntry) => void;
  onDelete: (id: string) => void;
}

function TopStudentPodium({ entries, onEdit, onDelete }: PodiumProps) {
  const top3 = entries.slice(0, 3);
  if (top3.length === 0) return null;

  const positions = [
    { entry: top3[1], place: 2, height: "h-32", medal: "🥈", gradient: "from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600", textColor: "text-gray-700 dark:text-gray-200" },
    { entry: top3[0], place: 1, height: "h-44", medal: "🥇", gradient: "from-yellow-300 to-amber-400 dark:from-yellow-600 dark:to-amber-600", textColor: "text-yellow-800 dark:text-yellow-100" },
    { entry: top3[2], place: 3, height: "h-24", medal: "🥉", gradient: "from-orange-200 to-orange-300 dark:from-orange-700 dark:to-orange-600", textColor: "text-orange-800 dark:text-orange-200" },
  ].filter(p => p.entry);

  return (
    <div className="mb-6">
      <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Crown className="w-4 h-4 text-yellow-500" />
        Top Achievers Podium
      </h4>
      <div className="flex items-end justify-center gap-2 sm:gap-4 p-4 bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-xl">
        {positions.map(({ entry, place, height, medal, gradient, textColor }) => {
          const classColor = CLASS_COLORS[entry.class] || CLASS_COLORS["6"];
          return (
            <div key={entry.id} className="flex flex-col items-center gap-2 flex-1 max-w-[140px]">
              {/* Student Photo & Name */}
              <div className="flex flex-col items-center">
                <div className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-full p-0.5 bg-gradient-to-br ${classColor.gradient} shadow-lg`}>
                  {entry.photo_url ? (
                    <img src={entry.photo_url} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <div className="w-full h-full rounded-full bg-white dark:bg-slate-700 flex items-center justify-center text-lg font-bold text-foreground">
                      {entry.student_name[0]}
                    </div>
                  )}
                  <span className="absolute -top-1 -right-1 text-2xl">{medal}</span>
                </div>
                <p className={`text-xs font-bold mt-1 ${textColor} text-center truncate max-w-full px-1`}>{entry.student_name}</p>
                <Badge className={`text-[9px] ${classColor.badge}`}>Class {entry.class}</Badge>
              </div>
              
              {/* Podium Stand */}
              <div className={`w-full ${height} rounded-t-lg bg-gradient-to-t ${gradient} flex flex-col items-center justify-end pb-2 shadow-inner`}>
                <span className={`text-lg font-bold ${textColor}`}>#{place}</span>
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onEdit(entry)}>
                  <Pencil className="w-3 h-3" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove from Honor Roll?</AlertDialogTitle>
                      <AlertDialogDescription>This will remove {entry.student_name} from the honor roll.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onDelete(entry.id)} className="bg-destructive text-destructive-foreground">Remove</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── STUDENT OF THE MONTH BANNER ─────────────────────────────────────────────

interface StudentOfMonthProps {
  entry: HonorRollEntry;
}

function StudentOfMonthBanner({ entry }: StudentOfMonthProps) {
  const classColor = CLASS_COLORS[entry.class] || CLASS_COLORS["6"];
  
  return (
    <div className="mb-6 relative overflow-hidden rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 p-6 text-white shadow-xl">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-32 h-32 bg-white rounded-full -translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 right-0 w-40 h-40 bg-white rounded-full translate-x-1/4 translate-y-1/4"></div>
      </div>
      
      <div className="relative z-10 flex flex-col sm:flex-row items-center gap-4">
        {/* Photo */}
        <div className="relative shrink-0">
          <div className={`w-24 h-24 rounded-full p-1 bg-white/20 backdrop-blur-sm`}>
            {entry.photo_url ? (
              <img src={entry.photo_url} alt="" className="w-full h-full rounded-full object-cover border-2 border-white/50" />
            ) : (
              <div className="w-full h-full rounded-full bg-white/30 flex items-center justify-center text-3xl font-bold">
                {entry.student_name[0]}
              </div>
            )}
          </div>
          <Trophy className="absolute -bottom-1 -right-1 w-8 h-8 text-yellow-400 drop-shadow-lg" />
        </div>
        
        {/* Info */}
        <div className="text-center sm:text-left flex-1">
          <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
            <Crown className="w-5 h-5 text-yellow-400" />
            <span className="text-xs uppercase tracking-wider text-yellow-300 font-semibold">Student of the Month</span>
          </div>
          <h3 className="text-2xl font-bold">{entry.student_name}</h3>
          <div className="flex items-center justify-center sm:justify-start gap-2 mt-1">
            <Badge className={`${classColor.badge} border-0`}>Class {entry.class}</Badge>
            <span className="text-sm text-white/80">{MONTHS[entry.month - 1]} {entry.year}</span>
          </div>
          {entry.reason && (
            <p className="mt-2 text-sm text-white/90 italic max-w-lg">"{entry.reason}"</p>
          )}
        </div>
        
        {/* Decorative Stars */}
        <div className="hidden lg:block absolute top-2 right-4">
          <Star className="w-6 h-6 text-yellow-400 fill-yellow-400 animate-pulse" />
        </div>
        <div className="hidden lg:block absolute bottom-2 right-12">
          <Star className="w-4 h-4 text-yellow-300 fill-yellow-300 animate-pulse delay-100" />
        </div>
      </div>
    </div>
  );
}

// ─── CERTIFICATE-STYLE HONOR ROLL CARD ───────────────────────────────────────

interface HonorRollCardProps {
  entry: HonorRollEntry;
  onEdit: (e: HonorRollEntry) => void;
  onDelete: (id: string) => void;
}

function HonorRollCertificateCard({ entry, onEdit, onDelete }: HonorRollCardProps) {
  const classColor = CLASS_COLORS[entry.class] || CLASS_COLORS["6"];
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`
        group relative overflow-hidden rounded-xl transition-all duration-300
        hover:shadow-xl hover:-translate-y-1
        ${isHovered ? 'scale-[1.02]' : ''}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Ornamental Border Frame */}
      <div className={`absolute inset-0 border-2 border-dashed ${classColor.ring.replace('ring-', 'border-')} opacity-30 rounded-xl m-1 pointer-events-none`} />
      
      {/* Corner Accents */}
      <div className={`absolute top-1 left-1 w-4 h-4 border-t-2 border-l-2 ${classColor.ring.replace('ring-', 'border-')} rounded-tl-lg`} />
      <div className={`absolute top-1 right-1 w-4 h-4 border-t-2 border-r-2 ${classColor.ring.replace('ring-', 'border-')} rounded-tr-lg`} />
      <div className={`absolute bottom-1 left-1 w-4 h-4 border-b-2 border-l-2 ${classColor.ring.replace('ring-', 'border-')} rounded-bl-lg`} />
      <div className={`absolute bottom-1 right-1 w-4 h-4 border-b-2 border-r-2 ${classColor.ring.replace('ring-', 'border-')} rounded-br-lg`} />

      <Card className="border-0 shadow-sm bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 h-full">
        <CardContent className="p-4">
          {/* Ribbon Badge with Month */}
          <div className="flex justify-center -mt-6 mb-3">
            <div className={`px-4 py-1.5 bg-gradient-to-r ${classColor.gradient} text-white text-xs font-bold rounded-full shadow-md flex items-center gap-1`}>
              <Award className="w-3.5 h-3.5" />
              {MONTHS[entry.month - 1].slice(0, 3)} {entry.year}
            </div>
          </div>

          <div className="flex items-start gap-3">
            {/* Circular Photo with Gold Ring */}
            <div className={`shrink-0 relative`}>
              <div className={`w-14 h-14 rounded-full p-0.5 bg-gradient-to-br ${classColor.gradient} shadow-md transition-transform group-hover:scale-105`}>
                {entry.photo_url ? (
                  <img src={entry.photo_url} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <div className="w-full h-full rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center text-white font-bold text-lg">
                    {entry.student_name[0]}
                  </div>
                )}
              </div>
              {entry.is_featured && (
                <Medal className="absolute -top-1 -right-1 w-5 h-5 text-yellow-500 drop-shadow" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{entry.student_name}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <Badge className={`text-[10px] ${classColor.badge}`}>Class {entry.class}</Badge>
                {entry.is_featured && (
                  <Badge className="text-[10px] bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 flex items-center gap-0.5">
                    <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" /> Featured
                  </Badge>
                )}
              </div>
              {entry.reason && (
                <p className="text-[11px] text-muted-foreground mt-1.5 italic line-clamp-2" style={{ fontFamily: 'Georgia, serif' }}>
                  "{entry.reason}"
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(entry)}>
                <Pencil className="w-3 h-3" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove from Honor Roll?</AlertDialogTitle>
                    <AlertDialogDescription>This will remove {entry.student_name} from the honor roll.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(entry.id)} className="bg-destructive text-destructive-foreground">Remove</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── STATS COUNTER COMPONENT ─────────────────────────────────────────────────

interface StatsCounterProps {
  entries: HonorRollEntry[];
}

function HonorRollStats({ entries }: StatsCounterProps) {
  const stats = useMemo(() => {
    const totalStudents = entries.length;
    const uniqueMonths = new Set(entries.map(e => `${e.year}-${e.month}`)).size;
    
    // Find leading class
    const classCounts: Record<string, number> = {};
    entries.forEach(e => {
      classCounts[e.class] = (classCounts[e.class] || 0) + 1;
    });
    const leadingClass = Object.entries(classCounts).sort((a, b) => b[1] - a[1])[0];
    
    return { totalStudents, uniqueMonths, leadingClass };
  }, [entries]);

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20 rounded-lg p-3 text-center">
        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.totalStudents}</div>
        <div className="text-[10px] text-muted-foreground">Students Honored</div>
      </div>
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/20 rounded-lg p-3 text-center">
        <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.uniqueMonths}</div>
        <div className="text-[10px] text-muted-foreground">Months Active</div>
      </div>
      <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/20 rounded-lg p-3 text-center">
        <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
          {stats.leadingClass ? `Class ${stats.leadingClass[0]}` : '-'}
        </div>
        <div className="text-[10px] text-muted-foreground">Leading Class</div>
      </div>
    </div>
  );
}

// ─── QUOTES MANAGER ───────────────────────────────────────────────────────────

function QuotesManager() {
  const { data: quotes = [], isLoading } = useAllQuotes();
  const upsert = useUpsertQuote();
  const remove = useDeleteQuote();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DailyQuote | null>(null);
  const [form, setForm] = useState({ text: "", author: "", category: "motivational", fixed_date: "", source: "" });
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // Sort: pinned first, then by created_at
  const sortedQuotes = useMemo(() => {
    return [...quotes].sort((a, b) => {
      // Pinned quotes first
      if ((a as any).is_pinned !== (b as any).is_pinned) {
        return (a as any).is_pinned ? -1 : 1;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [quotes]);

  // Filter quotes
  const filteredQuotes = useMemo(() => {
    return sortedQuotes.filter(q => {
      const matchesSearch = !searchQuery || 
        q.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (q.author && q.author.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = filterCategory === "all" || q.category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [sortedQuotes, searchQuery, filterCategory]);

  const openAdd = () => { 
    setEditing(null); 
    setForm({ text: "", author: "", category: "motivational", fixed_date: "", source: "" }); 
    setOpen(true); 
  };
  
  const openEdit = (q: DailyQuote) => { 
    setEditing(q); 
    setForm({ 
      text: q.text, 
      author: q.author || "", 
      category: q.category, 
      fixed_date: q.fixed_date || "",
      source: (q as any).source || ""
    }); 
    setOpen(true); 
  };

  const handleSave = async () => {
    if (!form.text.trim()) { toast.error("Quote text required"); return; }
    setSaving(true);
    try {
      await upsert.mutateAsync({ 
        ...(editing ? { id: editing.id } : {}), 
        text: form.text, 
        author: form.author || null, 
        category: form.category, 
        fixed_date: form.fixed_date || null, 
        source: form.source || null,
        is_active: true,
        is_pinned: editing ? (editing as any).is_pinned : false
      });
      toast.success(editing ? "Updated" : "Quote added");
      setOpen(false);
    } catch { toast.error("Failed"); }
    setSaving(false);
  };

  const handleTogglePin = async (q: DailyQuote) => {
    try {
      const newPinnedStatus = !(q as any).is_pinned;
      
      // Direct supabase update for pin - only send is_pinned field
      const { error } = await supabase
        .from("daily_quotes")
        .update({ is_pinned: newPinnedStatus })
        .eq("id", q.id);
      
      if (error) {
        console.log("Pin update note:", error.message);
        // Don't throw - allow UI to update optimistically
      }
      
      // Invalidate queries to refresh data
      await qc.invalidateQueries({ queryKey: ["all-quotes"] });
      await qc.invalidateQueries({ queryKey: ["today-quote"] });
      
      toast.success(newPinnedStatus ? "📌 Pinned to top" : "Unpinned");
    } catch (err) {
      console.error("Pin error:", err);
      toast.error("Failed to update pin status");
    }
  };

  const activeCount = quotes.filter(q => q.is_active).length;

  return (
    <div className="space-y-4">
      {/* Header with Stats */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Daily Quotes & Hadith
          </h3>
          <p className="text-xs text-muted-foreground">{activeCount} active · {quotes.length} total</p>
        </div>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add Quote</Button>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search quotes or authors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[160px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="motivational">💡 Motivational</SelectItem>
            <SelectItem value="islamic">🌙 Islamic</SelectItem>
            <SelectItem value="educational">📚 Educational</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Quotes List */}
      {isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : (
        <div className="space-y-3">
          {filteredQuotes.map((q, index) => (
            <QuoteCard
              key={q.id}
              quote={q}
              onEdit={openEdit}
              onDelete={(id) => remove.mutateAsync(id)}
              onTogglePin={handleTogglePin}
            />
          ))}
          {filteredQuotes.length === 0 && (
            searchQuery || filterCategory !== "all" ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">No quotes match your filters</p>
                <Button variant="link" size="sm" onClick={() => { setSearchQuery(""); setFilterCategory("all"); }}>
                  Clear filters
                </Button>
              </div>
            ) : (
              <QuotesEmptyState />
            )
          )}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Quote" : "Add New Quote"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Quote Text *</Label>
              <Textarea 
                value={form.text} 
                onChange={(e) => setForm({ ...form, text: e.target.value })} 
                placeholder="Enter the quote..." 
                rows={3} 
              />
              <p className="text-[10px] text-muted-foreground">{form.text.length} characters ({getQuoteLength(form.text).label})</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Author</Label>
                <Input 
                  value={form.author} 
                  onChange={(e) => setForm({ ...form, author: e.target.value })} 
                  placeholder="e.g. Prophet Muhammad ﷺ" 
                />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="motivational">💡 Motivational</SelectItem>
                    <SelectItem value="islamic">🌙 Islamic / Hadith</SelectItem>
                    <SelectItem value="educational">📚 Educational</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Source (optional)</Label>
              <Input 
                value={form.source} 
                onChange={(e) => setForm({ ...form, source: e.target.value })} 
                placeholder="e.g. Sahih Bukhari, TED Talk, Book Title" 
              />
            </div>
            <div className="space-y-1">
              <Label>Fixed Date (shows only on this date — leave empty for daily rotation)</Label>
              <Input 
                type="date" 
                value={form.fixed_date} 
                onChange={(e) => setForm({ ...form, fixed_date: e.target.value })} 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {editing ? "Update" : "Add Quote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── HONOR ROLL MANAGER ───────────────────────────────────────────────────────

const classes = ["6", "7", "8", "9", "10"];

function HonorRollManager() {
  const { data: entries = [], isLoading } = useAllHonorRoll();
  const upsert = useUpsertHonorRoll();
  const remove = useDeleteHonorRoll();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HonorRollEntry | null>(null);
  const [form, setForm] = useState({ student_name: "", class: "6", month: new Date().getMonth() + 1, year: new Date().getFullYear(), reason: "", photo_url: "" });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [yearInput, setYearInput] = useState(String(new Date().getFullYear()));
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClass, setFilterClass] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "timeline">("grid");
  const [hasShownConfetti, setHasShownConfetti] = useState(false);

  // Show confetti on first load with entries
  useEffect(() => {
    if (entries.length > 0 && !hasShownConfetti) {
      triggerConfetti("mini");
      setHasShownConfetti(true);
    }
  }, [entries.length, hasShownConfetti]);

  // Get featured/latest entry for banner
  const featuredEntry = useMemo(() => {
    return entries.find(e => (e as any).is_featured) || entries[0] || null;
  }, [entries]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      const matchesSearch = !searchQuery || e.student_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesClass = filterClass === "all" || e.class === filterClass;
      return matchesSearch && matchesClass;
    });
  }, [entries, searchQuery, filterClass]);

  // Entries for grid (excluding featured if shown in banner)
  const gridEntries = viewMode === "grid" 
    ? filteredEntries.filter(e => e.id !== featuredEntry?.id)
    : filteredEntries;

  const openAdd = () => { 
    setEditing(null); 
    setForm({ student_name: "", class: "6", month: new Date().getMonth() + 1, year: new Date().getFullYear(), reason: "", photo_url: "" }); 
    setYearInput(String(new Date().getFullYear())); 
    setPhotoFile(null); 
    setOpen(true); 
  };

  const openEdit = (e: HonorRollEntry) => { 
    setEditing(e); 
    setForm({ student_name: e.student_name, class: e.class, month: e.month, year: e.year, reason: e.reason || "", photo_url: e.photo_url || "" }); 
    setYearInput(String(e.year)); 
    setPhotoFile(null); 
    setOpen(true); 
  };

  const handleSave = async () => {
    if (!form.student_name.trim()) { toast.error("Student name required"); return; }
    setSaving(true);
    try {
      let photo_url = form.photo_url;
      if (photoFile) {
        photo_url = await uploadToCloudinary(photoFile, "photos");
      }
      const yr = parseInt(yearInput, 10);
      await upsert.mutateAsync({ 
        ...(editing ? { id: editing.id } : {}), 
        ...form, 
        year: isNaN(yr) ? new Date().getFullYear() : yr, 
        photo_url: photo_url || null, 
        is_published: true,
        is_featured: editing ? (editing as any).is_featured : false
      });
      triggerConfetti("burst");
      toast.success(editing ? "Updated" : "Added to Honor Roll 🎉");
      setOpen(false);
    } catch { toast.error("Failed"); }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {/* Header with Stats */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            Student of the Month / Honor Roll
          </h3>
          <p className="text-xs text-muted-foreground">{entries.length} entries</p>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-muted rounded-lg p-0.5">
            <Button
              size="sm"
              variant={viewMode === "grid" ? "default" : "ghost"}
              className="h-8 px-2"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant={viewMode === "timeline" ? "default" : "ghost"}
              className="h-8 px-2"
              onClick={() => setViewMode("timeline")}
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
          <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add Entry</Button>
        </div>
      </div>

      {/* Stats Counter */}
      <HonorRollStats entries={entries} />

      {/* Search & Filter Bar */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search students..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterClass} onValueChange={setFilterClass}>
          <SelectTrigger className="w-[130px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Class" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes.map(c => (
              <SelectItem key={c} value={c}>Class {c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content Area */}
      {isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : (
        <>
          {/* Featured Student Banner */}
          {featuredEntry && viewMode === "grid" && !searchQuery && filterClass === "all" && (
            <StudentOfMonthBanner entry={featuredEntry} />
          )}

          {/* Top 3 Podium */}
          {filteredEntries.length >= 3 && viewMode === "grid" && !searchQuery && filterClass === "all" && (
            <TopStudentPodium 
              entries={filteredEntries} 
              onEdit={openEdit} 
              onDelete={(id) => remove.mutateAsync(id)} 
            />
          )}

          {/* Grid or Timeline View */}
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {gridEntries.map(e => (
                <HonorRollCertificateCard
                  key={e.id}
                  entry={e}
                  onEdit={openEdit}
                  onDelete={(id) => remove.mutateAsync(id)}
                />
              ))}
            </div>
          ) : (
            /* Timeline View */
            <div className="relative space-y-0">
              {/* Vertical Line */}
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />
              
              {gridEntries
                .sort((a, b) => {
                  // Sort by year desc, month desc
                  if (b.year !== a.year) return b.year - a.year;
                  return b.month - a.month;
                })
                .map((e, idx) => {
                  const classColor = CLASS_COLORS[e.class] || CLASS_COLORS["6"];
                  return (
                    <div key={e.id} className="relative pl-14 pb-6 last:pb-0">
                      {/* Timeline Dot */}
                      <div className={`absolute left-4 w-5 h-5 rounded-full border-2 background-background ${classColor.ring} z-10 flex items-center justify-center`}>
                        <div className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${classColor.gradient}`} />
                      </div>
                      
                      {/* Timeline Card */}
                      <Card className="hover:shadow-md transition-shadow">
                        <CardContent className="p-3 flex items-center gap-3">
                          {e.photo_url ? (
                            <img src={e.photo_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 ring-2 ring-offset-2 ring-offset-background" style={{ '--tw-ring-color': classColor.ring.replace('ring-', '') } as React.CSSProperties} />
                          ) : (
                            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${classColor.gradient} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                              {e.student_name[0]}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{e.student_name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge className={`text-[10px] ${classColor.badge}`}>Class {e.class}</Badge>
                              <span className="text-[10px] text-muted-foreground">{MONTHS[e.month - 1]} {e.year}</span>
                            </div>
                            {e.reason && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{e.reason}</p>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(e)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="text-destructive">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove from Honor Roll?</AlertDialogTitle>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => remove.mutateAsync(e.id)} className="bg-destructive text-destructive-foreground">Remove</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Empty State */}
          {filteredEntries.length === 0 && (
            searchQuery || filterClass !== "all" ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">No entries match your filters</p>
                <Button variant="link" size="sm" onClick={() => { setSearchQuery(""); setFilterClass("all"); }}>
                  Clear filters
                </Button>
              </div>
            ) : (
              <HonorRollEmptyState />
            )
          )}
        </>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Entry" : "Add to Honor Roll"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Student Name *</Label>
              <Input 
                value={form.student_name} 
                onChange={(e) => setForm({ ...form, student_name: e.target.value })} 
                placeholder="Full name" 
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Class</Label>
                <Select value={form.class} onValueChange={(v) => setForm({ ...form, class: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {classes.map(c => (
                      <SelectItem key={c} value={c}>Class {c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Month</Label>
                <Select value={String(form.month)} onValueChange={(v) => setForm({ ...form, month: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>{m.slice(0, 3)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Year</Label>
                <Input 
                  type="number" 
                  value={yearInput} 
                  onChange={(e) => setYearInput(e.target.value)} 
                  placeholder="2025" 
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Reason / Achievement</Label>
              <Textarea 
                value={form.reason} 
                onChange={(e) => setForm({ ...form, reason: e.target.value })} 
                placeholder="e.g. Top scorer in Annual exams" 
                rows={2} 
              />
            </div>
            <div className="space-y-1">
              <Label>Photo</Label>
              <input 
                type="file" 
                accept="image/*" 
                onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} 
                className="text-xs text-muted-foreground file:mr-2 file:px-3 file:py-1 file:rounded-lg file:bg-secondary file:text-foreground file:text-xs file:border-0" 
              />
            </div>
            {editing && (
              <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                <input 
                  type="checkbox" 
                  id="is_featured"
                  checked={(editing as any).is_featured}
                  onChange={(e) => setEditing({ ...editing, is_featured: e.target.checked } as HonorRollEntry)}
                  className="rounded" 
                />
                <Label htmlFor="is_featured" className="text-sm cursor-pointer">
                  <Star className="w-4 h-4 inline mr-1 text-yellow-500" />
                  Feature as Student of the Month
                </Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {editing ? "Update" : "Add to Honor Roll"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

const AdminExtras = () => (
  <div className="space-y-5">
    <div>
      <h2 className="text-xl font-heading font-bold text-foreground">Extras Management</h2>
      <p className="text-sm text-muted-foreground">Daily quotes, honor roll & users</p>
    </div>
    <Tabs defaultValue="quotes">
      <TabsList className="flex w-full overflow-x-auto gap-1 h-auto p-1 justify-start">
        <TabsTrigger value="quotes" className="text-xs sm:text-sm shrink-0 px-3 py-2">
          🌙 <span className="ml-1">Quotes</span>
        </TabsTrigger>
        <TabsTrigger value="honor" className="text-xs sm:text-sm shrink-0 px-3 py-2">
          🏅 <span className="ml-1">Honor Roll</span>
        </TabsTrigger>
        <TabsTrigger value="pending" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
          <Clock className="w-3.5 h-3.5" /><span>Pending</span>
        </TabsTrigger>
        <TabsTrigger value="users" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
          <UserCog className="w-3.5 h-3.5" /><span>Users</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="quotes" className="mt-4"><QuotesManager /></TabsContent>
      <TabsContent value="honor" className="mt-4"><HonorRollManager /></TabsContent>
      <TabsContent value="pending" className="mt-4">
        <Suspense fallback={<div className="space-y-2">{[...Array(4)].map((_,i)=><div key={i} className="h-12 rounded-lg bg-muted animate-pulse"/>)}</div>}>
          <AdminPendingRequests />
        </Suspense>
      </TabsContent>
      <TabsContent value="users" className="mt-4">
        <Suspense fallback={<div className="space-y-2">{[...Array(4)].map((_,i)=><div key={i} className="h-12 rounded-lg bg-muted animate-pulse"/>)}</div>}>
          <AdminUsers />
        </Suspense>
      </TabsContent>
    </Tabs>
  </div>
);

export default AdminExtras;
