/**
 * ReadingChallenge.tsx
 * "Read 10 books this term" challenge with progress bar + badge.
 * Counts unique books returned by the user this term (not just issued).
 *
 * Stored in book_issues table — no extra table needed.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Trophy, BookOpen, Star, Flame, Award } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Props {
  userId?: string;
  target?: number;       // books to read this term
  subjectColor?: string;
}

export default function ReadingChallenge({ userId, target = 10, subjectColor = "#3b82f6" }: Props) {
  const [booksRead, setBooksRead] = useState(0);
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    (async () => {
      try {
        // Count books returned this term (current school term ≈ last 4 months)
        const fourMonthsAgo = new Date();
        fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);

        const { data, error } = await supabase
          .from("book_issues")
          .select("returned_at, book_id")
          .eq("user_id", userId)
          .not("returned_at", "is", null)
          .gte("returned_at", fourMonthsAgo.toISOString());

        if (error) throw error;

        // Unique books read
        const uniqueBooks = new Set((data || []).map(r => r.book_id));
        setBooksRead(uniqueBooks.size);

        // Streak: count consecutive weeks with at least one return (simplified: just total returns)
        setStreak(data?.length || 0);
      } catch (e) {
        console.error("Reading challenge load failed:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  if (!userId) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5 text-center">
        <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-semibold text-foreground">Sign in to join the reading challenge</p>
        <p className="text-xs text-muted-foreground mt-1">Read {target} books this term and earn a badge!</p>
      </div>
    );
  }

  const pct = Math.min(100, (booksRead / target) * 100);
  const completed = booksRead >= target;
  const remaining = Math.max(0, target - booksRead);

  // Badge tier
  const tier = booksRead >= 10 ? { name: "Gold", color: "#f59e0b", icon: Trophy }
    : booksRead >= 7 ? { name: "Silver", color: "#94a3b8", icon: Award }
    : booksRead >= 4 ? { name: "Bronze", color: "#b45309", icon: Star }
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl p-5 text-white shadow-lg"
      style={{
        background: completed
          ? "linear-gradient(135deg, #f59e0b, #f97316)"
          : `linear-gradient(135deg, ${subjectColor}, ${subjectColor}dd)`,
      }}
    >
      {/* Background decoration */}
      <div className="absolute -top-6 -right-6 opacity-10">
        <BookOpen className="w-32 h-32" />
      </div>

      <div className="relative">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="w-5 h-5" />
          <h3 className="font-bold text-base">Reading Challenge</h3>
          {completed && (
            <span className="ml-auto bg-white/30 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">
              Completed! 🎉
            </span>
          )}
        </div>
        <p className="text-xs text-white/80 mb-4">
          {completed
            ? "Amazing! You've completed this term's challenge."
            : `Read ${remaining} more book${remaining !== 1 ? "s" : ""} to complete the challenge.`}
        </p>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs font-bold mb-1.5">
            <span>{booksRead} / {target} books</span>
            <span>{pct.toFixed(0)}%</span>
          </div>
          <div className="h-3 bg-black/20 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="h-full bg-white rounded-full flex items-center justify-end pr-1.5"
            >
              {pct > 15 && <span className="text-[9px] font-bold text-black/70">{booksRead}</span>}
            </motion.div>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-2">
          <div className="flex-1 bg-white/15 backdrop-blur-sm rounded-lg p-2">
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase opacity-80">
              <Flame className="w-3 h-3" /> Streak
            </div>
            <p className="font-bold text-lg">{streak}</p>
            <p className="text-[10px] opacity-70">books returned</p>
          </div>
          {tier && (
            <div className="flex-1 bg-white/15 backdrop-blur-sm rounded-lg p-2">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase opacity-80">
                <tier.icon className="w-3 h-3" /> Badge
              </div>
              <p className="font-bold text-lg" style={{ color: tier.color }}>{tier.name}</p>
              <p className="text-[10px] opacity-70">tier earned</p>
            </div>
          )}
        </div>

        {loading && (
          <div className="absolute inset-0 bg-black/30 rounded-2xl flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </div>
    </motion.div>
  );
}
