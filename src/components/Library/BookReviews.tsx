/**
 * BookReviews.tsx
 * GoodReads-style book reviews + 5-star ratings + "Recommended for you".
 *
 * Features:
 *  - List reviews for a single book (passed via `bookId`)
 *  - User can rate 1-5 stars + write a comment
 *  - Average rating displayed prominently
 *  - "Recommended for you" — collaborative filter: "Students who read X also read Y"
 *    (works by querying book_issues table for users who read this book, then
 *    finding other books those users also read — no ML needed, just SQL joins).
 *
 * Stored in book_reviews table (see migration 010_library_issues.sql).
 */
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Star, ThumbsUp, MessageCircle, Send, BookOpen, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

interface Review {
  id: string;
  book_id: string;
  user_id: string;
  user_name: string;
  rating: number;        // 1-5
  comment: string | null;
  helpful_count: number;
  created_at: string;
  user_avatar_url?: string | null;
}

interface RecommendedBook {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  read_count: number;
}

interface Props {
  bookId: string;
  bookTitle?: string;
  currentUserId?: string;
  currentUserName?: string;
  subjectColor?: string;
}

// ── Star rating display ─────────────────────────────────────────────────────
function Stars({ value, size = 16, onChange }: { value: number; size?: number; onChange?: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => {
        const filled = (hover || value) >= n;
        return (
          <button
            key={n}
            type="button"
            disabled={!onChange}
            onClick={() => onChange?.(n)}
            onMouseEnter={() => onChange && setHover(n)}
            onMouseLeave={() => onChange && setHover(0)}
            className={`${onChange ? "cursor-pointer" : "cursor-default"} transition-transform ${onChange ? "hover:scale-110" : ""}`}
            aria-label={`${n} star${n !== 1 ? "s" : ""}`}
          >
            <Star
              className={filled ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30"}
              style={{ width: size, height: size }}
            />
          </button>
        );
      })}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function BookReviews({
  bookId, bookTitle, currentUserId, currentUserName, subjectColor = "#3b82f6",
}: Props) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avgRating, setAvgRating] = useState(0);
  const [myRating, setMyRating] = useState(0);
  const [myComment, setMyComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<RecommendedBook[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const { toast } = useToast();

  // ── Load reviews ─────────────────────────────────────────────────────────
  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("book_reviews")
        .select("*")
        .eq("book_id", bookId)
        .order("helpful_count", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      setReviews(data || []);
      if (data && data.length > 0) {
        const avg = data.reduce((sum, r) => sum + r.rating, 0) / data.length;
        setAvgRating(avg);
      }
      // Find current user's existing review
      if (currentUserId) {
        const mine = data?.find(r => r.user_id === currentUserId);
        if (mine) { setMyRating(mine.rating); setMyComment(mine.comment || ""); }
      }
    } catch (e: any) {
      console.error("Failed to load reviews:", e);
    } finally {
      setLoading(false);
    }
  }, [bookId, currentUserId]);

  // ── Load recommendations ("students who read this also read…") ──────────
  const loadRecommendations = useCallback(async () => {
    setLoadingRecs(true);
    try {
      // Step 1: Find all user_ids who read (issued & returned) this book
      const { data: coReaders } = await supabase
        .from("book_issues")
        .select("user_id")
        .eq("book_id", bookId)
        .not("returned_at", "is", null);

      if (!coReaders || coReaders.length === 0) {
        setRecommendations([]);
        return;
      }

      const userIds = [...new Set(coReaders.map(r => r.user_id))].slice(0, 100);

      // Step 2: Find OTHER books those users also read
      const { data: otherBooks } = await supabase
        .from("book_issues")
        .select("book_id, book:library_books(id, title, author, cover_url)")
        .in("user_id", userIds)
        .neq("book_id", bookId)
        .not("returned_at", "is", null);

      if (!otherBooks || otherBooks.length === 0) {
        setRecommendations([]);
        return;
      }

      // Step 3: Group by book, count readers, dedupe
      const counts = new Map<string, RecommendedBook>();
      for (const row of otherBooks as any[]) {
        const book = row.book;
        if (!book) continue;
        if (counts.has(book.id)) {
          counts.get(book.id)!.read_count++;
        } else {
          counts.set(book.id, {
            id: book.id,
            title: book.title,
            author: book.author,
            cover_url: book.cover_url,
            read_count: 1,
          });
        }
      }

      // Sort by reader count, take top 6
      setRecommendations([...counts.values()].sort((a, b) => b.read_count - a.read_count).slice(0, 6));
    } catch (e) {
      console.error("Recommendations failed:", e);
      setRecommendations([]);
    } finally {
      setLoadingRecs(false);
    }
  }, [bookId]);

  useEffect(() => { loadReviews(); }, [loadReviews]);
  useEffect(() => { loadRecommendations(); }, [loadRecommendations]);

  // ── Submit review ────────────────────────────────────────────────────────
  const submitReview = async () => {
    if (!currentUserId || !currentUserName) {
      toast({ title: "Sign in required", description: "Please sign in to leave a review.", variant: "destructive" });
      return;
    }
    if (myRating === 0) {
      toast({ title: "Pick a rating", description: "Tap 1-5 stars first.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      // Check if user already has a review → upsert
      const { data: existing } = await supabase
        .from("book_reviews")
        .select("id")
        .eq("book_id", bookId)
        .eq("user_id", currentUserId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("book_reviews")
          .update({ rating: myRating, comment: myComment.trim() || null, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
        toast({ title: "Review updated ✅" });
      } else {
        const { error } = await supabase
          .from("book_reviews")
          .insert({
            book_id: bookId,
            user_id: currentUserId,
            user_name: currentUserName,
            rating: myRating,
            comment: myComment.trim() || null,
            helpful_count: 0,
          });
        if (error) throw error;
        toast({ title: "Review posted! ✅", description: "Thanks for sharing your thoughts." });
      }
      setMyComment("");
      await loadReviews();
    } catch (e: any) {
      toast({ title: "Failed to post review", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Mark helpful ─────────────────────────────────────────────────────────
  const markHelpful = async (reviewId: string, currentCount: number) => {
    if (!currentUserId) {
      toast({ title: "Sign in to vote", variant: "destructive" });
      return;
    }
    try {
      const { error } = await supabase
        .from("book_reviews")
        .update({ helpful_count: currentCount + 1 })
        .eq("id", reviewId);
      if (error) throw error;
      setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, helpful_count: r.helpful_count + 1 } : r));
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header — avg rating */}
      <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4">
        <div className="text-center">
          <p className="text-3xl font-black text-foreground">{avgRating.toFixed(1)}</p>
          <Stars value={avgRating} size={14} />
          <p className="text-[10px] text-muted-foreground mt-1">{reviews.length} review{reviews.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="w-px h-12 bg-border" />
        <div>
          <h3 className="font-bold text-foreground text-sm">Reader Reviews</h3>
          <p className="text-xs text-muted-foreground">
            {bookTitle ? <>for <span className="font-medium text-foreground">{bookTitle}</span></> : "Share what you thought"}
          </p>
        </div>
      </div>

      {/* Write a review */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <p className="text-xs font-semibold text-foreground mb-2">Your rating</p>
        <Stars value={myRating} size={28} onChange={setMyRating} />
        <textarea
          value={myComment}
          onChange={(e) => setMyComment(e.target.value)}
          placeholder="What did you think? (optional)"
          rows={3}
          className="w-full mt-3 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
        />
        <button
          onClick={submitReview}
          disabled={submitting || myRating === 0}
          className="mt-2 w-full py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
          style={{ backgroundColor: subjectColor }}
        >
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {submitting ? "Posting…" : "Post Review"}
        </button>
      </div>

      {/* Existing reviews */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-6"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <MessageCircle className="w-8 h-8 mx-auto mb-1 opacity-40" />
            <p className="text-sm">Be the first to review this book!</p>
          </div>
        ) : (
          reviews.map(r => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-border rounded-xl p-3"
            >
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: subjectColor }}>
                  {r.user_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">{r.user_name}</span>
                    <Stars value={r.rating} size={12} />
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {r.comment && (
                    <p className="text-sm text-foreground/80 mt-1.5 leading-relaxed">{r.comment}</p>
                  )}
                  <button
                    onClick={() => markHelpful(r.id, r.helpful_count)}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <ThumbsUp className="w-3 h-3" /> Helpful ({r.helpful_count})
                  </button>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Recommended for you */}
      <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-200 dark:border-purple-900 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <h3 className="font-bold text-foreground text-sm">Readers also enjoyed</h3>
        </div>
        {loadingRecs ? (
          <div className="text-center py-4"><Loader2 className="w-5 h-5 animate-spin mx-auto text-purple-500" /></div>
        ) : recommendations.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            No recommendations yet — be the first to read & return this book!
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {recommendations.map(book => (
              <div key={book.id} className="bg-card border border-border rounded-lg p-2 flex items-start gap-2">
                {book.cover_url ? (
                  <img src={book.cover_url} alt="" className="w-10 h-14 object-cover rounded shrink-0" />
                ) : (
                  <div className="w-10 h-14 bg-secondary rounded flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-foreground line-clamp-2">{book.title}</p>
                  {book.author && <p className="text-[10px] text-muted-foreground line-clamp-1">by {book.author}</p>}
                  <p className="text-[9px] text-purple-500 mt-0.5 font-medium">{book.read_count} reader{book.read_count !== 1 ? "s" : ""}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
