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
// Tab components that are defined LOCALLY in this file (ExamScheduleTab,
// HonorRollTab) cannot be lazy-loaded because they're
// not separate modules — they stay eager, which is fine because they're
// already part of this file's bundle anyway.
//
// 9 previously-imported tabs (TimetableTab, ResultsTab, NoticesTab,
// NewsTab, GalleryTab, VideosTab, AchievementsTab, RollNumbersTab,
// ResultCardTab) were imported but NEVER referenced anywhere in this
// file — they were dead code from a past refactor. They've been removed
// entirely, which also removes their (sometimes heavy) transitive deps
// from the User Dashboard's main bundle.
const MediaHighlightsTab   = lazy(() => import("./tabs/MediaHighlightsTab"));
const ScheduleHubTab       = lazy(() => import("./tabs/ScheduleHubTab"));
const OverviewTab          = lazy(() => import("./tabs/OverviewTab"));
const NotificationsPanel   = lazy(() => import("@/components/shared/NotificationsPanel"));
const TeachersTab          = lazy(() => import("./tabs/TeachersTab"));
const ProfileTab           = lazy(() => import("./tabs/ProfileTab"));
const SeatingTab           = lazy(() => import("./tabs/SeatingTab"));
const UserCredentialsHub   = lazy(() => import("./tabs/UserCredentialsHub"));
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
  Clock,
  Calendar, Trophy,
  Download, ChevronRight, CalendarPlus,
} from "lucide-react";
import { format, isPast, isToday, differenceInDays } from "date-fns";
import { examTypeLabel } from "@/utils/examTypeLabel";

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
  Arabic:{ bg:"bg-amber-100 dark:bg-amber-900/30", text:"text-amber-700 dark:text-amber-300", pdfRgb:[254,243,199] },
};
function schedSubjectStyle(s: string){ return SCHED_SUBJECT_COLORS[s]??{bg:"bg-secondary",text:"text-secondary-foreground",pdfRgb:[243,244,246] as [number,number,number]}; }

