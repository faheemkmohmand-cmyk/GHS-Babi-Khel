/**
 * AdminStudentCredentials.tsx — GHS Babi Khel
 *
 * Parent tab: "Student Credentials"
 * Two sub-sections:
 *   1. Student ID Cards  (moved here from standalone nav item)
 *   2. Monitor Pass      (new feature)
 *
 * Uses manual state tab pattern (same as AdminAnnouncements)
 * to avoid Android Chrome GPU corruption from Radix Tabs.
 */

import { useState } from "react";
import type React from "react";
import { CreditCard, ShieldCheck } from "lucide-react";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const AdminStudentIDCards = lazy(() => import("./AdminStudentIDCards"));
const AdminMonitorPass    = lazy(() => import("./AdminMonitorPass"));

type CredTab = "id-cards" | "monitor-pass";

const tabs: { id: CredTab; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    id: "id-cards",
    label: "Student ID Cards",
    icon: <CreditCard className="w-4 h-4 shrink-0" />,
    desc: "Generate & download HD student identity cards",
  },
  {
    id: "monitor-pass",
    label: "Monitor Pass",
    icon: <ShieldCheck className="w-4 h-4 shrink-0" />,
    desc: "Generate class monitor / hall passes for Grade 6–10",
  },
];

const Fallback = () => (
  <div className="space-y-4">
    <Skeleton className="h-8 w-64" />
    <div className="grid grid-cols-2 gap-4">
      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
    </div>
    <Skeleton className="h-80 rounded-xl" />
  </div>
);

const AdminStudentCredentials = () => {
  const [active, setActive] = useState<CredTab>("id-cards");

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground">
          Student Credentials
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Identity cards and official passes for students of GHS Babi Khel
        </p>
      </div>

      {/* Sub-tab bar */}
      <div className="grid grid-cols-2 gap-1 bg-muted rounded-xl p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`flex items-center gap-2 justify-center sm:justify-start px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
              active === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden text-xs">{t.label.split(" ").slice(-1)[0]}</span>
          </button>
        ))}
      </div>

      {/* Tab description chip */}
      <p className="text-xs text-muted-foreground px-1">
        {tabs.find((t) => t.id === active)?.desc}
      </p>

      {/* Active section — only one rendered at a time */}
      <Suspense fallback={<Fallback />}>
        {active === "id-cards"     && <AdminStudentIDCards />}
        {active === "monitor-pass" && <AdminMonitorPass />}
      </Suspense>
    </div>
  );
};

export default AdminStudentCredentials;
