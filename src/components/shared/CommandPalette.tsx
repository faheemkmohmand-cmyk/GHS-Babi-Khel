import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut,
} from "@/components/ui/command";
import { supabase } from "@/lib/supabase";
import { useDebounce } from "@/hooks/useDebounce";
import {
  LayoutGrid, GraduationCap, Receipt, User as UserIcon, Search,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────── */
export interface PaletteNavItem {
  id: string;
  label: string;
  emoji?: string;
  lucideIcon?: React.ElementType;
  keywords?: string[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  navItems: PaletteNavItem[];
  basePath: "/admin" | "/dashboard";
  onTabChange: (tabId: string) => void;
  /** Only admins should be able to search live student/fee records. */
  enableDataSearch?: boolean;
}

/* ─── Live data search (admin only) ────────────────────────── */
const useStudentMatches = (term: string, enabled: boolean) =>
  useQuery({
    queryKey: ["palette-students", term],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, full_name, roll_number, class, father_name")
        .or(`full_name.ilike.%${term}%,roll_number.ilike.%${term}%,father_name.ilike.%${term}%`)
        .eq("is_active", true)
        .limit(5);
      return data ?? [];
    },
    enabled: enabled && term.length >= 2,
    staleTime: 30_000,
  });

const useFeeMatches = (term: string, enabled: boolean) =>
  useQuery({
    queryKey: ["palette-fees", term],
    queryFn: async () => {
      const { data } = await supabase
        .from("fee_vouchers")
        .select("id, voucher_number, total_amount, status, students(full_name, roll_number)")
        .or(`voucher_number.ilike.%${term}%`)
        .limit(5);
      return data ?? [];
    },
    enabled: enabled && term.length >= 2,
    staleTime: 30_000,
  });

/* ─── Fuzzy-ish ranking for nav items ───────────────────────── */
function scoreMatch(label: string, keywords: string[] | undefined, term: string) {
  const t = term.toLowerCase();
  const l = label.toLowerCase();
  if (l === t) return 100;
  if (l.startsWith(t)) return 80;
  if (l.includes(t)) return 60;
  if (keywords?.some(k => k.toLowerCase() === t)) return 70;
  if (keywords?.some(k => k.toLowerCase().includes(t))) return 40;
  return 0;
}

const CommandPalette = ({ open, onOpenChange, navItems, basePath, onTabChange, enableDataSearch }: CommandPaletteProps) => {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const debouncedQuery = useDebounce(query, 250);

  // Reset query each time the palette closes
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  const studentsEnabled = !!enableDataSearch && open;
  const feesEnabled = !!enableDataSearch && open;
  const { data: students = [], isFetching: studentsLoading } = useStudentMatches(debouncedQuery, studentsEnabled);
  const { data: fees = [], isFetching: feesLoading } = useFeeMatches(debouncedQuery, feesEnabled);

  const matchedPages = useMemo(() => {
    if (!query.trim()) return navItems.slice(0, 8); // show top items when empty
    return navItems
      .map(item => ({ item, score: Math.max(scoreMatch(item.label, item.keywords, query), 0) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item)
      .slice(0, 6);
  }, [navItems, query]);

  const goToTab = useCallback((tabId: string) => {
    onTabChange(tabId);
    onOpenChange(false);
  }, [onTabChange, onOpenChange]);

  const goToStudent = useCallback((studentId: string) => {
    navigate(`${basePath}?tab=students&studentId=${studentId}`);
    onOpenChange(false);
  }, [navigate, basePath, onOpenChange]);

  const goToFee = useCallback(() => {
    navigate(`${basePath}?tab=fees`);
    onOpenChange(false);
  }, [navigate, basePath, onOpenChange]);

  const showDataResults = enableDataSearch && query.trim().length >= 2;
  const isSearching = showDataResults && (studentsLoading || feesLoading);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search pages, students, fee vouchers…"
        value={query}
        onValueChange={setQuery}
        autoFocus={false}
      />
      <CommandList>
        <CommandEmpty>
          {isSearching ? "Searching…" : "No results found."}
        </CommandEmpty>

        {matchedPages.length > 0 && (
          <CommandGroup heading="Pages">
            {matchedPages.map(item => (
              <CommandItem key={item.id} value={`page-${item.id}`} onSelect={() => goToTab(item.id)}>
                {item.lucideIcon ? (
                  <item.lucideIcon className="w-4 h-4 mr-2 text-muted-foreground" />
                ) : item.emoji ? (
                  <span className="w-4 mr-2 text-center text-sm">{item.emoji}</span>
                ) : (
                  <LayoutGrid className="w-4 h-4 mr-2 text-muted-foreground" />
                )}
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {showDataResults && students.length > 0 && (
          <CommandGroup heading="Students">
            {students.map((s: any) => (
              <CommandItem key={s.id} value={`student-${s.id}`} onSelect={() => goToStudent(s.id)}>
                <GraduationCap className="w-4 h-4 mr-2 text-blue-500" />
                <span className="flex-1 truncate">{s.full_name}</span>
                <CommandShortcut>{s.class} · Roll {s.roll_number}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {showDataResults && fees.length > 0 && (
          <CommandGroup heading="Fee Vouchers">
            {fees.map((f: any) => (
              <CommandItem key={f.id} value={`fee-${f.id}`} onSelect={goToFee}>
                <Receipt className="w-4 h-4 mr-2 text-emerald-500" />
                <span className="flex-1 truncate">
                  {f.voucher_number} {f.students?.full_name ? `— ${f.students.full_name}` : ""}
                </span>
                <CommandShortcut className="capitalize">{f.status}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
};

export default CommandPalette;
            
