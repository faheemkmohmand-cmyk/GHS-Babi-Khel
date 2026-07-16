import { useState, useMemo, useCallback, useEffect, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";

// ── PERFORMANCE: Lazy-load every dashboard tab ──────────────────────────────
// Previously, UserDashboard.tsx eagerly imported ALL 25+ tab components at
// the top of this file. That meant opening the User Dashboard downloaded
// AND parsed the JS for recharts, jspdf, jspdf-autotable, every chart,
// every PDF generator, every tab — even tabs the user never opens (e.g.
// the Library tab with its heavy book reader, or the Notes hub with
// KaTeX + audio player). The Admin Dashboard already uses lazy() for its
// tabs (see AdminDashboard.tsx) and it works great — we're now mirroring
// that exact pattern here.
//
// Each tab is now a separate JS chunk that loads on demand when the user
// actually clicks that nav item. The active tab loads first; the others
// are not loaded until (and unless) the user visits them. The Skeleton
// fallback below shows a lightweight placeholder while the chunk loads.
//
// Tab components that are defined LOCALLY in this file (MeritListTab,
// ExamScheduleTab, HonorRollTab) cannot be lazy-loaded because they're
// not separate modules — they stay eager, which is fine because they're
// already part of this file's bundle anyway.
//
// 9 previously-imported tabs (TimetableTab, ResultsTab, NoticesTab,
// NewsTab, GalleryTab, VideosTab, AchievementsTab, RollNumbersTab,
// ResultCardTab) were imported but NEVER referenced anywhere in this
// file — they were dead code from a past refactor. They've been removed
// entirely, which also removes their (sometimes heavy) transitive deps
// from the User Dashboard's main bundle.
const NoticesNewsTab       = lazy(() => import("./tabs/NoticesNewsTab"));
const ResultsHubTab        = lazy(() => import("./tabs/ResultsHubTab"));
const MediaHighlightsTab   = lazy(() => import("./tabs/MediaHighlightsTab"));
const ScheduleHubTab       = lazy(() => import("./tabs/ScheduleHubTab"));
const OverviewTab          = lazy(() => import("./tabs/OverviewTab"));
const NotificationsPanel   = lazy(() => import("@/components/shared/NotificationsPanel"));
const LibraryTab           = lazy(() => import("./tabs/LibraryTab"));
const TeachersTab          = lazy(() => import("./tabs/TeachersTab"));
const ProfileTab           = lazy(() => import("./tabs/ProfileTab"));
const SeatingTab           = lazy(() => import("./tabs/SeatingTab"));
const NotesHub             = lazy(() => import("./tabs/NotesHub"));
const OnlineClassesTab     = lazy(() => import("./tabs/OnlineClassesTab"));
const UserCredentialsHub   = lazy(() => import("./tabs/UserCredentialsHub"));
const ExtraTab             = lazy(() => import("./tabs/ExtraTab"));
const LeaderboardTab       = lazy(() => import("./tabs/LeaderboardTab"));
const FeeTab               = lazy(() => import("./tabs/FeeTab"));

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { generateExamICS } from "@/utils/generateExamICS";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine, Legend
} from "recharts";
import {
  CheckCircle, Clock,
  ChevronDown, ChevronUp, Calendar, Trophy, TrendingUp,
  BarChart3, Star, Download, School, ChevronRight, CalendarPlus,
  BookOpen, Eye, EyeOff, CheckCircle2,
  Users, Target, Search, Crown, Sparkles, Award,
} from "lucide-react";
import { format, isPast, isToday, differenceInDays, isAfter, formatDistanceToNow } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────
interface DailyQuote { id: string; text: string; author: string | null; category: string; fixed_date: string | null; }
interface ExamEntry { id: string; class: string; exam_type: string; year: number; subject: string; paper_name: string | null; paper_code: string | null; exam_date: string; start_time: string | null; end_time: string | null; hall: string | null; notes: string | null; }
interface HonorEntry { id: string; student_name: string; class: string; month: number; year: number; reason: string | null; photo_url: string | null; }

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const examTypes: Record<string, string[]> = { "6":["1st Semester","2nd Semester"],"7":["1st Semester","2nd Semester"],"8":["1st Semester","2nd Semester"],"9":["Annual-I","Annual-II"],"10":["Annual-I","Annual-II"] };
const SUBJECT_COLORS = ["#6366f1","#1e3a8a","#10b981","#ef4444","#8b5cf6","#14b8a6","#f97316","#06b6d4","#84cc16","#ec4899"];

// ─── Exam Schedule Tab ─────────────────────────────────────────────────────────
const SCHED_SUBJECT_COLORS: Record<string, { bg: string; text: string; pdfRgb: [number,number,number] }> = {
  English:{ bg:"bg-blue-100 dark:bg-blue-900/30", text:"text-blue-700 dark:text-blue-300", pdfRgb:[219,234,254] },
  Urdu:{ bg:"bg-blue-100 dark:bg-blue-950/30", text:"text-blue-800 dark:text-blue-300", pdfRgb:[254,243,199] },
  Maths:{ bg:"bg-purple-100 dark:bg-purple-900/30", text:"text-purple-700 dark:text-purple-300", pdfRgb:[237,233,254] },
  Mathematics:{ bg:"bg-purple-100 dark:bg-purple-900/30", text:"text-purple-700 dark:text-purple-300", pdfRgb:[237,233,254] },
  Physics:{ bg:"bg-cyan-100 dark:bg-cyan-900/30", text:"text-cyan-700 dark:text-cyan-300", pdfRgb:[207,250,254] },
  Chemistry:{ bg:"bg-green-100 dark:bg-green-900/30", text:"text-green-700 dark:text-green-300", pdfRgb:[220,252,231] },
  Biology:{ bg:"bg-emerald-100 dark:bg-emerald-900/30", text:"text-emerald-700 dark:text-emerald-300", pdfRgb:[209,250,229] },
  Islamiyat:{ bg:"bg-teal-100 dark:bg-teal-900/30", text:"text-teal-700 dark:text-teal-300", pdfRgb:[204,251,241] },
  "Pak-study":{ bg:"bg-green-100 dark:bg-green-900/30", text:"text-green-700 dark:text-green-300", pdfRgb:[220,252,231] },
  "Computer Science":{ bg:"bg-indigo-100 dark:bg-indigo-900/30", text:"text-indigo-700 dark:text-indigo-300", pdfRgb:[224,231,255] },
  "G.Science":{ bg:"bg-lime-100 dark:bg-lime-900/30", text:"text-lime-700 dark:text-lime-300", pdfRgb:[236,252,203] },
  Geography:{ bg:"bg-orange-100 dark:bg-orange-900/30", text:"text-orange-700 dark:text-orange-300", pdfRgb:[255,237,213] },
  History:{ bg:"bg-rose-100 dark:bg-rose-900/30", text:"text-rose-700 dark:text-rose-300", pdfRgb:[255,228,230] },
  Pashto:{ bg:"bg-yellow-100 dark:bg-yellow-900/30", text:"text-yellow-700 dark:text-blue-300", pdfRgb:[254,249,195] },
  "M.Quran":{ bg:"bg-teal-100 dark:bg-teal-900/30", text:"text-teal-700 dark:text-teal-300", pdfRgb:[204,251,241] },
};
function schedSubjectStyle(s: string){ return SCHED_SUBJECT_COLORS[s]??{bg:"bg-secondary",text:"text-secondary-foreground",pdfRgb:[243,244,246] as [number,number,number]}; }

