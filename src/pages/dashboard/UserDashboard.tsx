import { useState, useMemo } from "react";
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
import SchoolAnalyticsTab from "./tabs/SchoolAnalyticsTab";
import FinanceTab from "./tabs/FinanceTab";
import { UserStudentIDCards } from "../admin/tabs/AdminStudentIDCards";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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
  BarChart3, Star, Download, School, ChevronRight
} from "lucide-react";
import { format, isPast, isToday, differenceInDays } from "date-fns";
import { useResults, useResultYears } from "@/hooks/useResults";

// ─── Types ────────────────────────────────────────────────────────────────────
interface DailyQuote { id: string; text: string; author: string | null; category: string; fixed_date: string | null; }
interface ExamEntry { id: string; class: string; exam_type: string; year: number; subject: string; exam_date: string; start_time: string | null; end_time: string | null; hall: string | null; paper_code: string | null; notes: string | null; }
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
  doc.setFillColor(4,44,83); doc.rect(0,0,w,48,"F");
  doc.setFillColor(212,175,55); doc.rect(0,48,w,3,"F");
  doc.setFillColor(212,175,55); doc.circle(w/2,18,10,"F");
  doc.setFillColor(4,44,83); doc.circle(w/2,18,7.5,"F");
  doc.setTextColor(212,175,55); doc.setFontSize(8); doc.setFont("helvetica","bold"); doc.text("GHS",w/2,20,{align:"center"});
  doc.setTextColor(255,255,255); doc.setFontSize(14); doc.setFont("helvetica","bold"); doc.text("Government High School Babi Khel",w/2,33,{align:"center"});
  doc.setFontSize(8.5); doc.setFont("helvetica","normal"); doc.setTextColor(180,200,220); doc.text("District Mohmand, KPK  |  Est. 2018",w/2,39,{align:"center"});
  doc.setFontSize(12); doc.setFont("helvetica","bold"); doc.setTextColor(212,175,55); doc.text("EXAMINATION DATE SHEET",w/2,46,{align:"center"});
  doc.setFillColor(240,247,255); doc.roundedRect(10,55,w-20,16,2,2,"F");
  doc.setDrawColor(4,44,83); doc.setLineWidth(0.3); doc.roundedRect(10,55,w-20,16,2,2,"S");
  const info=[{label:"CLASS",value:cls},{label:"EXAM",value:examType},{label:"YEAR",value:String(year)},{label:"SUBJECTS",value:String(schedule.length)},{label:"ISSUED",value:new Date().toLocaleDateString("en-GB")}];
  const cw=(w-20)/info.length;
  info.forEach((item,i)=>{ const x=10+i*cw+cw/2; doc.setTextColor(100,120,140); doc.setFontSize(6.5); doc.setFont("helvetica","normal"); doc.text(item.label,x,61,{align:"center"}); doc.setTextColor(4,44,83); doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.text(item.value,x,68,{align:"center"}); });
  autoTable(doc,{
    startY:76,
    head:[["Day","Date","Subject","Paper Name","Code","Time","Hall"]],
    body:schedule.map(e=>{ const d=new Date(e.exam_date); return [format(d,"EEEE"),format(d,"dd MMM yyyy"),e.subject,(e as any).paper_name||e.subject,(e as any).paper_code||"—",e.start_time&&e.end_time?`${e.start_time}–${e.end_time}`:e.start_time||"—",e.hall||"—"]; }),
    headStyles:{fillColor:[4,44,83],textColor:[255,255,255],fontStyle:"bold",fontSize:8,halign:"center",cellPadding:4},
    bodyStyles:{fontSize:8,cellPadding:3.5,valign:"middle"},
    columnStyles:{0:{cellWidth:22,halign:"center"},1:{cellWidth:28,halign:"center",fontStyle:"bold"},2:{cellWidth:24},3:{cellWidth:42},4:{cellWidth:18,halign:"center",fontStyle:"bold"},5:{cellWidth:28,halign:"center"},6:{cellWidth:18,halign:"center"}},
    alternateRowStyles:{fillColor:[248,252,255]},
    didParseCell:(data)=>{ if(data.section==="body"&&data.column.index===2){const st=SCHED_SUBJECT_COLORS[data.cell.raw as string];if(st){data.cell.styles.fillColor=st.pdfRgb;data.cell.styles.fontStyle="bold";}} if(data.section==="body"){const entry=schedule[data.row.index];if(entry&&isToday(new Date(entry.exam_date))){data.cell.styles.fillColor=[255,251,204];data.cell.styles.fontStyle="bold";}} },
    margin:{left:10,right:10,bottom:22},
  });
  const tp=(doc as any).internal.getNumberOfPages();
  for(let p=1;p<=tp;p++){ doc.setPage(p); doc.setFillColor(212,175,55); doc.rect(0,h-14,w,1,"F"); doc.setFillColor(4,44,83); doc.rect(0,h-13,w,13,"F"); doc.setTextColor(212,175,55); doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.text("GHS BABI KHEL — OFFICIAL EXAMINATION DATE SHEET",w/2,h-7,{align:"center"}); doc.setTextColor(160,180,200); doc.setFontSize(6.5); doc.text(`Page ${p}/${tp}`,w-14,h-7,{align:"right"}); doc.text(`Class ${cls}  |  ${examType}  |  ${year}`,14,h-7); }
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
        {schedule.length>0&&<button onClick={()=>generateDateSheetPDF(schedule,cls,examType,year)} className="flex items-center gap-1.5 text-xs font-semibold bg-primary text-white hover:bg-primary/90 px-4 py-2 rounded-xl transition-colors"><Download className="w-3.5 h-3.5"/>Download PDF</button>}
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
          <div className="space-y-2">{schedule.map(entry=>{ const date=new Date(entry.exam_date); const past=isPast(date)&&!isToday(date); const today=isToday(date); const diff=differenceInDays(date,new Date()); const style=schedSubjectStyle(entry.subject); return (<div key={entry.id} className={`bg-card rounded-xl border shadow-sm overflow-hidden ${today?"border-blue-400 ring-2 ring-blue-400/30":past?"opacity-55 border-border":"border-border hover:border-primary/40"}`}>{today&&<div className="bg-blue-400 text-blue-950 text-center text-[11px] font-black uppercase tracking-widest py-1">📢 EXAM TODAY</div>}<div className="p-4 flex items-center gap-4"><div className={`w-16 h-16 rounded-xl flex flex-col items-center justify-center shrink-0 font-black ${today?"bg-blue-500 text-white":past?"bg-muted text-muted-foreground":"bg-primary text-white"}`}><span className="text-2xl leading-none">{format(date,"dd")}</span><span className="text-[10px] font-semibold uppercase">{format(date,"MMM")}</span><span className="text-[9px] opacity-70">{format(date,"yyyy")}</span></div><div className="flex-1 min-w-0"><div className="flex items-center gap-2 flex-wrap mb-1"><span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${style.bg} ${style.text}`}>{entry.subject}</span>{(entry as any).paper_code&&<span className="text-[11px] font-mono font-bold bg-primary/10 text-primary dark:text-white px-2 py-0.5 rounded">{(entry as any).paper_code}</span>}{!past&&!today&&diff<=3&&diff>=0&&<span className="text-[10px] font-bold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full animate-pulse">{diff===0?"Tomorrow!":`${diff}d left`}</span>}{past&&<span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Done</span>}</div><p className="text-sm font-bold text-foreground">{(entry as any).paper_name||entry.subject}</p><div className="flex flex-wrap items-center gap-3 mt-1"><span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3"/>{format(date,"EEEE, dd MMMM yyyy")}</span>{entry.start_time&&<span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3"/>{entry.start_time}{entry.end_time?` – ${entry.end_time}`:""}</span>}{entry.hall&&<span className="text-xs text-muted-foreground flex items-center gap-1"><ChevronRight className="w-3 h-3"/>Hall: {entry.hall}</span>}{entry.notes&&<span className="text-xs italic text-muted-foreground">{entry.notes}</span>}</div></div>{!past&&!today&&diff>0&&<div className={`hidden sm:flex flex-col items-center justify-center w-14 h-14 rounded-xl shrink-0 ${diff<=7?"bg-orange-100":"bg-secondary"}`}><span className={`text-lg font-black ${diff<=7?"text-orange-600":"text-foreground"}`}>{diff}</span><span className="text-[9px] font-medium text-muted-foreground">days</span></div>}</div></div>); })}</div>
        </>)}
    </div>
  );
}


// ─── Analytics Tab — School-wide class performance ───────────────────────────
const ALL_CLASSES_ANALYTICS = ["6","7","8","9","10"];
const CLASS_COLORS_A: Record<string,string> = { "6":"#6366f1","7":"#10b981","8":"#1e3a8a","9":"#ef4444","10":"#8b5cf6" };

function useSchoolAnalyticsData(yr: number) {
  return useQuery({
    queryKey: ["school-analytics-user", yr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("class, exam_type, percentage, is_pass, obtained_marks, total_marks, subject_marks, grade")
        .eq("year", yr)
        .eq("is_published", true)
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

function AnalyticsTab() {
  const currentYr = new Date().getFullYear();
  const [year, setYear] = useState(currentYr);
  const [activeSubjectClass, setActiveSubjectClass] = useState<string>("all");
  const { data: rawResults = [], isLoading } = useSchoolAnalyticsData(year);

  const classStats = useMemo(() => {
    return ALL_CLASSES_ANALYTICS.map(cls => {
      const r = rawResults.filter((x: any) => x.class === cls);
      if (!r.length) return null;
      const avg = r.reduce((s: number, x: any) => s + (x.percentage ?? 0), 0) / r.length;
      const passed = r.filter((x: any) => x.is_pass).length;
      const pcts = r.map((x: any) => x.percentage ?? 0);
      return {
        class: `Class ${cls}`, classNum: cls, students: r.length,
        avg: Math.round(avg * 10) / 10,
        passRate: Math.round((passed / r.length) * 100),
        highest: Math.max(...pcts), lowest: Math.min(...pcts),
        passed, failed: r.length - passed,
      };
    }).filter(Boolean) as { class:string;classNum:string;students:number;avg:number;passRate:number;highest:number;lowest:number;passed:number;failed:number }[];
  }, [rawResults]);

  const examComparison = useMemo(() => {
    const byExam: Record<string, Record<string, number[]>> = {};
    rawResults.forEach((r: any) => {
      if (!byExam[r.exam_type]) byExam[r.exam_type] = {};
      if (!byExam[r.exam_type][r.class]) byExam[r.exam_type][r.class] = [];
      byExam[r.exam_type][r.class].push(r.percentage ?? 0);
    });
    return Object.entries(byExam).map(([et, byClass]) => {
      const entry: Record<string,any> = { exam: et.replace(" Semester"," Sem").replace("Annual-","Ann-") };
      Object.entries(byClass).forEach(([cls, pcts]) => {
        entry[`Class ${cls}`] = Math.round(pcts.reduce((a: number,b: number)=>a+b,0)/pcts.length*10)/10;
      });
      return entry;
    });
  }, [rawResults]);

  const subjectData = useMemo(() => {
    const filtered = activeSubjectClass === "all" ? rawResults : rawResults.filter((r: any) => r.class === activeSubjectClass);
    const totals: Record<string,{total:number;count:number}> = {};
    filtered.forEach((r: any) => {
      if (!r.subject_marks) return;
      Object.entries(r.subject_marks as Record<string,{obtained:number;total:number}>).forEach(([sub,m]) => {
        if (m.total === 0 && m.obtained === 0) return;
        if (!totals[sub]) totals[sub] = {total:0,count:0};
        totals[sub].total += m.total > 0 ? (m.obtained/m.total)*100 : 0;
        totals[sub].count += 1;
      });
    });
    return Object.entries(totals)
      .map(([subject,{total,count}]) => ({ subject: subject.length>11?subject.slice(0,10)+"...":subject, avgPct: Math.round(total/count*10)/10 }))
      .sort((a,b)=>b.avgPct-a.avgPct).slice(0,10);
  }, [rawResults, activeSubjectClass]);

  const overall = useMemo(() => {
    if (!rawResults.length) return null;
    const avg = rawResults.reduce((s: number, r: any)=>s+(r.percentage??0),0)/rawResults.length;
    const passed = rawResults.filter((r: any)=>r.is_pass).length;
    return { total: rawResults.length, avg: Math.round(avg*10)/10, passRate: Math.round((passed/rawResults.length)*100) };
  }, [rawResults]);

  const CustomTip = ({ active, payload, label }: any) => {
    if (!active||!payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-xl p-2.5 shadow-lg text-xs">
        <p className="font-bold text-foreground mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{color:p.color||p.fill}}>{p.name}: <strong>{typeof p.value==="number"?p.value.toFixed(1):p.value}%</strong></p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" /> Analytics
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Live school-wide class performance</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Year:</label>
          <input
            type="number"
            value={year}
            onChange={e => { const v = parseInt(e.target.value, 10); if (v >= 2000 && v <= 2099) setYear(v); }}
            min={2000} max={2099}
            className="text-sm bg-secondary border border-border rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-primary w-24 font-mono"
            placeholder="Year"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-3">{[...Array(3)].map((_,i)=><Skeleton key={i} className="h-16 rounded-2xl"/>)}</div>
      ) : overall ? (
        <div className="grid grid-cols-3 gap-3">
          {[
            {label:"Total Results",value:overall.total,color:"#6366f1"},
            {label:"School Avg",value:`${overall.avg}%`,color:"#10b981"},
            {label:"Pass Rate",value:`${overall.passRate}%`,color:"#1e3a8a"},
          ].map(s=>(
            <div key={s.label} className="bg-card border border-border rounded-2xl p-3 text-center shadow-sm">
              <p className="text-xl font-black" style={{color:s.color}}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <BarChart3 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2"/>
          <p className="text-sm font-semibold text-foreground">No published results for {year}</p>
          <p className="text-xs text-muted-foreground mt-1">Admin must publish results first</p>
        </div>
      )}

      {overall && classStats.length > 0 && (
        <>
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary"/> Average Score by Class
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={classStats} margin={{top:5,right:5,left:-15,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                <XAxis dataKey="class" tick={{fontSize:11}}/>
                <YAxis tick={{fontSize:10}} domain={[0,100]} tickFormatter={(v: number)=>`${v}%`}/>
                <Tooltip content={<CustomTip/>}/>
                <Bar dataKey="avg" name="Avg %" radius={[6,6,0,0]}>
                  {classStats.map((e,i)=><Cell key={i} fill={CLASS_COLORS_A[e.classNum]||"#6366f1"}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500"/> Pass Rate by Class (%)
            </h3>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={classStats} margin={{top:5,right:5,left:-15,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                <XAxis dataKey="class" tick={{fontSize:11}}/>
                <YAxis tick={{fontSize:10}} domain={[0,100]} tickFormatter={(v: number)=>`${v}%`}/>
                <Tooltip content={<CustomTip/>}/>
                <Bar dataKey="passRate" name="Pass Rate" radius={[6,6,0,0]}>
                  {classStats.map((e,i)=><Cell key={i} fill={e.passRate>=80?"#10b981":e.passRate>=60?"#1e3a8a":"#ef4444"}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-violet-500"/> Score Range — Highest / Avg / Lowest
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={classStats} margin={{top:5,right:5,left:-15,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                <XAxis dataKey="class" tick={{fontSize:11}}/>
                <YAxis tick={{fontSize:10}} domain={[0,100]} tickFormatter={(v: number)=>`${v}%`}/>
                <Tooltip content={<CustomTip/>}/>
                <Legend wrapperStyle={{fontSize:11}}/>
                <Bar dataKey="highest" name="Highest %" fill="#10b981" radius={[4,4,0,0]}/>
                <Bar dataKey="avg" name="Average %" fill="#6366f1" radius={[4,4,0,0]}/>
                <Bar dataKey="lowest" name="Lowest %" fill="#ef4444" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary"/> Students Passed vs Failed
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={classStats} margin={{top:5,right:5,left:-15,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                <XAxis dataKey="class" tick={{fontSize:11}}/>
                <YAxis tick={{fontSize:10}} allowDecimals={false}/>
                <Tooltip content={<CustomTip/>}/>
                <Legend wrapperStyle={{fontSize:11}}/>
                <Bar dataKey="passed" name="Passed" fill="#10b981" stackId="a"/>
                <Bar dataKey="failed" name="Failed" fill="#ef4444" stackId="a" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {examComparison.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
              <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary"/> Exam-wise Average
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={examComparison} margin={{top:5,right:5,left:-15,bottom:20}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                  <XAxis dataKey="exam" tick={{fontSize:10}} angle={-10} textAnchor="end"/>
                  <YAxis tick={{fontSize:10}} domain={[0,100]} tickFormatter={(v: number)=>`${v}%`}/>
                  <Tooltip content={<CustomTip/>}/>
                  <Legend wrapperStyle={{fontSize:11}}/>
                  {ALL_CLASSES_ANALYTICS.filter(cls=>classStats.some(c=>c.classNum===cls)).map(cls=>(
                    <Bar key={cls} dataKey={`Class ${cls}`} fill={CLASS_COLORS_A[cls]} radius={[4,4,0,0]}/>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {subjectData.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-500"/> Subject Average Score
                </h3>
                <div className="flex gap-1 flex-wrap">
                  <button onClick={()=>setActiveSubjectClass("all")}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${activeSubjectClass==="all"?"bg-primary text-primary-foreground":"bg-secondary text-muted-foreground"}`}>
                    All
                  </button>
                  {ALL_CLASSES_ANALYTICS.filter(cls=>classStats.some(c=>c.classNum===cls)).map(cls=>(
                    <button key={cls} onClick={()=>setActiveSubjectClass(cls)}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors"
                      style={activeSubjectClass===cls?{backgroundColor:CLASS_COLORS_A[cls],color:"#fff"}:{backgroundColor:"hsl(var(--secondary))",color:"hsl(var(--muted-foreground))"}}>
                      {cls}
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={subjectData} layout="vertical" margin={{top:5,right:20,left:65,bottom:5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                  <XAxis type="number" tick={{fontSize:10}} domain={[0,100]} tickFormatter={(v: number)=>`${v}%`}/>
                  <YAxis dataKey="subject" type="category" tick={{fontSize:10}} width={65}/>
                  <Tooltip content={<CustomTip/>}/>
                  <Bar dataKey="avgPct" name="Avg %" radius={[0,6,6,0]}>
                    {subjectData.map((_,i)=>(
                      <Cell key={i} fill={["#6366f1","#10b981","#1e3a8a","#ef4444","#8b5cf6","#14b8a6","#f97316","#06b6d4","#84cc16","#ec4899"][i%10]}/>
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-primary text-white px-4 py-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-400"/>
              <span className="font-bold text-sm">Class Summary — {year}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border text-xs">
                    <th className="p-3 text-left font-semibold">Class</th>
                    <th className="p-3 text-center font-semibold">Students</th>
                    <th className="p-3 text-center font-semibold">Avg %</th>
                    <th className="p-3 text-center font-semibold">Pass Rate</th>
                    <th className="p-3 text-center font-semibold">Top</th>
                  </tr>
                </thead>
                <tbody>
                  {classStats.map((c,i)=>(
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor:CLASS_COLORS_A[c.classNum]}}/>
                          <span className="font-semibold text-foreground">{c.class}</span>
                        </div>
                      </td>
                      <td className="p-3 text-center font-medium text-foreground">{c.students}</td>
                      <td className="p-3 text-center">
                        <span className={`font-bold text-sm ${c.avg>=70?"text-green-600":c.avg>=50?"text-blue-700":"text-red-500"}`}>{c.avg}%</span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.passRate>=80?"bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400":c.passRate>=60?"bg-blue-100 text-blue-800":"bg-red-100 text-red-700"}`}>{c.passRate}%</span>
                      </td>
                      <td className="p-3 text-center text-green-600 font-semibold text-xs">{c.highest.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
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
interface MeritStudentEntry { student_id:string; full_name:string; roll_number:string; class:string; exam_type?:string; photo_url:string|null; obtained_marks:number; total_marks:number; percentage:number; grade:string; position:number; }
const ALL_EXAM_TYPES_ML = ["1st Semester","2nd Semester","Annual-I","Annual-II"];
const ALL_CLASSES_ML = ["6","7","8","9","10"];

function buildMeritPDF(all: MeritStudentEntry[], examType: string, year: number, singleClass?: string) {
  // ── helpers ──────────────────────────────────────────────────────────────────
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();  // 210
  const h = doc.internal.pageSize.getHeight(); // 297
  const ML = 12; // margin left
  const MR = 12; // margin right

  function drawHeader(title: string, subtitle: string) {
    // Top rule
    doc.setDrawColor(20, 20, 20);
    doc.setLineWidth(0.8);
    doc.line(ML, 8, w - MR, 8);
    // School name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(10, 10, 10);
    doc.text("GOVERNMENT HIGH SCHOOL BABI KHEL", w / 2, 15, { align: "center" });
    // Sub-info
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(70, 70, 70);
    doc.text("District Mohmand, Khyber Pakhtunkhwa", w / 2, 20, { align: "center" });
    // Divider
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.25);
    doc.line(ML, 24, w - MR, 24);
    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(10, 10, 10);
    doc.text(title, w / 2, 31, { align: "center" });
    // Subtitle
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(70, 70, 70);
    doc.text(subtitle, w / 2, 37, { align: "center" });
    // Bottom rule
    doc.setDrawColor(20, 20, 20);
    doc.setLineWidth(0.8);
    doc.line(ML, 41, w - MR, 41);
  }

  function drawStats(ent: MeritStudentEntry[], startY: number) {
    const passing = ent.filter(e => e.percentage >= 33);
    const highest = Math.max(...ent.map(e => e.percentage));
    const avg = Math.round(ent.reduce((s, e) => s + e.percentage, 0) / ent.length);
    const passRate = Math.round((passing.length / ent.length) * 100);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(40, 40, 40);
    doc.text(
      `Total: ${ent.length}   |   Passed: ${passing.length}   |   Failed: ${ent.length - passing.length}   |   Highest: ${highest.toFixed(1)}%   |   Average: ${avg}%   |   Pass Rate: ${passRate}%`,
      w / 2, startY, { align: "center" }
    );
  }

  function drawFooter(pageNum: number, totalPages: number) {
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.25);
    doc.line(ML, h - 12, w - MR, h - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(80, 80, 80);
    doc.text("GHS Babi Khel — Official Merit List", ML, h - 7);
    doc.text(`Generated: ${new Date().toLocaleDateString("en-GB")}`, w / 2, h - 7, { align: "center" });
    doc.text(`Page ${pageNum} / ${totalPages}`, w - MR, h - 7, { align: "right" });
  }

  // ── build pages ───────────────────────────────────────────────────────────────
  if (singleClass) {
    // Single class: one PDF page for that class only
    const ent = all.filter(e => e.class === singleClass);
    if (!ent.length) { return; }
    const clsExamType = (ent[0] as any).exam_type || examType;
    drawHeader(
      `MERIT LIST — CLASS ${singleClass}`,
      `${clsExamType}  |  Year ${year}  |  ${ent.length} Students`
    );
    drawStats(ent, 47);
    autoTable(doc, {
      startY: 52,
      head: [["Rank", "Roll No", "Student Name", "Marks Obtained", "%", "Grade"]],
      body: ent.map((e, i) => [
        i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`,
        e.roll_number,
        e.full_name,
        `${e.obtained_marks} / ${e.total_marks}`,
        `${Number(e.percentage).toFixed(1)}%`,
        e.grade,
      ]),
      headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5, halign: "center", cellPadding: 3.5 },
      bodyStyles: { fontSize: 8.5, cellPadding: 3, textColor: [20, 20, 20], fontStyle: "normal", overflow: "linebreak" },
      alternateRowStyles: { fillColor: [246, 247, 250] },
      columnStyles: {
        0: { halign: "center", cellWidth: 16, fontStyle: "bold" },
        1: { halign: "center", cellWidth: 22 },
        2: { halign: "center",   cellWidth: 72, overflow: "linebreak" },
        3: { halign: "center", cellWidth: 30 },
        4: { halign: "center", cellWidth: 22, fontStyle: "bold" },
        5: { halign: "center", cellWidth: 16 },
      },
      didParseCell: (data) => { if (data.section === "body" && data.row.index < 3) data.cell.styles.fontStyle = "bold"; },
      margin: { left: ML, right: MR, bottom: 18 },
      didDrawPage: (data) => { const total = (doc as any).internal.getNumberOfPages(); drawFooter(data.pageNumber, total); },
    });
  } else {
    // WHOLE SCHOOL: merge ALL students, sort by percentage, ONE combined ranked list
    const allSorted = [...all].sort((a, b) => b.percentage - a.percentage);
    drawHeader(
      "WHOLE SCHOOL MERIT LIST",
      `Year ${year}  |  All Classes Combined  |  ${allSorted.length} Students`
    );
    drawStats(allSorted, 47);
    autoTable(doc, {
      startY: 52,
      head: [["Rank", "Class", "Roll No", "Student Name", "Marks Obtained", "%", "Grade"]],
      body: allSorted.map((e, i) => [
        i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`,
        `Cls ${e.class}`,
        e.roll_number,
        e.full_name,
        `${e.obtained_marks} / ${e.total_marks}`,
        `${Number(e.percentage).toFixed(1)}%`,
        e.grade,
      ]),
      headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8, halign: "center", cellPadding: 3 },
      bodyStyles: { fontSize: 8, cellPadding: 2.8, textColor: [20, 20, 20], overflow: "linebreak" },
      alternateRowStyles: { fillColor: [246, 247, 250] },
      columnStyles: {
        0: { halign: "center", cellWidth: 16, fontStyle: "bold" },
        1: { halign: "center", cellWidth: 16 },
        2: { halign: "center", cellWidth: 20 },
        3: { halign: "center",   cellWidth: 60, overflow: "linebreak" },
        4: { halign: "center", cellWidth: 28 },
        5: { halign: "center", cellWidth: 20, fontStyle: "bold" },
        6: { halign: "center", cellWidth: 14 },
      },
      didParseCell: (data) => { if (data.section === "body" && data.row.index < 3) data.cell.styles.fontStyle = "bold"; },
      margin: { left: ML, right: MR, bottom: 18 },
      didDrawPage: (data) => { const total = (doc as any).internal.getNumberOfPages(); drawFooter(data.pageNumber, total); },
    });
  }

  // Final pass — redraw footers with correct total page count
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

function MeritListTab() {
  const [viewMode, setViewMode] = useState<"class"|"school">("school");
  const [cls, setCls] = useState("6");
  const [examType, setExamType] = useState("1st Semester");
  const [yearInput, setYearInput] = useState(String(new Date().getFullYear()));
  const year = parseInt(yearInput, 10);
  const validYear = !isNaN(year) && year >= 2000 && year <= 2099;

  // Class merit — always fetched when validYear (not gated by viewMode)
  const { data: classEntries = [], isLoading: clsLoading } = useQuery<MeritStudentEntry[]>({
    queryKey: ["ml-class", cls, examType, validYear ? year : 0],
    queryFn: async () => {
      if (!validYear) return [];
      const { data, error } = await supabase
        .from("results")
        .select("student_id,obtained_marks,total_marks,percentage,grade,position,class,students(full_name,roll_number,photo_url)")
        .eq("class", cls)
        .eq("exam_type", examType)
        .eq("year", year)
        .eq("is_published", true)
        .order("percentage", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any, i: number) => ({
        student_id: r.student_id,
        full_name: r.students?.full_name || "Unknown",
        roll_number: r.students?.roll_number || "-",
        class: r.class,
        photo_url: r.students?.photo_url || null,
        obtained_marks: r.obtained_marks,
        total_marks: r.total_marks,
        percentage: r.percentage,
        grade: r.grade || "—",
        position: r.position || i + 1,
      }));
    },
    enabled: validYear,
  });

  // School merit — fetches ALL classes for the year (NO exam_type filter)
  // Each class has its own exam type: classes 6-8 use Semester, 9-10 use Annual
  // So we must NOT filter by exam_type here — we fetch all published results for the year
  const { data: schoolEntries = [], isLoading: schoolLoading } = useQuery<MeritStudentEntry[]>({
    queryKey: ["ml-school-all", validYear ? year : 0],
    queryFn: async () => {
      if (!validYear) return [];
      const { data, error } = await supabase
        .from("results")
        .select("student_id,obtained_marks,total_marks,percentage,grade,position,class,exam_type,students(full_name,roll_number,photo_url)")
        .eq("year", year)
        .eq("is_published", true)
        .order("percentage", { ascending: false })
        .limit(1000);
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
          percentage: r.percentage,
          grade: r.grade || "—",
          position: i + 1,
        }));
    },
    enabled: validYear,
  });

  const displayEntries = viewMode === "class" ? classEntries : schoolEntries;
  const isLoading = viewMode === "class" ? clsLoading : schoolLoading;

  const GBadge = ({ g }: { g: string }) => {
    const c = g === "A+" ? "bg-primary text-white" : g === "A" ? "bg-primary text-primary-foreground" : g === "B" ? "bg-green-500 text-white" : g === "C" ? "bg-blue-500 text-white" : "bg-red-500 text-white";
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c}`}>{g}</span>;
  };

  const tableTitle = viewMode === "class"
    ? `Class ${cls} — ${examType} ${year}`
    : `Whole School — ${year} (All Classes)`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <Trophy className="w-5 h-5 text-blue-500" /> Merit List
          </h2>
          <p className="text-xs text-muted-foreground">School examination rankings</p>
        </div>
        {displayEntries.length > 0 && (
          <button
            onClick={() => buildMeritPDF(displayEntries, examType, year, viewMode === "class" ? cls : undefined)}
            className="flex items-center gap-1.5 text-xs font-semibold bg-primary text-white hover:bg-primary/90 px-4 py-2 rounded-xl transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {viewMode === "class" ? "Download Class PDF" : "Download School PDF"}
          </button>
        )}
      </div>

      {/* View mode toggle */}
      <div className="flex gap-2">
        <button onClick={() => setViewMode("class")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${viewMode === "class" ? "bg-primary text-white" : "bg-secondary text-muted-foreground"}`}>
          <Trophy className="w-4 h-4" /> Class Merit
        </button>
        <button onClick={() => setViewMode("school")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${viewMode === "school" ? "bg-primary text-white" : "bg-secondary text-muted-foreground"}`}>
          <School className="w-4 h-4" /> Whole School
        </button>
      </div>

      {/* Class selector — only in class mode */}
      {viewMode === "class" && (
        <div className="flex gap-2 flex-wrap">
          {ALL_CLASSES_ML.map(c => (
            <button key={c} onClick={() => setCls(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${cls === c ? "bg-primary text-white" : "bg-secondary text-muted-foreground"}`}>
              Class {c}
            </button>
          ))}
        </div>
      )}

      {/* Exam type + year filters */}
      <div className="flex gap-2 flex-wrap items-center">
        {ALL_EXAM_TYPES_ML.map(e => (
          <button key={e} onClick={() => setExamType(e)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${examType === e ? "bg-primary/20 text-primary border border-primary/40" : "bg-secondary text-muted-foreground"}`}>
            {e}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Year:</label>
          <input type="number" value={yearInput} onChange={e => setYearInput(e.target.value)}
            className="w-20 text-xs bg-secondary border border-border rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary"
            min={2000} max={2099} />
        </div>
      </div>

      {/* Stats bar */}
      {!isLoading && displayEntries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: displayEntries.length, bg: "bg-blue-50 dark:bg-blue-900/20 text-blue-700" },
            { label: "Passed", value: displayEntries.filter(e => e.percentage >= 33).length, bg: "bg-green-50 dark:bg-green-900/20 text-green-700" },
            { label: "Top Score", value: `${Math.max(...displayEntries.map(e => e.percentage))}%`, bg: "bg-blue-50 dark:bg-blue-950/20 text-blue-800" },
            { label: "Average", value: `${Math.round(displayEntries.reduce((s, e) => s + e.percentage, 0) / displayEntries.length)}%`, bg: "bg-purple-50 dark:bg-purple-900/20 text-purple-700" },
          ].map(s => (
            <div key={s.label} className={`rounded-xl p-3 text-center ${s.bg}`}>
              <p className="text-xl font-black">{s.value}</p>
              <p className="text-xs font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {!validYear ? (
        <div className="bg-card rounded-2xl p-8 text-center border border-border">
          <p className="text-sm text-muted-foreground">Enter a valid year to view merit list.</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : displayEntries.length === 0 ? (
        <div className="bg-card rounded-2xl p-12 text-center border border-border">
          <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No merit list available</p>
          <p className="text-xs text-muted-foreground mt-1">
            Results for {examType} · {year} {viewMode === "class" ? `(Class ${cls})` : "(All Classes)"} not published yet.
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="bg-primary text-white px-4 py-3 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm">{tableTitle}</h3>
              <p className="text-xs text-blue-200">{displayEntries.length} students ranked</p>
            </div>
            <Trophy className="w-5 h-5 text-blue-400" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="p-3 text-center font-semibold text-xs">Rank</th>
                  {viewMode === "school" && <th className="p-3 text-center font-semibold text-xs">Class</th>}
                  <th className="p-3 text-left font-semibold text-xs">Roll No</th>
                  <th className="p-3 text-left font-semibold text-xs">Student Name</th>
                  <th className="p-3 text-center font-semibold text-xs">Marks</th>
                  <th className="p-3 text-center font-semibold text-xs">%</th>
                  <th className="p-3 text-center font-semibold text-xs">Grade</th>
                </tr>
              </thead>
              <tbody>
                {displayEntries.map((e, i) => (
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
                    {viewMode === "school" && (
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
                    <td className="p-3 text-center font-bold text-sm">{e.percentage}%</td>
                    <td className="p-3 text-center"><GBadge g={e.grade} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Schedule Hub wrapper (passes inline ExamScheduleTab as prop) ─────────────
const ScheduleHub = () => <ScheduleHubTab ExamScheduleTab={ExamScheduleTab} />;

// ─── Main Dashboard ───────────────────────────────────────────────────────────
const tabComponents: Record<string, React.ComponentType<any>> = {
  overview:          OverviewTab,
  timetable:         ScheduleHub,
  results:           ResultsHubTab,
  "exam-rolls":      ResultsHubTab,
  "result-card":     ResultsHubTab,
  "exam-schedule":   ScheduleHub,
  analytics:         SchoolAnalyticsTab,
  notices:           NoticesNewsTab,
  news:              NoticesNewsTab,
  notes:             NotesHub,
  library:           LibraryTab,
  gallery:           MediaHighlightsTab,
  videos:            MediaHighlightsTab,
  achievements:      MediaHighlightsTab,
  "honor-roll":      MediaHighlightsTab,
  teachers:          TeachersTab,
  profile:           ProfileTab,
  "online-classes":  OnlineClassesTab,
  "merit-list":      MeritListTab,
  finance:           FinanceTab,
  "id-cards":        UserStudentIDCards,
};

const UserDashboard = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const TabComponent = tabComponents[activeTab] || OverviewTab;

  return (
    <DashboardLayout activeTab={activeTab} onTabChange={setActiveTab}>
      <TabComponent onNavigate={setActiveTab} />
    </DashboardLayout>
  );
};

export default UserDashboard;