function generateDateSheetPDF(schedule: ExamEntry[], cls: string, examType: string, year: number) {
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();

  // ── Header — clean grayscale, double-line accent ──
  doc.setDrawColor(100,100,100);
  doc.setLineWidth(0.8);
  doc.line(0,28,w,28);
  doc.setLineWidth(0.3);
  doc.line(0,29.5,w,29.5);

  doc.setTextColor(40,40,40);
  doc.setFontSize(14);
  doc.setFont("helvetica","bold");
  doc.text("Government High School Babi Khel",w/2,13,{align:"center"});
  doc.setFontSize(7.5);
  doc.setFont("helvetica","normal");
  doc.setTextColor(100,100,100);
  doc.text("District Mohmand, KPK  |  Est. 2018",w/2,19,{align:"center"});
  doc.setFontSize(9.5);
  doc.setFont("helvetica","bold");
  doc.setTextColor(60,60,60);
  doc.text("EXAMINATION DATE SHEET",w/2,25.5,{align:"center"});

  // ── Info strip ──
  doc.setFillColor(250,250,250);
  doc.setDrawColor(190,190,190);
  doc.setLineWidth(0.3);
  doc.roundedRect(10,34,w-20,14,1.5,1.5,"FD");
  const info=[{label:"CLASS",value:cls},{label:"EXAM",value:examTypeLabel(examType)},{label:"YEAR",value:String(year)},{label:"SUBJECTS",value:String(schedule.length)},{label:"ISSUED",value:new Date().toLocaleDateString("en-GB")}];
  const cw=(w-20)/info.length;
  info.forEach((item,i)=>{
    const x=10+i*cw+cw/2;
    doc.setTextColor(130,130,130);
    doc.setFontSize(6);
    doc.setFont("helvetica","normal");
    doc.text(item.label,x,39.5,{align:"center"});
    doc.setTextColor(40,40,40);
    doc.setFontSize(8.5);
    doc.setFont("helvetica","bold");
    doc.text(item.value,x,45.5,{align:"center"});
    if(i>0){ doc.setDrawColor(210,210,210); doc.setLineWidth(0.2); doc.line(10+i*cw,36,10+i*cw,47); }
  });

  // ── Table — stretched to match the info strip's width exactly ──
  const tableW = w-20;
  autoTable(doc,{
    startY:53,
    head:[["Day","Date","Subject","Paper Name","Time"]],
    body:schedule.map(e=>{
      const d=new Date(e.exam_date);
      return [
        format(d,"EEEE"),
        format(d,"dd MMM yyyy"),
        e.subject,
        e.paper_name||e.subject,
        e.start_time&&e.end_time?`${e.start_time}–${e.end_time}`:e.start_time||"—",
      ];
    }),
    tableWidth: tableW,
    headStyles:{
      fillColor:[245,245,245],
      textColor:[60,60,60],
      fontStyle:"bold",
      fontSize:8,
      halign:"center",
      cellPadding:{top:4,bottom:4,left:2,right:2},
    },
    bodyStyles:{
      fontSize:9,
      cellPadding:{top:4,bottom:4,left:3,right:3},
      valign:"middle",
      halign:"center",
      textColor:[40,40,40],
      fillColor:[255,255,255],
      overflow:"linebreak",
      minCellHeight:12,
    },
    columnStyles:{
      0:{cellWidth:tableW*0.16,fontSize:8},
      1:{cellWidth:tableW*0.18,fontStyle:"bold",fontSize:8},
      2:{cellWidth:tableW*0.22,fontSize:9,overflow:"linebreak"},
      3:{cellWidth:tableW*0.28,fontSize:9,overflow:"linebreak"},
      4:{cellWidth:tableW*0.16,fontSize:8},
    },
    alternateRowStyles:{fillColor:[250,250,250]},
    didParseCell:(data)=>{
      if(data.section==="body"){
        const entry=schedule[data.row.index];
        if(entry&&isToday(new Date(entry.exam_date))){
          data.cell.styles.fillColor=[235,235,235];
          data.cell.styles.fontStyle="bold";
          data.cell.styles.textColor=[20,20,20];
        }
      }
    },
    tableLineColor:[205,205,205],
    tableLineWidth:0.2,
    margin:{left:10,right:10,bottom:18},
  });

  // ── Footer ──
  const tp=(doc as any).internal.getNumberOfPages();
  for(let p=1;p<=tp;p++){
    doc.setPage(p);
    doc.setDrawColor(200,200,200);
    doc.setLineWidth(0.2);
    doc.line(0,h-12,w,h-12);
    doc.setTextColor(90,90,90);
    doc.setFontSize(6.5);
    doc.setFont("helvetica","bold");
    doc.text("GHS BABI KHEL — OFFICIAL EXAMINATION DATE SHEET",w/2,h-5,{align:"center"});
    doc.setTextColor(140,140,140);
    doc.setFontSize(6);
    doc.setFont("helvetica","normal");
    doc.text(`Page ${p}/${tp}`,w-12,h-5,{align:"right"});
    doc.text(`Class ${cls}  |  ${examTypeLabel(examType)}  |  ${year}`,12,h-5);
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
        {examTypes[cls].map(e=><button key={e} onClick={()=>setExamType(e)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${examType===e?"bg-accent/20 text-accent border border-accent/40":"bg-secondary text-muted-foreground"}`}>{examTypeLabel(e)}</button>)}
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









// ─── Honor Roll Card (extracted to avoid hook-in-loop) ──────────────────────
function HonorRollCard({ entry, monthLabel }: { entry: HonorEntry; monthLabel: string }) {
  const [imgError, setImgError] = useState(false);
  return (
    <div className="bg-card rounded-2xl border border-border p-4 text-center shadow-sm">
      {entry.photo_url && !imgError ? <img src={entry.photo_url} alt={entry.student_name || "Student"} className="w-14 h-14 rounded-full object-cover mx-auto mb-2 border-2 border-blue-400" onError={() => setImgError(true)} loading="lazy" decoding="async" />
        : <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-orange-500 flex items-center justify-center text-white font-black text-2xl mx-auto mb-2">{(entry.student_name || "?")[0]}</div>}
      <p className="text-sm font-bold text-foreground">{entry.student_name}</p>
      <p className="text-xs text-muted-foreground">Class {entry.class}</p>
      {entry.reason && <p className="text-[10px] text-muted-foreground mt-1.5 italic line-clamp-2">"{entry.reason}"</p>}
      <span className="inline-block mt-2 text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-semibold">🏅 {monthLabel} {entry.year}</span>
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
              <HonorRollCard key={e.id} entry={e} monthLabel={MONTHS[e.month-1]} />
            ))}</div>
          </div>
        ))}</div>}
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
  "exam-schedule":   ScheduleHub,
  "seating":         SeatingTab,
  "exam-seating":    SeatingTab,
  gallery:           MediaHighlightsTab,
  videos:            MediaHighlightsTab,
  achievements:      MediaHighlightsTab,
  "honor-roll":      MediaHighlightsTab,
  teachers:          TeachersTab,
  profile:           ProfileTab,
  "id-cards":        UserCredentialsHub,
  "credentials":     UserCredentialsHub,
  "monitor-pass":    UserCredentialsHub,
  "duty":            UserCredentialsHub,
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