function generateDateSheetPDF(schedule: ExamEntry[], cls: string, examType: string, year: number) {
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();

  // ── Light background ──
  doc.setFillColor(245,249,255);
  doc.rect(0,0,w,h,"F");

  // ── Header band ──
  doc.setFillColor(220,234,250);
  doc.rect(0,0,w,28,"F");
  doc.setFillColor(180,210,245);
  doc.rect(0,28,w,0.8,"F");

  // ── School name and subtitle ──
  doc.setTextColor(20,50,100);
  doc.setFontSize(14);
  doc.setFont("helvetica","bold");
  doc.text("Government High School Babi Khel",w/2,13,{align:"center"});
  doc.setFontSize(7.5);
  doc.setFont("helvetica","normal");
  doc.setTextColor(80,110,160);
  doc.text("District Mohmand, KPK  |  Est. 2018",w/2,19,{align:"center"});
  doc.setFontSize(9.5);
  doc.setFont("helvetica","bold");
  doc.setTextColor(30,80,160);
  doc.text("EXAMINATION DATE SHEET",w/2,25.5,{align:"center"});

  // ── Info strip ──
  doc.setFillColor(255,255,255);
  doc.setDrawColor(200,215,235);
  doc.setLineWidth(0.3);
  doc.roundedRect(10,32,w-20,14,1.5,1.5,"FD");
  const info=[{label:"CLASS",value:cls},{label:"EXAM",value:examType},{label:"YEAR",value:String(year)},{label:"SUBJECTS",value:String(schedule.length)},{label:"ISSUED",value:new Date().toLocaleDateString("en-GB")}];
  const cw=(w-20)/info.length;
  info.forEach((item,i)=>{
    const x=10+i*cw+cw/2;
    doc.setTextColor(130,150,180);
    doc.setFontSize(6);
    doc.setFont("helvetica","normal");
    doc.text(item.label,x,37.5,{align:"center"});
    doc.setTextColor(20,50,100);
    doc.setFontSize(8.5);
    doc.setFont("helvetica","bold");
    doc.text(item.value,x,43.5,{align:"center"});
    if(i>0){ doc.setDrawColor(210,225,240); doc.setLineWidth(0.2); doc.line(10+i*cw,34,10+i*cw,45); }
  });

  // ── Table ──
  // Column widths: Day=25, Date=28, Subject=38, Paper Name=46, Code=18, Time=24, Hall=11 → total=190
  autoTable(doc,{
    startY:51,
    head:[["Day","Date","Subject","Paper Name","Code","Time","Hall"]],
    body:schedule.map(e=>{
      const d=new Date(e.exam_date);
      return [
        format(d,"EEEE"),
        format(d,"dd MMM yyyy"),
        e.subject,
        e.paper_name||e.subject,
        e.paper_code||"—",
        e.start_time&&e.end_time?`${e.start_time}–${e.end_time}`:e.start_time||"—",
        e.hall||"—"
      ];
    }),
    headStyles:{
      fillColor:[30,80,160],
      textColor:[255,255,255],
      fontStyle:"bold",
      fontSize:8,
      halign:"center",
      cellPadding:{top:4,bottom:4,left:2,right:2},
    },
    bodyStyles:{
      fontSize:9,
      cellPadding:{top:4,bottom:4,left:3,right:3},
      valign:"middle",
      textColor:[30,40,60],
      fillColor:[255,255,255],
      overflow:"linebreak",
      minCellHeight:12,
    },
    columnStyles:{
      0:{cellWidth:25,halign:"center",fontSize:8},
      1:{cellWidth:28,halign:"center",fontStyle:"bold",fontSize:8},
      2:{cellWidth:38,halign:"center",fontSize:9,overflow:"linebreak"},
      3:{cellWidth:46,halign:"center",fontSize:9,overflow:"linebreak"},
      4:{cellWidth:18,halign:"center",fontStyle:"bold",fontSize:8},
      5:{cellWidth:24,halign:"center",fontSize:8},
      6:{cellWidth:11,halign:"center",fontSize:8},
    },
    alternateRowStyles:{fillColor:[240,247,255]},
    didParseCell:(data)=>{
      if(data.section==="body"){
        const entry=schedule[data.row.index];
        if(entry&&isToday(new Date(entry.exam_date))){
          data.cell.styles.fillColor=[225,240,255];
          data.cell.styles.fontStyle="bold";
          data.cell.styles.textColor=[10,50,130];
        }
      }
    },
    tableLineColor:[200,218,240],
    tableLineWidth:0.2,
    margin:{left:10,right:10,bottom:18},
  });

  // ── Footer ──
  const tp=(doc as any).internal.getNumberOfPages();
  for(let p=1;p<=tp;p++){
    doc.setPage(p);
    doc.setFillColor(220,234,250);
    doc.rect(0,h-12,w,12,"F");
    doc.setDrawColor(180,210,245);
    doc.setLineWidth(0.3);
    doc.line(0,h-12,w,h-12);
    doc.setTextColor(30,80,160);
    doc.setFontSize(6.5);
    doc.setFont("helvetica","bold");
    doc.text("GHS BABI KHEL — OFFICIAL EXAMINATION DATE SHEET",w/2,h-5,{align:"center"});
    doc.setTextColor(100,130,170);
    doc.setFontSize(6);
    doc.setFont("helvetica","normal");
    doc.text(`Page ${p}/${tp}`,w-12,h-5,{align:"right"});
    doc.text(`Class ${cls}  |  ${examType}  |  ${year}`,12,h-5);
  }
  doc.save(`Datesheet_Class${cls}_${examType}_${year}.pdf`);
}

