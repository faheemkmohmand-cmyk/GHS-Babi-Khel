/**
 * BookQRManager.tsx
 * Issue / Return system with QR code scanning.
 *  - Students scan a book's QR (using device camera) → marks as issued to them
 *  - Due date auto-set (14 days from issue)
 *  - Reminder banner shown on day before due date
 *  - Teachers can mark return / view all active issues
 *
 * Uses html5-qrcode (already in package.json deps) for camera scanning.
 * Books and issues are stored in Supabase tables (see migration 010_library_issues.sql).
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  QrCode, ScanLine, BookMarked, X, CheckCircle, AlertCircle,
  RotateCcw, Clock, User, Loader2, ArrowLeft, ArrowRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

// ── Types ────────────────────────────────────────────────────────────────────
interface Book {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  qr_code: string;          // unique QR identifier
  total_copies: number;
  available_copies: number;
  cover_url: string | null;
}
interface BookIssue {
  id: string;
  book_id: string;
  book: Book | null;
  user_id: string;
  user_name: string;
  issued_at: string;
  due_date: string;
  returned_at: string | null;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  userId?: string;
  userName?: string;
  isTeacher?: boolean;
  subjectColor?: string;
}

export default function BookQRManager({ userId, userName, isTeacher = false, subjectColor = "#3b82f6" }: Props) {
  const [mode, setMode] = useState<"scan" | "active" | "all" | "browse">("scan");
  const [scanning, setScanning] = useState(false);
  const [scannerReady, setScannerReady] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [foundBook, setFoundBook] = useState<Book | null>(null);
  const [issueLoading, setIssueLoading] = useState(false);
  const [myIssues, setMyIssues] = useState<BookIssue[]>([]);
  const [allIssues, setAllIssues] = useState<BookIssue[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const scannerRef = useRef<any>(null);
  const scannerDivId = "qr-reader";
  const { toast } = useToast();

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load books for browse
      const { data: booksData } = await supabase
        .from("library_books")
        .select("*")
        .order("title", { ascending: true })
        .limit(100);
      setBooks(booksData || []);

      // Load active issues for current user
      if (userId) {
        const { data: myActive } = await supabase
          .from("book_issues")
          .select("*, book:library_books(*)")
          .eq("user_id", userId)
          .is("returned_at", null)
          .order("due_date", { ascending: true });
        setMyIssues(myActive || []);
      }

      // Load all active issues (teacher view)
      if (isTeacher) {
        const { data: allActive } = await supabase
          .from("book_issues")
          .select("*, book:library_books(*)")
          .is("returned_at", null)
          .order("due_date", { ascending: true })
          .limit(50);
        setAllIssues(allActive || []);
      }
    } catch (e) {
      console.error("Failed to load library data:", e);
    } finally {
      setLoading(false);
    }
  }, [userId, isTeacher]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── QR scanner ────────────────────────────────────────────────────────────
  const startScanner = async () => {
    setScanning(true);
    setScannerReady(false);
    // Defer to next tick so the div exists in DOM
    setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const scanner = new Html5Qrcode(scannerDivId);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText: string) => handleScan(decodedText),
          (err: any) => { /* ignore per-frame failures */ }
        );
        setScannerReady(true);
      } catch (e: any) {
        console.error("QR scanner failed to start:", e);
        toast({
          title: "Camera unavailable",
          description: "Use the manual entry box below to type the book code.",
          variant: "destructive",
        });
        setScanning(false);
      }
    }, 100);
  };

  const stopScanner = useCallback(() => {
    if (scannerRef.current) {
      try { scannerRef.current.stop().then(() => scannerRef.current.clear()); } catch { /* noop */ }
      scannerRef.current = null;
    }
    setScanning(false);
    setScannerReady(false);
  }, []);

  useEffect(() => () => stopScanner(), [stopScanner]);

  const handleScan = async (code: string) => {
    stopScanner();
    setManualCode(code);
    await lookupBook(code);
  };

  const lookupBook = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("library_books")
        .select("*")
        .eq("qr_code", trimmed)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast({
          title: "Book not found",
          description: `No book with code "${trimmed}". Ask the librarian to add it.`,
          variant: "destructive",
        });
        setFoundBook(null);
      } else {
        setFoundBook(data as Book);
      }
    } catch (e: any) {
      toast({ title: "Lookup failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Issue book ─────────────────────────────────────────────────────────────
  const issueBook = async () => {
    if (!foundBook || !userId || !userName) {
      toast({ title: "Sign in required", description: "Please sign in to issue books.", variant: "destructive" });
      return;
    }
    if (foundBook.available_copies <= 0) {
      toast({ title: "No copies available", description: "All copies are currently issued.", variant: "destructive" });
      return;
    }
    setIssueLoading(true);
    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14); // 2-week loan

      const { data, error } = await supabase
        .from("book_issues")
        .insert({
          book_id: foundBook.id,
          user_id: userId,
          user_name: userName,
          issued_at: new Date().toISOString(),
          due_date: dueDate.toISOString(),
        })
        .select("*, book:library_books(*)")
        .single();

      if (error) throw error;

      // Decrement available_copies
      await supabase
        .from("library_books")
        .update({ available_copies: foundBook.available_copies - 1 })
        .eq("id", foundBook.id);

      toast({
        title: "Book issued! 📚",
        description: `Due back on ${dueDate.toLocaleDateString()}. A reminder will appear here the day before.`,
      });
      setFoundBook(null);
      setManualCode("");
      await loadData();
    } catch (e: any) {
      toast({ title: "Issue failed", description: e.message, variant: "destructive" });
    } finally {
      setIssueLoading(false);
    }
  };

  // ── Return book ────────────────────────────────────────────────────────────
  const returnBook = async (issue: BookIssue) => {
    if (!confirm(`Mark "${issue.book?.title}" as returned?`)) return;
    try {
      const { error } = await supabase
        .from("book_issues")
        .update({ returned_at: new Date().toISOString() })
        .eq("id", issue.id);
      if (error) throw error;

      // Increment available_copies
      if (issue.book) {
        await supabase
          .from("library_books")
          .update({ available_copies: issue.book.available_copies + 1 })
          .eq("id", issue.book.id);
      }

      toast({ title: "Book returned ✅", description: "Thanks for returning on time!" });
      await loadData();
    } catch (e: any) {
      toast({ title: "Return failed", description: e.message, variant: "destructive" });
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const isOverdue = (due: string) => new Date(due) < new Date();
  const isDueSoon = (due: string) => {
    const ms = new Date(due).getTime() - Date.now();
    return ms > 0 && ms < 86400000 * 2; // within 2 days
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Mode tabs */}
      <div className="flex gap-1 bg-secondary/50 rounded-xl p-1">
        {([
          { key: "scan",    label: "Scan / Issue", icon: ScanLine },
          { key: "active",  label: "My Books",     icon: BookMarked },
          ...(isTeacher ? [{ key: "all" as const, label: "All Issues", icon: User }] : []),
          { key: "browse",  label: "Browse",       icon: BookMarked },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => { setMode(t.key); if (t.key !== "scan") stopScanner(); }}
            className={`flex-1 py-2 px-1 rounded-lg text-[11px] font-semibold transition-all flex items-center justify-center gap-1 ${
              mode === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            <t.icon className="w-3 h-3" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Scan / Issue mode */}
      {mode === "scan" && (
        <div className="space-y-4">
          {!scanning && !foundBook && (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <QrCode className="w-8 h-8 text-primary" />
              </div>
              <h3 className="font-bold text-foreground mb-1">Scan a Book's QR Code</h3>
              <p className="text-xs text-muted-foreground mb-4 max-w-xs mx-auto">
                Point your camera at the QR sticker on any library book to issue it instantly.
              </p>
              <button
                onClick={startScanner}
                className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-dark"
              >
                <ScanLine className="w-4 h-4" /> Start Scanning
              </button>
            </div>
          )}

          {/* Scanner viewport */}
          {scanning && (
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: "1 / 1" }}>
                <div id={scannerDivId} className="w-full h-full" />
                {!scannerReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                )}
                {/* Scan target overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-56 h-56 border-2 border-white/60 rounded-2xl" />
                </div>
              </div>
              <button onClick={stopScanner} className="w-full py-2 rounded-lg bg-secondary text-foreground text-sm font-semibold">Cancel</button>
            </div>
          )}

          {/* Manual entry fallback */}
          {!scanning && !foundBook && (
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-2">No camera? Type the book code manually:</p>
              <div className="flex gap-2">
                <input
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && lookupBook(manualCode)}
                  placeholder="e.g. BK-001"
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  onClick={() => lookupBook(manualCode)}
                  disabled={loading || !manualCode.trim()}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50"
                >
                  Find
                </button>
              </div>
            </div>
          )}

          {/* Found book → confirm issue */}
          {foundBook && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border-2 border-primary rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-start gap-3">
                {foundBook.cover_url ? (
                  <img src={foundBook.cover_url} alt="" className="w-16 h-24 object-cover rounded-lg" />
                ) : (
                  <div className="w-16 h-24 bg-secondary rounded-lg flex items-center justify-center">
                    <BookMarked className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-foreground text-sm">{foundBook.title}</h4>
                  {foundBook.author && <p className="text-xs text-muted-foreground">by {foundBook.author}</p>}
                  {foundBook.isbn && <p className="text-[10px] text-muted-foreground font-mono mt-1">ISBN: {foundBook.isbn}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-mono">{foundBook.qr_code}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      foundBook.available_copies > 0
                        ? "bg-green-500/15 text-green-600"
                        : "bg-red-500/15 text-red-600"
                    }`}>
                      {foundBook.available_copies} / {foundBook.total_copies} available
                    </span>
                  </div>
                </div>
              </div>

              {foundBook.available_copies > 0 ? (
                <>
                  <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-2.5 text-xs text-blue-700 dark:text-blue-300">
                    <Clock className="w-3 h-3 inline mr-1" />
                    Due in 14 days ({new Date(Date.now() + 14 * 86400000).toLocaleDateString()})
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setFoundBook(null); setManualCode(""); }}
                      className="flex-1 py-2 rounded-lg bg-secondary text-foreground text-sm font-semibold">Cancel</button>
                    <button
                      onClick={issueBook}
                      disabled={issueLoading || !userId}
                      className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {issueLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      Issue to Me
                    </button>
                  </div>
                  {!userId && <p className="text-[10px] text-red-500 text-center">Sign in to issue books.</p>}
                </>
              ) : (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-2.5 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  All copies are currently issued. Check back later or ask the librarian.
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}

      {/* My Books mode */}
      {mode === "active" && (
        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
          ) : myIssues.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <BookMarked className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-semibold">No books issued</p>
              <p className="text-xs mt-1">Scan a book's QR code to issue it.</p>
            </div>
          ) : (
            myIssues.map(issue => (
              <IssueCard key={issue.id} issue={issue} onReturn={() => returnBook(issue)} />
            ))
          )}
        </div>
      )}

      {/* All issues (teacher) */}
      {mode === "all" && isTeacher && (
        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
          ) : allIssues.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-500" />
              <p className="text-sm font-semibold">No active issues</p>
              <p className="text-xs mt-1">All library books are on the shelf.</p>
            </div>
          ) : (
            allIssues.map(issue => (
              <IssueCard key={issue.id} issue={issue} onReturn={() => returnBook(issue)} showUser />
            ))
          )}
        </div>
      )}

      {/* Browse mode */}
      {mode === "browse" && (
        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
          ) : books.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <BookMarked className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-semibold">No books in catalog yet</p>
              <p className="text-xs mt-1">Librarian can add books via the admin panel.</p>
            </div>
          ) : (
            books.map(book => (
              <div key={book.id} className="bg-card border border-border rounded-xl p-3 flex items-start gap-3">
                {book.cover_url ? (
                  <img src={book.cover_url} alt="" className="w-12 h-16 object-cover rounded-md" />
                ) : (
                  <div className="w-12 h-16 bg-secondary rounded-md flex items-center justify-center">
                    <BookMarked className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-foreground text-sm line-clamp-1">{book.title}</h4>
                  {book.author && <p className="text-xs text-muted-foreground">by {book.author}</p>}
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      book.available_copies > 0
                        ? "bg-green-500/15 text-green-600"
                        : "bg-red-500/15 text-red-600"
                    }`}>
                      {book.available_copies} / {book.total_copies} available
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-mono">{book.qr_code}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Issue card subcomponent ──────────────────────────────────────────────────
function IssueCard({ issue, onReturn, showUser = false }: { issue: BookIssue; onReturn: () => void; showUser?: boolean }) {
  const overdue = isOverdue(issue.due_date);
  const dueSoon = isDueSoon(issue.due_date);
  const book = issue.book;

  return (
    <div className={`bg-card border rounded-xl p-3 ${
      overdue ? "border-red-300 dark:border-red-900"
      : dueSoon ? "border-amber-300 dark:border-amber-900"
      : "border-border"
    }`}>
      <div className="flex items-start gap-3">
        {book?.cover_url ? (
          <img src={book.cover_url} alt="" className="w-12 h-16 object-cover rounded-md" />
        ) : (
          <div className="w-12 h-16 bg-secondary rounded-md flex items-center justify-center">
            <BookMarked className="w-4 h-4 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-foreground text-sm line-clamp-1">{book?.title || "Unknown book"}</h4>
          {book?.author && <p className="text-xs text-muted-foreground">by {book.author}</p>}
          {showUser && (
            <p className="text-[11px] text-foreground font-medium mt-0.5">👤 {issue.user_name}</p>
          )}
          <div className={`text-[11px] mt-1 flex items-center gap-1 ${
            overdue ? "text-red-600 dark:text-red-400 font-semibold"
            : dueSoon ? "text-amber-600 dark:text-amber-400 font-semibold"
            : "text-muted-foreground"
          }`}>
            <Clock className="w-3 h-3" />
            {overdue
              ? `Overdue by ${Math.ceil((Date.now() - new Date(issue.due_date).getTime()) / 86400000)} day(s)`
              : dueSoon
              ? `Due in ${Math.ceil((new Date(issue.due_date).getTime() - Date.now()) / 86400000)} day(s)`
              : `Due ${new Date(issue.due_date).toLocaleDateString()}`
            }
          </div>
        </div>
        <button
          onClick={onReturn}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-semibold flex items-center gap-1"
        >
          <RotateCcw className="w-3 h-3" /> Return
        </button>
      </div>
    </div>
  );
}

function isOverdue(due: string) { return new Date(due) < new Date(); }
function isDueSoon(due: string) {
  const ms = new Date(due).getTime() - Date.now();
  return ms > 0 && ms < 86400000 * 2;
}
