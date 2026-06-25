import { useState, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import NoticesNewsTab from "./tabs/NoticesNewsTab";
import ResultsHubTab from "./tabs/ResultsHubTab";
import MediaHighlightsTab from "./tabs/MediaHighlightsTab";
import ScheduleHubTab from "./tabs/ScheduleHubTab";
import DashboardLayout from "@/components/layout/DashboardLayout";
import OverviewTab from "./tabs/OverviewTab";
import TimetableTab from "./tabs/TimetableTab";
import ResultsTab from "./tabs/ResultsTab";
import NoticesTab from "./tabs/NoticesTab";
import NewsTab from "./tabs/NewsTab";
import NotificationsPanel from "@/components/shared/NotificationsPanel";
import LibraryTab from "./tabs/LibraryTab";
import GalleryTab from "./tabs/GalleryTab";
import VideosTab from "./tabs/VideosTab";
import AchievementsTab from "./tabs/AchievementsTab";
import TeachersTab from "./tabs/TeachersTab";
import ProfileTab from "./tabs/ProfileTab";
import RollNumbersTab from "./tabs/RollNumbersTab";
import ResultCardTab from "./tabs/ResultCardTab";
import NotesHub from "./tabs/NotesHub";
import OnlineClassesTab from "./tabs/OnlineClassesTab";
import UserCredentialsHub from "./tabs/UserCredentialsHub";
import ExtraTab from "./tabs/ExtraTab";
import LeaderboardTab from "./tabs/LeaderboardTab";
import FeeTab from "./tabs/FeeTab";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { generateExamICS } from "@/utils/generateExamICS";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine, Legend
} from "recharts";
import {
  CheckCircle, Clock,
  ChevronDown, ChevronUp, Calendar, Trophy, TrendingUp,
  BarChart3, Star, Download, School, ChevronRight, CalendarPlus,
  BookOpen, Eye, EyeOff, CheckCircle2,
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
              className="flex items-center gap-1.5 text-xs font-semibold bg-primary text-white hover:bg-primary/90 px-3 py-1.5 rounded-xl transition-colors"
            >
              <Download className="w-3.5 h-3.5"/>Download PDF
            </button>
          </div>
        )}
      </div>
      <div className="flex gap-2 flex-wrap">{["6","7","8","9","10"].map(c=><button key={c} onClick={()=>{setCls(c);setExamType(examTypes[c][0]);}} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${cls===c?"bg-primary text-white":"bg-secondary text-muted-foreground"}`}>Class {c}</button>)}</div>
      <div className="flex gap-2 flex-wrap items-center">
        {examTypes[cls].map(e=><button key={e} onClick={()=>setExamType(e)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${examType===e?"bg-primary/20 text-primary border border-primary/40":"bg-secondary text-muted-foreground"}`}>{e}</button>)}
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
      headStyles: { fillColor: ML_PDF_COLOR.head, textColor: ML_PDF_COLOR.white, fontStyle: "bold", fontSize: 8.5, halign: "center", cellPadding: 3.5 },
      bodyStyles: { fontSize: 8.5, cellPadding: 3, textColor: ML_PDF_COLOR.ink },
      alternateRowStyles: { fillColor: ML_PDF_COLOR.altRow },
      columnStyles: {
        0: { halign: "center", cellWidth: 14, fontStyle: "bold" },
        1: { halign: "center", cellWidth: 22 },
        2: { halign: "left",   cellWidth: 68, overflow: "linebreak" },
        3: { halign: "center", cellWidth: 28 },
        4: { halign: "center", cellWidth: 18, fontStyle: "bold" },
        5: { halign: "center", cellWidth: 15 },
        6: { halign: "center", cellWidth: 15 },
      },
      didParseCell: (data) => {
        if (data.section === "body") {
          if (data.row.index < 3) data.cell.styles.fontStyle = "bold";
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
      headStyles: { fillColor: ML_PDF_COLOR.head, textColor: ML_PDF_COLOR.white, fontStyle: "bold", fontSize: 8, halign: "center", cellPadding: 3 },
      bodyStyles: { fontSize: 8, cellPadding: 2.8, textColor: ML_PDF_COLOR.ink, overflow: "linebreak" },
      alternateRowStyles: { fillColor: ML_PDF_COLOR.altRow },
      columnStyles: {
        0: { halign: "center", cellWidth: 13, fontStyle: "bold" },
        1: { halign: "center", cellWidth: 16 },
        2: { halign: "center", cellWidth: 20 },
        3: { halign: "left",   cellWidth: 58, overflow: "linebreak" },
        4: { halign: "center", cellWidth: 26 },
        5: { halign: "center", cellWidth: 18, fontStyle: "bold" },
        6: { halign: "center", cellWidth: 14 },
        7: { halign: "center", cellWidth: 14 },
      },
      didParseCell: (data) => {
        if (data.section === "body") {
          if (data.row.index < 3) data.cell.styles.fontStyle = "bold";
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
function usePublishedMeritLists() {
  return useQuery<PublishedMeritList[]>({
    queryKey: ["published-merit-lists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merit_lists")
        .select("id, scope, class, exam_type, year, is_published, publish_at, title, notes, created_at")
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

// ─── Fetch the actual results data for a given merit list ───────────────────
function useMeritListData(ml: PublishedMeritList | null) {
  return useQuery<MeritStudentEntry[]>({
    queryKey: ["merit-list-data", ml?.id],
    queryFn: async () => {
      if (!ml) return [];
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
      // Deduplicate: keep best result per student per class
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

function MeritListTab() {
  const now = useNowTick(1000);
  const { data: publishedLists = [], isLoading: listsLoading } = usePublishedMeritLists();

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
    if (!selectedId && (liveLists.length > 0 || scheduledLists.length > 0)) {
      setSelectedId((liveLists[0] || scheduledLists[0]).id);
    }
    // If the selected list disappears (admin deleted it), reset
    if (selectedId && !publishedLists.find(l => l.id === selectedId)) {
      setSelectedId(liveLists[0]?.id || scheduledLists[0]?.id || null);
    }
  }, [liveLists, scheduledLists, selectedId, publishedLists]);

  const selectedList = publishedLists.find(l => l.id === selectedId) || null;
  const isSelectedLive = selectedList && (!selectedList.publish_at || !isAfter(new Date(selectedList.publish_at), now));

  const { data: entries = [], isLoading: entriesLoading } = useMeritListData(
    isSelectedLive ? selectedList : null
  );

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
      {/* Header */}
      <div>
        <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" /> Merit List
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Official school examination rankings — published by admin
        </p>
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
                    <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
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
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      ml.scope === "school" ? "bg-primary/10 text-primary" : "bg-blue-100 text-blue-700"
                    }`}>
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
                  <div className="shrink-0">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> Live
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected merit list — table + download */}
      {selectedList && (
        <>
          {/* Download button */}
          {isSelectedLive && entries.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={() => buildMeritPDF(
                  entries,
                  selectedList.exam_type || "",
                  selectedList.year,
                  selectedList.scope === "class" ? selectedList.class : undefined,
                  selectedList.title
                )}
                className="flex items-center gap-1.5 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 px-4 py-2 rounded-xl transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download PDF
              </button>
            </div>
          )}

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
                  const Unit = ({ value, label }: { value: number; label: string }) => (
                    <div className="bg-card border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 min-w-[64px]">
                      <p className="text-2xl font-black text-amber-600 tabular-nums">{String(value).padStart(2, "0")}</p>
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold">{label}</p>
                    </div>
                  );
                  return (
                    <>
                      {days > 0 && <Unit value={days} label="Days" />}
                      <Unit value={hours} label="Hours" />
                      <Unit value={mins} label="Min" />
                      <Unit value={secs} label="Sec" />
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
                <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
                  <div className="bg-foreground text-background px-4 py-3 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-sm">
                        {selectedList.title || (selectedList.scope === "school"
                          ? `Whole School — ${selectedList.year}`
                          : `Class ${selectedList.class} — ${selectedList.exam_type} ${selectedList.year}`)}
                      </h3>
                      <p className="text-xs text-background/70">{entries.length} students ranked</p>
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
                        {entries.map((e, i) => (
                          <tr key={`${e.student_id}-${i}`} className={`border-b border-border/50 ${
                            i === 0 ? "bg-yellow-50/80 dark:bg-yellow-900/20" :
                            i === 1 ? "bg-gray-50 dark:bg-gray-900/20" :
                            i === 2 ? "bg-orange-50/80 dark:bg-orange-900/20" :
                            "hover:bg-muted/30"
                          }`}>
                            <td className="p-3 text-center">
                              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                                i === 0 ? "bg-yellow-400 text-yellow-900" :
                                i === 1 ? "bg-gray-300 text-gray-800" :
                                i === 2 ? "bg-orange-300 text-orange-900" :
                                "bg-muted text-muted-foreground"
                              }`}>{i < 3 ? ["🥇","🥈","🥉"][i] : i + 1}</span>
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
                                  : <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">{e.full_name[0]}</div>
                                }
                                <span className={`text-sm ${i < 3 ? "font-bold text-foreground" : "text-foreground"}`}>{e.full_name}</span>
                              </div>
                            </td>
                            <td className="p-3 text-center text-xs text-muted-foreground">{e.obtained_marks}/{e.total_marks}</td>
                            <td className="p-3 text-center font-bold text-sm">{Number(e.percentage).toFixed(1)}%</td>
                            <td className="p-3 text-center">
                              <span className="text-[10px] font-bold bg-muted text-foreground px-2 py-0.5 rounded-full">{e.grade}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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

const UserDashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";
  const setActiveTab = useCallback((tab: string) => {
    setSearchParams({ tab }, { replace: true });
  }, [setSearchParams]);
  const TabComponent = tabComponents[activeTab] || OverviewTab;

  return (
    <DashboardLayout activeTab={activeTab} onTabChange={setActiveTab}>
      <TabComponent onNavigate={setActiveTab} />
    </DashboardLayout>
  );
};

export default UserDashboard;