function ExamScheduleTab() {
  const { profile } = useAuth();
  const [cls, setCls] = useState(profile?.class || "6");
  const [examType, setExamType] = useState(examTypes[profile?.class || "6"][0]);
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: schedule = [], isLoading } = useQuery<ExamEntry[]>({ queryKey:["exam-schedule",cls,examType,year], queryFn:async()=>{ const{data,error}=await supabase.from("exam_schedule").select("*").eq("class",cls).eq("exam_type",examType).eq("year",year).eq("is_published",true).order("exam_date",{ascending:true}); if(error)throw error; return data??[]; }, enabled:!!cls });
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div><h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2"><Calendar className="w-5 h-5 text-primary"/>Exam Date Sheet</h2><p className="text-xs text-muted-foreground">Official examination schedule</p></div>
        {schedule.length>0&&(
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={()=>generateExamICS(schedule,cls,examType,year)}
              className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 px-3 py-1.5 rounded-xl transition-colors"
              title="Download .ics file — import into Google Calendar, iPhone Calendar, Outlook"
            >
              <CalendarPlus className="w-3.5 h-3.5"/>Add to Calendar
            </button>
            <button
              onClick={()=>generateDateSheetPDF(schedule,cls,examType,year)}
              className="flex items-center gap-1.5 text-xs font-semibold bg-accent text-accent-foreground hover:bg-accent/90 px-3 py-1.5 rounded-xl transition-colors"
            >
              <Download className="w-3.5 h-3.5"/>Download PDF
            </button>
          </div>
        )}
      </div>
      <div className="flex gap-2 flex-wrap">{["6","7","8","9","10"].map(c=><button key={c} onClick={()=>{setCls(c);setExamType(examTypes[c][0]);}} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${cls===c?"bg-accent text-accent-foreground":"bg-secondary text-muted-foreground"}`}>Class {c}</button>)}</div>
      <div className="flex gap-2 flex-wrap items-center">
        {examTypes[cls].map(e=><button key={e} onClick={()=>setExamType(e)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${examType===e?"bg-accent/20 text-accent border border-accent/40":"bg-secondary text-muted-foreground"}`}>{e}</button>)}
        <div className="ml-auto flex items-center gap-2"><label className="text-xs text-muted-foreground">Year:</label><input type="number" value={year} onChange={e=>setYear(Number(e.target.value))} className="w-20 text-xs bg-secondary border border-border rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary" min={2000} max={2099}/></div>
      </div>
      {isLoading?<div className="space-y-3">{[1,2,3,4].map(i=><Skeleton key={i} className="h-20 rounded-xl"/>)}</div>
        :schedule.length===0?<div className="bg-card rounded-2xl p-12 text-center border border-border"><Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3"/><p className="text-sm font-medium text-foreground">No exam schedule published yet</p><p className="text-xs text-muted-foreground mt-1">Admin will publish the schedule before exams begin.</p></div>
        :(<>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[{label:"Total",value:schedule.length,icon:"📋"},{label:"Upcoming",value:schedule.filter(e=>!isPast(new Date(e.exam_date))||isToday(new Date(e.exam_date))).length,icon:"⏳"},{label:"Today",value:schedule.filter(e=>isToday(new Date(e.exam_date))).length,icon:"📅"},{label:"Done",value:schedule.filter(e=>isPast(new Date(e.exam_date))&&!isToday(new Date(e.exam_date))).length,icon:"✅"}].map(s=><div key={s.label} className="bg-card border border-border rounded-xl p-3 text-center"><p className="text-2xl mb-1">{s.icon}</p><p className="text-xl font-bold text-foreground">{s.value}</p><p className="text-[11px] text-muted-foreground">{s.label}</p></div>)}</div>
          <div className="space-y-2">{schedule.map(entry=>{ const date=new Date(entry.exam_date); const past=isPast(date)&&!isToday(date); const today=isToday(date); const diff=differenceInDays(date,new Date()); const style=schedSubjectStyle(entry.subject); return (<div key={entry.id} className={`bg-card rounded-xl border shadow-sm overflow-hidden ${today?"border-blue-400 ring-2 ring-blue-400/30":past?"opacity-55 border-border":"border-border hover:border-primary/40"}`}>{today&&<div className="bg-blue-400 text-blue-950 text-center text-[11px] font-black uppercase tracking-widest py-1">📢 EXAM TODAY</div>}<div className="p-4 flex items-center gap-4"><div className={`w-16 h-16 rounded-xl flex flex-col items-center justify-center shrink-0 font-black ${today?"bg-blue-500 text-white":past?"bg-muted text-muted-foreground":"bg-primary text-white"}`}><span className="text-2xl leading-none">{format(date,"dd")}</span><span className="text-[10px] font-semibold uppercase">{format(date,"MMM")}</span><span className="text-[9px] opacity-70">{format(date,"yyyy")}</span></div><div className="flex-1 min-w-0"><div className="flex items-center gap-2 flex-wrap mb-1"><span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${style.bg} ${style.text}`}>{entry.subject}</span>{entry.paper_code&&<span className="text-[11px] font-mono font-bold bg-primary/10 text-primary dark:text-white px-2 py-0.5 rounded">{entry.paper_code}</span>}{!past&&!today&&diff<=3&&diff>=0&&<span className="text-[10px] font-bold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full animate-pulse">{diff===0?"Tomorrow!":`${diff}d left`}</span>}{past&&<span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Done</span>}</div><p className="text-sm font-bold text-foreground">{entry.paper_name||entry.subject}</p><div className="flex flex-wrap items-center gap-3 mt-1"><span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3"/>{format(date,"EEEE, dd MMMM yyyy")}</span>{entry.start_time&&<span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3"/>{entry.start_time}{entry.end_time?` – ${entry.end_time}`:""}</span>}{entry.hall&&<span className="text-xs text-muted-foreground flex items-center gap-1"><ChevronRight className="w-3 h-3"/>Hall: {entry.hall}</span>}{entry.notes&&<span className="text-xs italic text-muted-foreground">{entry.notes}</span>}</div></div>{!past&&!today&&diff>0&&<div className={`hidden sm:flex flex-col items-center justify-center w-14 h-14 rounded-xl shrink-0 ${diff<=7?"bg-orange-100":"bg-secondary"}`}><span className={`text-lg font-black ${diff<=7?"text-orange-600":"text-foreground"}`}>{diff}</span><span className="text-[9px] font-medium text-muted-foreground">days</span></div>}</div></div>); })}</div>
        </>)}
    </div>
  );
}









// ─── Honor Roll Tab ───────────────────────────────────────────────────────────
function HonorRollTab() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const { data: entries = [], isLoading } = useQuery<HonorEntry[]>({
    queryKey: ["honor-roll", year, month],
    queryFn: async () => {
      const { data, error } = await supabase.from("honor_roll").select("*").eq("is_published", true).eq("year", year).eq("month", month).order("class");
      if (error) throw error; return data ?? [];
    },
  });

  const byClass = entries.reduce((acc, e) => { if (!acc[e.class]) acc[e.class] = []; acc[e.class].push(e); return acc; }, {} as Record<string, HonorEntry[]>);

  return (
    <div className="space-y-5">
      <div><h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2"><Trophy className="w-5 h-5 text-blue-500" />Honor Roll</h2><p className="text-xs text-muted-foreground">Students of the Month</p></div>
      <div className="flex gap-1.5 flex-wrap">{MONTHS.map((m, i) => <button key={m} onClick={() => setMonth(i+1)} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${month === i+1 ? "bg-blue-500 text-white" : "bg-secondary text-secondary-foreground"}`}>{m.slice(0,3)}</button>)}</div>
      <div className="flex gap-2 items-center"><label className="text-xs text-muted-foreground">Year:</label><input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="w-20 text-xs bg-secondary border-none rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary" /></div>
      {isLoading ? <div className="grid grid-cols-2 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
        : entries.length === 0 ? <div className="bg-card rounded-2xl p-10 text-center shadow-card"><Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">No honor roll for {MONTHS[month-1]} {year} yet.</p></div>
        : <div className="space-y-6">{Object.entries(byClass).sort((a,b) => Number(a[0])-Number(b[0])).map(([cls, students]) => (
          <div key={cls}><p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Class {cls}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{students.map(e => (
              <div key={e.id} className="bg-card rounded-2xl border border-border p-4 text-center shadow-sm">
                {e.photo_url ? <img src={e.photo_url} alt={e.student_name} className="w-14 h-14 rounded-full object-cover mx-auto mb-2 border-2 border-blue-400" />
                  : <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-orange-500 flex items-center justify-center text-white font-black text-2xl mx-auto mb-2">{e.student_name[0]}</div>}
                <p className="text-sm font-bold text-foreground">{e.student_name}</p>
                <p className="text-xs text-muted-foreground">Class {e.class}</p>
                {e.reason && <p className="text-[10px] text-muted-foreground mt-1.5 italic line-clamp-2">"{e.reason}"</p>}
                <span className="inline-block mt-2 text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-semibold">🏅 {MONTHS[e.month-1]} {e.year}</span>
              </div>
            ))}</div>
          </div>
        ))}</div>}
    </div>
  );
}

// ─── Merit List Tab (Student View) ───────────────────────────────────────────
// Reads published merit lists from the `merit_lists` table (admin-controlled).
// Shows a live countdown for scheduled ones, then reveals the ranked list
// once publish_at <= now(). Uses the same professional PDF style as admin.

interface MeritStudentEntry {
  student_id: string; full_name: string; roll_number: string;
  class: string; exam_type?: string; photo_url: string | null;
  obtained_marks: number; total_marks: number; percentage: number;
  grade: string; position: number;
}

interface PublishedMeritList {
  id: string;
  scope: string;            // 'class' | 'school'
  class: string;            // '6'-'10' or 'school'
  exam_type: string | null;
  year: number;
  is_published: boolean;
  publish_at: string | null;
  title: string | null;
  notes: string | null;
  created_at: string;
  // ── Snapshot fields (v2 — decoupled from `results` table) ──
  entries?: MeritStudentEntry[] | null;
  total_students?: number;
  passing_count?: number;
  highest_percentage?: number;
  average_percentage?: number;
  theme?: string | null;
}

// Visual theme presets — match admin's selection at publish time
const ML_THEME_PRESETS: Record<string, { from: string; to: string; accent: string; ring: string }> = {
  gold:    { from: "from-amber-500",  to: "to-yellow-600",  accent: "text-amber-600",  ring: "ring-amber-400/40"  },
  royal:   { from: "from-blue-600",   to: "to-indigo-700",  accent: "text-blue-600",   ring: "ring-blue-400/40"   },
  emerald: { from: "from-emerald-500",to: "to-teal-700",    accent: "text-emerald-600",ring: "ring-emerald-400/40"},
  rose:    { from: "from-rose-500",   to: "to-pink-700",    accent: "text-rose-600",   ring: "ring-rose-400/40"   },
  violet:  { from: "from-violet-500", to: "to-purple-700",  accent: "text-violet-600", ring: "ring-violet-400/40" },
};
function getMlTheme(id?: string | null) {
  return ML_THEME_PRESETS[id || "gold"] || ML_THEME_PRESETS.gold;
}

// ─── Professional PDF helpers (minimal color palette — matches admin side) ──
const ML_PDF_COLOR = {
  ink:    [10, 10, 10] as [number, number, number],
  head:   [31, 31, 31] as [number, number, number],
  sub:    [82, 82, 82] as [number, number, number],
  muted:  [120, 120, 120] as [number, number, number],
  altRow: [246, 247, 248] as [number, number, number],
  pass:   [15, 81, 50] as [number, number, number],
  fail:   [139, 0, 0] as [number, number, number],
  white:  [255, 255, 255] as [number, number, number],
  rule:   [180, 180, 180] as [number, number, number],
};

function mlMedalLabel(pos: number) {
  return pos === 1 ? "1st" : pos === 2 ? "2nd" : pos === 3 ? "3rd" : `${pos}th`;
}

function buildMeritPDF(all: MeritStudentEntry[], examType: string, year: number, singleClass?: string, title?: string | null) {
  if (!all.length) return;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const ML = 14, MR = 14;

  function drawHeader(titleText: string, subtitle: string) {
    doc.setDrawColor(ML_PDF_COLOR.ink[0], ML_PDF_COLOR.ink[1], ML_PDF_COLOR.ink[2]);
    doc.setLineWidth(1.0);
    doc.line(ML, 10, w - MR, 10);
    doc.setTextColor(ML_PDF_COLOR.ink[0], ML_PDF_COLOR.ink[1], ML_PDF_COLOR.ink[2]);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("GOVERNMENT HIGH SCHOOL BABI KHEL", w / 2, 17, { align: "center" });
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(ML_PDF_COLOR.sub[0], ML_PDF_COLOR.sub[1], ML_PDF_COLOR.sub[2]);
    doc.text("District Mohmand, Khyber Pakhtunkhwa  |  Established 2018", w / 2, 22, { align: "center" });
    doc.setDrawColor(ML_PDF_COLOR.rule[0], ML_PDF_COLOR.rule[1], ML_PDF_COLOR.rule[2]);
    doc.setLineWidth(0.25);
    doc.line(ML, 25, w - MR, 25);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(ML_PDF_COLOR.ink[0], ML_PDF_COLOR.ink[1], ML_PDF_COLOR.ink[2]);
    doc.text(titleText, w / 2, 31, { align: "center" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(ML_PDF_COLOR.sub[0], ML_PDF_COLOR.sub[1], ML_PDF_COLOR.sub[2]);
    doc.text(subtitle, w / 2, 36, { align: "center" });
    doc.setDrawColor(ML_PDF_COLOR.ink[0], ML_PDF_COLOR.ink[1], ML_PDF_COLOR.ink[2]);
    doc.setLineWidth(1.0);
    doc.line(ML, 39, w - MR, 39);
  }

  function drawStats(ent: MeritStudentEntry[], y: number) {
    const passing = ent.filter(e => e.percentage >= 33);
    const highest = Math.max(...ent.map(e => e.percentage));
    const avg = Math.round(ent.reduce((s, e) => s + e.percentage, 0) / ent.length);
    const passRate = Math.round((passing.length / ent.length) * 100);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(ML_PDF_COLOR.sub[0], ML_PDF_COLOR.sub[1], ML_PDF_COLOR.sub[2]);
    doc.text(
      `Total: ${ent.length}    Passed: ${passing.length}    Failed: ${ent.length - passing.length}    Highest: ${highest.toFixed(1)}%    Average: ${avg}%    Pass Rate: ${passRate}%`,
      w / 2, y, { align: "center" }
    );
  }

  function drawFooter(pageNum: number, totalPages: number) {
    doc.setDrawColor(ML_PDF_COLOR.rule[0], ML_PDF_COLOR.rule[1], ML_PDF_COLOR.rule[2]);
    doc.setLineWidth(0.25);
    doc.line(ML, h - 12, w - MR, h - 12);
    doc.setTextColor(ML_PDF_COLOR.muted[0], ML_PDF_COLOR.muted[1], ML_PDF_COLOR.muted[2]);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.text("GHS Babi Khel  —  Official Merit List", ML, h - 7);
    doc.text(`Generated: ${format(new Date(), "dd/MM/yyyy")}`, w / 2, h - 7, { align: "center" });
    doc.text(`Page ${pageNum} / ${totalPages}`, w - MR, h - 7, { align: "right" });
  }

  if (singleClass) {
    const ent = all.filter(e => e.class === singleClass);
    if (!ent.length) return;
    const clsExamType = (ent[0] as any).exam_type || examType;
    drawHeader(
      title || `MERIT LIST — CLASS ${singleClass}`,
      `${clsExamType}  |  Year ${year}  |  ${ent.length} Students`
    );
    drawStats(ent, 44);
    autoTable(doc, {
      startY: 49,
      head: [["Rank", "Roll No", "Student Name", "Marks Obtained", "%", "Grade", "Status"]],
      body: ent.map((e, i) => [
        mlMedalLabel(i + 1),
        e.roll_number,
        e.full_name,
        `${e.obtained_marks} / ${e.total_marks}`,
        `${Number(e.percentage).toFixed(1)}%`,
        e.grade,
        e.percentage >= 33 ? "Pass" : "Fail",
      ]),
      headStyles: { fillColor: ML_PDF_COLOR.head, textColor: ML_PDF_COLOR.white, fontStyle: "bold", fontSize: 8.5, halign: "center", valign: "middle", cellPadding: 3.5 },
      bodyStyles: { fontSize: 8.5, cellPadding: 3, textColor: ML_PDF_COLOR.ink, valign: "middle", fontStyle: "normal" },
      alternateRowStyles: { fillColor: ML_PDF_COLOR.altRow },
      columnStyles: {
        0: { halign: "center", cellWidth: 14 },
        1: { halign: "center", cellWidth: 22 },
        2: { halign: "center", cellWidth: 68, overflow: "linebreak" },
        3: { halign: "center", cellWidth: 28 },
        4: { halign: "center", cellWidth: 18 },
        5: { halign: "center", cellWidth: 15 },
        6: { halign: "center", cellWidth: 15 },
      },
      didParseCell: (data) => {
        if (data.section === "body") {
          if (data.column.index === 0 && data.row.index < 3) data.cell.styles.fontStyle = "bold";
          if (data.column.index === 6) {
            const val = String(data.cell.raw);
            data.cell.styles.textColor = val === "Pass" ? ML_PDF_COLOR.pass : ML_PDF_COLOR.fail;
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
      margin: { left: ML, right: MR, bottom: 18 },
      didDrawPage: (data) => { const total = (doc as any).internal.getNumberOfPages(); drawFooter(data.pageNumber, total); },
    });
  } else {
    const allSorted = [...all].sort((a, b) => b.percentage - a.percentage);
    drawHeader(
      title || "WHOLE SCHOOL MERIT LIST",
      `Year ${year}  |  All Classes Combined  |  ${allSorted.length} Students`
    );
    drawStats(allSorted, 44);
    autoTable(doc, {
      startY: 49,
      head: [["Rank", "Class", "Roll No", "Student Name", "Marks Obtained", "%", "Grade", "Status"]],
      body: allSorted.map((e, i) => [
        mlMedalLabel(i + 1),
        `Cls ${e.class}`,
        e.roll_number,
        e.full_name,
        `${e.obtained_marks} / ${e.total_marks}`,
        `${Number(e.percentage).toFixed(1)}%`,
        e.grade,
        e.percentage >= 33 ? "Pass" : "Fail",
      ]),
      headStyles: { fillColor: ML_PDF_COLOR.head, textColor: ML_PDF_COLOR.white, fontStyle: "bold", fontSize: 8, halign: "center", valign: "middle", cellPadding: 3 },
      bodyStyles: { fontSize: 8, cellPadding: 2.8, textColor: ML_PDF_COLOR.ink, overflow: "linebreak", valign: "middle", fontStyle: "normal" },
      alternateRowStyles: { fillColor: ML_PDF_COLOR.altRow },
      columnStyles: {
        0: { halign: "center", cellWidth: 13 },
        1: { halign: "center", cellWidth: 16 },
        2: { halign: "center", cellWidth: 20 },
        3: { halign: "center", cellWidth: 58, overflow: "linebreak" },
        4: { halign: "center", cellWidth: 26 },
        5: { halign: "center", cellWidth: 18 },
        6: { halign: "center", cellWidth: 14 },
        7: { halign: "center", cellWidth: 14 },
      },
      didParseCell: (data) => {
        if (data.section === "body") {
          if (data.column.index === 0 && data.row.index < 3) data.cell.styles.fontStyle = "bold";
          if (data.column.index === 7) {
            const val = String(data.cell.raw);
            data.cell.styles.textColor = val === "Pass" ? ML_PDF_COLOR.pass : ML_PDF_COLOR.fail;
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
      margin: { left: ML, right: MR, bottom: 18 },
      didDrawPage: (data) => { const total = (doc as any).internal.getNumberOfPages(); drawFooter(data.pageNumber, total); },
    });
  }

  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(p, totalPages);
  }
  doc.save(
    singleClass
      ? `Merit_Class${singleClass}_${year}.pdf`
      : `School_Merit_${year}.pdf`
  );
}

// ─── Live countdown hook ────────────────────────────────────────────────────
function useNowTick(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ─── Fetch published merit lists (admin-published, with countdown support) ──
// v2: also fetches the snapshot `entries` JSONB column so the merit list no
// longer depends on the live `results` table. If `entries` is empty (legacy
// rows published before this migration), the dashboard falls back to the
// live `results` query (see useLegacyMeritListData below).
function usePublishedMeritLists() {
  return useQuery<PublishedMeritList[]>({
    queryKey: ["published-merit-lists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merit_lists")
        .select(`
          id, scope, class, exam_type, year, is_published, publish_at,
          title, notes, created_at,
          entries, total_students, passing_count,
          highest_percentage, average_percentage, theme
        `)
        .eq("is_published", true)
        .order("created_at", { ascending: false });
      if (error) {
        console.warn("[MeritListTab] fetch error:", error.message);
        return [];
      }
      return (data ?? []) as PublishedMeritList[];
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

// ─── Fetch the entries for a given merit list ────────────────────────────────
// v2 strategy:
//   1. If `ml.entries` (snapshot) is a non-empty array → return it directly.
//      This is the decoupled path: deleting results in "Manage Result" has
//      ZERO effect on the merit list.
//   2. Otherwise (legacy rows published before the v2 migration) → fall back
//      to a live query against the `results` table so old data still renders.
function useMeritListData(ml: PublishedMeritList | null) {
  return useQuery<MeritStudentEntry[]>({
    queryKey: ["merit-list-data", ml?.id],
    queryFn: async () => {
      if (!ml) return [];
      // ── Path 1: snapshot (v2) ──
      if (Array.isArray(ml.entries) && ml.entries.length > 0) {
        // Re-rank in case the snapshot was stored out of order
        const sorted = [...ml.entries].sort((a, b) => b.percentage - a.percentage);
        return sorted.map((e: any, i: number) => ({
          student_id: e.student_id,
          full_name: e.full_name || "Unknown",
          roll_number: e.roll_number || "-",
          class: e.class,
          exam_type: e.exam_type,
          photo_url: e.photo_url || null,
          obtained_marks: Number(e.obtained_marks) || 0,
          total_marks: Number(e.total_marks) || 0,
          percentage: Number(e.percentage) || 0,
          grade: e.grade || "—",
          position: i + 1,
        }));
      }
      // ── Path 2: legacy fallback (live results query) ──
      let q = supabase
        .from("results")
        .select("student_id,obtained_marks,total_marks,percentage,grade,position,class,exam_type,is_published,students(full_name,roll_number,photo_url)")
        .eq("year", ml.year)
        .eq("is_published", true)
        .order("percentage", { ascending: false });
      if (ml.scope === "class") {
        q = q.eq("class", ml.class);
        if (ml.exam_type) q = q.eq("exam_type", ml.exam_type);
      }
      const { data, error } = await q.limit(1000);
      if (error) throw error;
      const best = new Map<string, any>();
      for (const r of (data ?? [])) {
        const key = r.student_id + "_" + r.class;
        if (!best.has(key) || r.percentage > best.get(key).percentage) {
          best.set(key, r);
        }
      }
      return Array.from(best.values())
        .sort((a, b) => b.percentage - a.percentage)
        .map((r: any, i: number) => ({
          student_id: r.student_id,
          full_name: r.students?.full_name || "Unknown",
          roll_number: r.students?.roll_number || "-",
          class: r.class,
          exam_type: r.exam_type,
          photo_url: r.students?.photo_url || null,
          obtained_marks: r.obtained_marks,
          total_marks: r.total_marks,
          percentage: Number(r.percentage) || 0,
          grade: r.grade || "—",
          position: i + 1,
        }));
    },
    enabled: !!ml,
  });
}

// ─── Countdown unit (module-level component — NOT defined inside render) ────
// Defining a component inside another component's render is a React anti-
// pattern that causes infinite re-render loops (React sees a new component
// type on every render, unmounts/remounts, crashes). So this must live at
// module scope.
function CountdownUnit({ value, label, color = "text-amber-600" }: { value: number; label: string; color?: string }) {
  return (
    <div className="bg-card border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 min-w-[64px]">
      <p className={`text-2xl font-black tabular-nums ${color}`}>{String(Math.max(0, value)).padStart(2, "0")}</p>
      <p className="text-[10px] uppercase text-muted-foreground font-semibold">{label}</p>
    </div>
  );
}

// ─── Stat card (modern, iconified) ───────────────────────────────────────────
function MeritStatCard({ icon: Icon, label, value, accent, sub }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string | number; accent: string; sub?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 transition-all hover:shadow-md hover:-translate-y-0.5">
      <div className={`absolute -right-4 -top-4 w-16 h-16 rounded-full ${accent} opacity-10`} />
      <div className="relative">
        <div className={`w-9 h-9 rounded-xl ${accent} flex items-center justify-center mb-2.5`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        <p className="text-xl md:text-2xl font-black tabular-nums leading-none">{value}</p>
        <p className="text-[11px] font-medium text-muted-foreground mt-1.5">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Top-3 Podium (advanced visual) ──────────────────────────────────────────
function Top3Podium({ entries, showClass = false }: { entries: MeritStudentEntry[]; showClass?: boolean }) {
  if (entries.length < 1) return null;
  const top3 = entries.slice(0, 3);
  // Display order: 2nd, 1st, 3rd
  const order = [top3[1], top3[0], top3[2]].filter(Boolean);
  const heights = ["h-24", "h-32", "h-20"]; // 2nd, 1st, 3rd
  const medalColors = [
    "from-gray-300 to-gray-400",   // 2nd - silver
    "from-amber-400 to-yellow-500", // 1st - gold
    "from-orange-400 to-amber-600", // 3rd - bronze
  ];
  const medalEmojis = ["🥈", "🥇", "🥉"];
  const podiumRanks = [2, 1, 3];

  return (
    <div className="rounded-2xl border border-border bg-gradient-to-br from-amber-50/50 via-card to-yellow-50/30 dark:from-amber-950/20 dark:to-yellow-950/10 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Crown className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-bold">Top 3 Achievers</h3>
        <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
      </div>
      <div className="flex items-end justify-center gap-3 sm:gap-6">
        {order.map((entry, idx) => {
          const rank = podiumRanks[idx];
          const isFirst = rank === 1;
          return (
            <div key={`${entry.student_id}-${rank}`} className="flex flex-col items-center text-center flex-1 max-w-[120px]">
              {/* Avatar */}
              <div className="relative mb-2">
                <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${medalColors[idx]} blur-md opacity-50`} />
                <div className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-full p-0.5 bg-gradient-to-br ${medalColors[idx]}`}>
                  {entry.photo_url
                    ? <img src={entry.photo_url} alt="" className="w-full h-full rounded-full object-cover" />
                    : <div className="w-full h-full rounded-full bg-card flex items-center justify-center font-bold text-lg">
                        {(entry.full_name || "?")[0]}
                      </div>}
                </div>
                <span className={`absolute -bottom-1 -right-1 text-lg sm:text-xl ${isFirst ? "scale-125" : ""}`}>
                  {medalEmojis[idx]}
                </span>
              </div>
              {/* Name & details */}
              <p className={`text-xs sm:text-sm font-bold leading-tight truncate w-full ${isFirst ? "text-amber-700 dark:text-amber-300" : ""}`}>
                {entry.full_name}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                {showClass && <span className="text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded">Cls {entry.class}</span>}
                <span className="text-[10px] text-muted-foreground font-mono">{entry.roll_number}</span>
              </div>
              <p className={`text-sm sm:text-base font-black tabular-nums mt-1 ${isFirst ? "text-amber-600" : "text-foreground"}`}>
                {Number(entry.percentage).toFixed(1)}%
              </p>
              {/* Podium pillar */}
              <div className={`mt-2 w-full ${heights[idx]} rounded-t-lg bg-gradient-to-br ${medalColors[idx]} flex items-start justify-center pt-1.5`}>
                <span className="text-white font-black text-base sm:text-lg drop-shadow">{rank}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MeritListTab() {
  const now = useNowTick(1000);
  const { data: publishedLists = [], isLoading: listsLoading } = usePublishedMeritLists();
  const [search, setSearch] = useState("");

  // A merit list is "live" if is_published AND (publish_at IS NULL OR publish_at <= now)
  const liveLists = publishedLists.filter(ml =>
    ml.is_published && (!ml.publish_at || !isAfter(new Date(ml.publish_at), now))
  );
  const scheduledLists = publishedLists.filter(ml =>
    ml.is_published && ml.publish_at && isAfter(new Date(ml.publish_at), now)
  );

  // Default selection = most recent live list, or most recent scheduled if none live
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedId) {
      const firstLive = publishedLists.find(ml =>
        ml.is_published && (!ml.publish_at || !isAfter(new Date(ml.publish_at), now))
      );
      const firstScheduled = publishedLists.find(ml =>
        ml.is_published && ml.publish_at && isAfter(new Date(ml.publish_at), now)
      );
      const target = firstLive || firstScheduled;
      if (target) setSelectedId(target.id);
    } else {
      const stillExists = publishedLists.find(l => l.id === selectedId);
      if (!stillExists) {
        const firstLive = publishedLists.find(ml =>
          ml.is_published && (!ml.publish_at || !isAfter(new Date(ml.publish_at), now))
        );
        const firstScheduled = publishedLists.find(ml =>
          ml.is_published && ml.publish_at && isAfter(new Date(ml.publish_at), now)
        );
        setSelectedId(firstLive?.id || firstScheduled?.id || null);
      }
    }
  }, [publishedLists, selectedId, now]);

  const selectedList = publishedLists.find(l => l.id === selectedId) || null;
  const isSelectedLive = selectedList && (!selectedList.publish_at || !isAfter(new Date(selectedList.publish_at), now));

  const { data: entries = [], isLoading: entriesLoading } = useMeritListData(
    isSelectedLive ? selectedList : null
  );

  // Apply search filter to entries
  const filteredEntries = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase().trim();
    return entries.filter(e =>
      (e.full_name || "").toLowerCase().includes(q) ||
      (e.roll_number || "").toLowerCase().includes(q) ||
      String(e.class || "").includes(q)
    );
  }, [entries, search]);

  // Snapshot stats (use stored snapshot values when available, fall back to live calc)
  const stats = useMemo(() => {
    const total = selectedList?.total_students ?? entries.length;
    const passing = selectedList?.passing_count ?? entries.filter(e => e.percentage >= 33).length;
    const highest = selectedList?.highest_percentage != null
      ? Number(selectedList.highest_percentage)
      : (entries.length ? Math.max(...entries.map(e => e.percentage)) : 0);
    const avg = selectedList?.average_percentage != null
      ? Number(selectedList.average_percentage)
      : (entries.length ? Math.round(entries.reduce((s, e) => s + e.percentage, 0) / entries.length) : 0);
    const passRate = total ? Math.round((passing / total) * 100) : 0;
    return { total, passing, highest, avg, passRate };
  }, [selectedList, entries]);

  const theme = getMlTheme(selectedList?.theme);

  if (listsLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${theme.from} ${theme.to} p-5 text-white shadow-lg`}>
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-12 translate-x-12" />
        <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-white/5 translate-y-8 -translate-x-8" />
        <div className="relative flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-heading font-black leading-tight">Merit List</h2>
            <p className="text-sm text-white/90 mt-0.5">
              Official school examination rankings — published by admin
            </p>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {publishedLists.length === 0 && (
        <div className="bg-card rounded-2xl p-12 text-center border border-border">
          <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No merit list published yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            When the admin publishes a merit list, it will appear here instantly.
          </p>
        </div>
      )}

      {/* Scheduled (countdown) merit lists */}
      {scheduledLists.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Coming Soon
          </p>
          {scheduledLists.map(ml => {
            const target = new Date(ml.publish_at!);
            const diff = target.getTime() - now.getTime();
            const days = Math.floor(diff / 86400000);
            const hours = Math.floor((diff % 86400000) / 3600000);
            const mins = Math.floor((diff % 3600000) / 60000);
            const secs = Math.floor((diff % 60000) / 1000);
            const countdown = days > 0
              ? `${days}d ${hours}h ${mins}m`
              : hours > 0
                ? `${hours}h ${mins}m ${secs}s`
                : `${mins}m ${secs}s`;
            const isSelected = selectedId === ml.id;
            const mlTheme = getMlTheme(ml.theme);
            return (
              <button
                key={ml.id}
                onClick={() => setSelectedId(ml.id)}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${mlTheme.from} ${mlTheme.to} text-white flex items-center justify-center shrink-0`}>
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-foreground truncate">
                        {ml.title || (ml.scope === "school"
                          ? `Whole School Merit List ${ml.year}`
                          : `Class ${ml.class} Merit List ${ml.year}`)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {ml.scope === "school" ? "Whole School" : `Class ${ml.class}`}
                        {ml.exam_type && ` · ${ml.exam_type}`}
                        {` · Year ${ml.year}`}
                      </p>
                      {ml.notes && (
                        <p className="text-xs text-muted-foreground mt-1 italic line-clamp-1">"{ml.notes}"</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">Goes live in</p>
                    <p className="text-lg font-black text-amber-600 tabular-nums">{countdown}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(target, "dd MMM, h:mm a")}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Live (published) merit lists */}
      {liveLists.length > 0 && (
        <div className="space-y-2">
          {scheduledLists.length > 0 && (
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Live Now
            </p>
          )}
          {liveLists.map(ml => {
            const isSelected = selectedId === ml.id;
            const mlTheme = getMlTheme(ml.theme);
            const hasSnapshot = Array.isArray(ml.entries) && ml.entries.length > 0;
            return (
              <button
                key={ml.id}
                onClick={() => setSelectedId(ml.id)}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${mlTheme.from} ${mlTheme.to} text-white flex items-center justify-center shrink-0`}>
                      {ml.scope === "school" ? <School className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-foreground truncate">
                        {ml.title || (ml.scope === "school"
                          ? `Whole School Merit List ${ml.year}`
                          : `Class ${ml.class} Merit List ${ml.year}`)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {ml.scope === "school" ? "Whole School" : `Class ${ml.class}`}
                        {ml.exam_type && ` · ${ml.exam_type}`}
                        {` · Year ${ml.year}`}
                      </p>
                      {ml.notes && (
                        <p className="text-xs text-muted-foreground mt-1 italic line-clamp-1">"{ml.notes}"</p>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> Live
                    </span>
                    {hasSnapshot && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-1.5 py-0.5 rounded-full">
                        <Award className="w-2.5 h-2.5" /> Snapshot
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected merit list — table (view-only, no download) */}
      {selectedList && (
        <>
          {/* Countdown display for scheduled */}
          {!isSelectedLive && selectedList.publish_at && (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-2 border-amber-200 dark:border-amber-800 rounded-2xl p-8 text-center">
              <Clock className="w-12 h-12 text-amber-500 mx-auto mb-3 animate-pulse" />
              <p className="text-sm font-semibold text-foreground">
                {selectedList.title || "Merit List"}
              </p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Goes live {format(new Date(selectedList.publish_at), "EEEE, dd MMMM yyyy 'at' h:mm a")}
              </p>
              <div className="flex justify-center gap-3">
                {(() => {
                  const target = new Date(selectedList.publish_at);
                  const diff = target.getTime() - now.getTime();
                  const days = Math.floor(diff / 86400000);
                  const hours = Math.floor((diff % 86400000) / 3600000);
                  const mins = Math.floor((diff % 3600000) / 60000);
                  const secs = Math.floor((diff % 60000) / 1000);
                  return (
                    <>
                      {days > 0 && <CountdownUnit value={days} label="Days" />}
                      <CountdownUnit value={hours} label="Hours" />
                      <CountdownUnit value={mins} label="Min" />
                      <CountdownUnit value={secs} label="Sec" />
                    </>
                  );
                })()}
              </div>
              {selectedList.notes && (
                <p className="text-xs text-muted-foreground mt-4 italic">"{selectedList.notes}"</p>
              )}
            </div>
          )}

          {/* Live table */}
          {isSelectedLive && (
            <>
              {/* Modern stat cards */}
              {entries.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <MeritStatCard icon={Users}        label="Total Students" value={stats.total}            accent="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300" />
                  <MeritStatCard icon={CheckCircle2} label="Pass Rate"      value={`${stats.passRate}%`} sub={`${stats.passing} passed`} accent="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300" />
                  <MeritStatCard icon={TrendingUp}   label="Highest %"      value={`${stats.highest.toFixed(1)}%`} accent="bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300" />
                  <MeritStatCard icon={Target}       label="Average %"      value={`${stats.avg}%`}       accent="bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300" />
                </div>
              )}

              {/* Top-3 Podium */}
              {entries.length > 0 && (
                <Top3Podium entries={entries} showClass={selectedList.scope === "school"} />
              )}

              {entriesLoading ? (
                <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
              ) : entries.length === 0 ? (
                <div className="bg-card rounded-2xl p-12 text-center border border-border">
                  <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground">No results data found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    The admin published this merit list but no matching results exist in the database.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Search bar */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={`Search by name, roll no${selectedList.scope === "school" ? ", or class" : ""}…`}
                      className="w-full pl-9 pr-16 py-2.5 text-sm rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    {search && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {filteredEntries.length}/{entries.length}
                      </span>
                    )}
                  </div>

                  {/* Table */}
                  <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
                    <div className={`bg-gradient-to-r ${theme.from} ${theme.to} text-white px-4 py-3 flex items-center justify-between`}>
                      <div>
                        <h3 className="font-bold text-sm">
                          {selectedList.title || (selectedList.scope === "school"
                            ? `Whole School — ${selectedList.year}`
                            : `Class ${selectedList.class} — ${selectedList.exam_type} ${selectedList.year}`)}
                        </h3>
                        <p className="text-xs text-white/80">{entries.length} students ranked</p>
                      </div>
                      <Trophy className="w-5 h-5" />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50 border-b border-border">
                            <th className="p-3 text-center font-semibold text-xs">Rank</th>
                            {selectedList.scope === "school" && <th className="p-3 text-center font-semibold text-xs">Class</th>}
                            <th className="p-3 text-left font-semibold text-xs">Roll No</th>
                            <th className="p-3 text-left font-semibold text-xs">Student Name</th>
                            <th className="p-3 text-center font-semibold text-xs">Marks</th>
                            <th className="p-3 text-center font-semibold text-xs">%</th>
                            <th className="p-3 text-center font-semibold text-xs">Grade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredEntries.map((e) => {
                            const originalIdx = entries.indexOf(e);
                            return (
                              <tr key={`${e.student_id}-${originalIdx}`} className={`border-b border-border/50 transition-colors ${
                                originalIdx === 0 ? "bg-yellow-50/80 dark:bg-yellow-900/20" :
                                originalIdx === 1 ? "bg-gray-50 dark:bg-gray-900/20" :
                                originalIdx === 2 ? "bg-orange-50/80 dark:bg-orange-900/20" :
                                "hover:bg-muted/30"
                              }`}>
                                <td className="p-3 text-center">
                                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                                    originalIdx === 0 ? "bg-yellow-400 text-yellow-900" :
                                    originalIdx === 1 ? "bg-gray-300 text-gray-800" :
                                    originalIdx === 2 ? "bg-orange-300 text-orange-900" :
                                    "bg-muted text-muted-foreground"
                                  }`}>{originalIdx < 3 ? ["🥇","🥈","🥉"][originalIdx] : originalIdx + 1}</span>
                                </td>
                                {selectedList.scope === "school" && (
                                  <td className="p-3 text-center">
                                    <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                      {e.class}
                                    </span>
                                  </td>
                                )}
                                <td className="p-3 font-mono text-xs text-muted-foreground">{e.roll_number}</td>
                                <td className="p-3">
                                  <div className="flex items-center gap-2">
                                    {e.photo_url
                                      ? <img src={e.photo_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                                      : <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">{(e.full_name || "?")[0]}</div>
                                    }
                                    <span className={`text-sm ${originalIdx < 3 ? "font-bold text-foreground" : "text-foreground"}`}>{e.full_name}</span>
                                  </div>
                                </td>
                                <td className="p-3 text-center text-xs text-muted-foreground">{e.obtained_marks}/{e.total_marks}</td>
                                <td className="p-3 text-center font-bold text-sm">{Number(e.percentage).toFixed(1)}%</td>
                                <td className="p-3 text-center">
                                  <span className="text-[10px] font-bold bg-muted text-foreground px-2 py-0.5 rounded-full">{e.grade}</span>
                                </td>
                              </tr>
                            );
                          })}
                          {filteredEntries.length === 0 && (
                            <tr><td colSpan={selectedList.scope === "school" ? 7 : 6} className="p-6 text-center text-sm text-muted-foreground">No students match "{search}".</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── Schedule Hub wrapper (passes inline ExamScheduleTab as prop) ─────────────
const ScheduleHub = () => <ScheduleHubTab ExamScheduleTab={ExamScheduleTab} />;

// ─── Main Dashboard ───────────────────────────────────────────────────────────
const tabComponents: Record<string, React.ComponentType<any>> = {
  overview:          OverviewTab,
  notifications:     NotificationsPanel as unknown as React.ComponentType<any>,
  timetable:         ScheduleHub,
  results:           ResultsHubTab,
  "exam-rolls":      ResultsHubTab,
  "result-card":     ResultsHubTab,
  "exam-schedule":   ScheduleHub,
  "seating":         SeatingTab,
  "exam-seating":    SeatingTab,
  notices:           NoticesNewsTab,
  news:              NoticesNewsTab,
  notes:             NotesHub,
  leaderboard:       LeaderboardTab,
  library:           LibraryTab,
  gallery:           MediaHighlightsTab,
  videos:            MediaHighlightsTab,
  achievements:      MediaHighlightsTab,
  "honor-roll":      MediaHighlightsTab,
  teachers:          TeachersTab,
  profile:           ProfileTab,
  "online-classes":  OnlineClassesTab,
  "merit-list":      MeritListTab,
  "id-cards":        UserCredentialsHub,
  "credentials":     UserCredentialsHub,
  "monitor-pass":    UserCredentialsHub,
  "duty":            UserCredentialsHub,
  "extra":           ExtraTab,
  "fees":            FeeTab,
};

// ── Lightweight Suspense fallback shown while a lazy-loaded tab chunk ────────
// is downloading. Mirrors the Admin Dashboard's Fallback component. Keeps the
// sidebar + header interactive (they're outside the Suspense boundary) so the
// user can immediately click a different tab if they change their mind.
const TabFallback = () => (
  <div className="space-y-4">
    <Skeleton className="h-8 w-48" />
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
    </div>
    <Skeleton className="h-64 rounded-xl" />
  </div>
);

const UserDashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";
  const setActiveTab = useCallback((tab: string) => {
    setSearchParams({ tab }, { replace: true });
  }, [setSearchParams]);
  const TabComponent = tabComponents[activeTab] || OverviewTab;

  return (
    <DashboardLayout activeTab={activeTab} onTabChange={setActiveTab}>
      <Suspense fallback={<TabFallback />}>
        <TabComponent onNavigate={setActiveTab} />
      </Suspense>
    </DashboardLayout>
  );
};

export default UserDashboard;
