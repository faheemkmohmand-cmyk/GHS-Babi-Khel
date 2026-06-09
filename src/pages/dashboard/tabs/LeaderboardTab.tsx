import { useState } from "react";
import { Trophy, Flame, Star, Crown, Medal, TrendingUp, Users, Zap } from "lucide-react";
import { motion } from "framer-motion";
import {
  useWeeklyLeaderboard, useLeaderboard, useHouses, useMyHouse,
  useJoinHouse, useGamification, BADGES,
} from "@/hooks/useNotes";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

// ─── House Card ───────────────────────────────────────────────────────────────
const HouseCard = ({ house, rank, isMyHouse }: { house: any; rank: number; isMyHouse: boolean }) => {
  const rankBadge = rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : `#${rank + 1}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.1 }}
      className={`relative bg-card border-2 rounded-2xl p-4 sm:p-5 transition-all hover:shadow-lg ${
        isMyHouse ? "shadow-lg" : "border-border"
      }`}
      style={isMyHouse ? { borderColor: house.color } : {}}
    >
      {isMyHouse && (
        <div className="absolute -top-2.5 right-3 bg-primary text-primary-foreground text-[10px] font-black px-2.5 py-0.5 rounded-full">
          MY HOUSE
        </div>
      )}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">{rankBadge}</span>
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-inner"
          style={{ backgroundColor: `${house.color}20` }}
        >
          {house.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-foreground text-sm sm:text-base truncate">{house.name}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" /> {house.member_count || 0} members
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap className="w-4 h-4" style={{ color: house.color }} />
          <span className="text-lg font-black text-foreground">{house.total_points || 0}</span>
          <span className="text-xs text-muted-foreground">pts</span>
        </div>
        <div className="h-2 bg-muted rounded-full flex-1 mx-3 max-w-[120px] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, (house.total_points || 0) / Math.max(1, 100) * 100)}%`, backgroundColor: house.color }}
          />
        </div>
      </div>
    </motion.div>
  );
};

// ─── House Sorting ────────────────────────────────────────────────────────────
const HouseSorting = () => {
  const { user } = useAuth();
  const { data: houses = [] } = useHouses();
  const { data: myHouse } = useMyHouse(user?.id);
  const joinHouse = useJoinHouse();
  const [joining, setJoining] = useState<string | null>(null);

  const handleJoin = async (houseId: string) => {
    if (!user) return;
    setJoining(houseId);
    try {
      await joinHouse.mutateAsync({ houseId, userId: user.id });
    } finally {
      setJoining(null);
    }
  };

  if (myHouse) return null; // Already sorted

  return (
    <div className="bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-5 sm:p-6 mb-6">
      <div className="text-center mb-4">
        <h3 className="text-lg font-black text-foreground flex items-center justify-center gap-2">
          <Crown className="w-5 h-5 text-primary" /> Choose Your House
        </h3>
        <p className="text-xs text-muted-foreground mt-1">Join a house and earn collective points with your team!</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {houses.map(h => (
          <button
            key={h.id}
            onClick={() => handleJoin(h.id)}
            disabled={joining !== null}
            className="bg-card border-2 border-border hover:border-primary/50 rounded-xl p-3 sm:p-4 text-center transition-all hover:shadow-md disabled:opacity-50"
          >
            <div className="text-3xl mb-1">{h.emoji}</div>
            <h4 className="text-xs sm:text-sm font-bold text-foreground">{h.name}</h4>
            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{h.description}</p>
            {joining === h.id ? (
              <div className="mt-2 w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            ) : (
              <span className="mt-2 inline-block text-[10px] font-bold text-primary">Join →</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Badge Display ────────────────────────────────────────────────────────────
const BadgeDisplay = ({ badges, compact = false }: { badges: string[]; compact?: boolean }) => {
  const earned = badges.map(b => {
    const def = BADGES.find(d => d.id === b);
    return def ? { ...def, earned: true } : { id: b, emoji: "🎖️", label: b, desc: "", earned: true };
  });
  const locked = BADGES.filter(d => !badges.includes(d.id)).map(d => ({ ...d, earned: false }));
  const all = [...earned, ...locked];

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {all.slice(0, 8).map(b => (
          <div
            key={b.id}
            className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all ${
              b.earned
                ? "bg-primary/15 shadow-sm hover:shadow-md"
                : "bg-muted opacity-40 grayscale"
            }`}
            title={`${b.label}: ${b.desc}`}
          >
            {b.emoji}
          </div>
        ))}
        {all.length > 8 && (
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-muted-foreground bg-muted">
            +{all.length - 8}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
      {all.map(b => (
        <motion.div
          key={b.id}
          whileHover={{ scale: 1.03 }}
          className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all ${
            b.earned
              ? "bg-card border-primary/30 shadow-sm"
              : "bg-muted/50 border-border opacity-50"
          }`}
        >
          <span className="text-2xl">{b.emoji}</span>
          <div className="min-w-0">
            <p className={`text-xs font-bold truncate ${b.earned ? "text-foreground" : "text-muted-foreground"}`}>
              {b.label}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">{b.desc}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

// ─── Leaderboard Table Row ────────────────────────────────────────────────────
const LeaderboardRow = ({ entry, rank, isCurrentUser }: { entry: any; rank: number; isCurrentUser: boolean }) => {
  const rankBadge = rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : `${rank + 1}`;
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.05 }}
      className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
        isCurrentUser
          ? "bg-primary/10 border border-primary/30 shadow-sm"
          : "hover:bg-secondary/50"
      }`}
    >
      <span className="w-8 text-center text-lg shrink-0">{rankBadge}</span>
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
        {entry.full_name?.[0]?.toUpperCase() || "?"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">
          {entry.full_name || "Anonymous"}
          {isCurrentUser && <span className="text-primary ml-1">(You)</span>}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            🔥 {entry.streak_days || 0}d
          </span>
          {(entry.badges || []).length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {entry.badges.slice(0, 3).map((b: string) => {
                const def = BADGES.find(d => d.id === b);
                return def ? def.emoji : "";
              }).join(" ")}
            </span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-black text-foreground">{entry.weekly_points ?? entry.total_points ?? 0}</p>
        <p className="text-[10px] text-muted-foreground">pts</p>
      </div>
    </motion.div>
  );
};

// ─── Main LeaderboardTab ──────────────────────────────────────────────────────
const LeaderboardTab = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<"weekly" | "alltime" | "houses" | "badges">("weekly");

  const { data: weeklyData = [], isLoading: weeklyLoading } = useWeeklyLeaderboard();
  const { data: allTimeData = [], isLoading: allTimeLoading } = useLeaderboard();
  const { data: houses = [], isLoading: housesLoading } = useHouses();
  const { data: myHouse } = useMyHouse(user?.id);
  const { data: myGamification } = useGamification(user?.id);

  const tabs = [
    { id: "weekly" as const, label: "Weekly", icon: TrendingUp },
    { id: "alltime" as const, label: "All Time", icon: Trophy },
    { id: "houses" as const, label: "Houses", icon: Users },
    { id: "badges" as const, label: "Badges", icon: Star },
  ];

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" /> Leaderboard & Achievements
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">Compete with classmates, earn badges, and lead your house to victory</p>
      </div>

      {/* My Stats Summary */}
      {myGamification && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-xl p-3 text-center shadow-sm">
            <p className="text-2xl font-black text-primary">{myGamification.total_points || 0}</p>
            <p className="text-[10px] text-muted-foreground font-medium">Total Points</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center shadow-sm">
            <p className="text-2xl font-black text-orange-500">{myGamification.streak_days || 0}</p>
            <p className="text-[10px] text-muted-foreground font-medium">Day Streak</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center shadow-sm">
            <p className="text-2xl font-black text-emerald-500">{(myGamification.badges || []).length}</p>
            <p className="text-[10px] text-muted-foreground font-medium">Badges</p>
          </div>
        </div>
      )}

      {/* My house info */}
      {myHouse?.houses && (
        <div className="bg-card border-2 rounded-xl p-4 shadow-sm" style={{ borderColor: myHouse.houses.color }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: `${myHouse.houses.color}20` }}>
              {myHouse.houses.emoji}
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{myHouse.houses.name}</p>
              <p className="text-xs text-muted-foreground">{myHouse.houses.total_points || 0} house points</p>
            </div>
          </div>
        </div>
      )}

      {/* House Sorting (if not in a house) */}
      <HouseSorting />

      {/* Tab switcher */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              tab === t.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary text-muted-foreground hover:bg-secondary/70"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "weekly" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-primary" /> Weekly Leaderboard
            </h3>
            <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-1 rounded-lg">Resets every Monday</span>
          </div>
          {weeklyLoading ? (
            <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : weeklyData.length === 0 ? (
            <div className="text-center py-10 bg-card rounded-2xl border border-border">
              <TrendingUp className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm font-semibold text-foreground">No weekly activity yet</p>
              <p className="text-xs text-muted-foreground mt-1">Start studying to appear on the weekly leaderboard!</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {weeklyData.map((entry, i) => (
                <LeaderboardRow key={entry.user_id} entry={entry} rank={i} isCurrentUser={entry.user_id === user?.id} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "alltime" && (
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5 mb-3">
            <Trophy className="w-4 h-4 text-primary" /> All-Time Leaderboard
          </h3>
          {allTimeLoading ? (
            <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : allTimeData.length === 0 ? (
            <div className="text-center py-10 bg-card rounded-2xl border border-border">
              <Trophy className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm font-semibold text-foreground">No data yet</p>
              <p className="text-xs text-muted-foreground mt-1">Be the first to earn points!</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {allTimeData.map((entry, i) => (
                <LeaderboardRow key={entry.user_id} entry={entry} rank={i} isCurrentUser={entry.user_id === user?.id} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "houses" && (
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5 mb-3">
            <Users className="w-4 h-4 text-primary" /> House Rankings
          </h3>
          {housesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {houses.map((h, i) => (
                <HouseCard key={h.id} house={h} rank={i} isMyHouse={myHouse?.house_id === h.id} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "badges" && (
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5 mb-3">
            <Star className="w-4 h-4 text-primary" /> Achievement Badges
          </h3>
          <BadgeDisplay badges={myGamification?.badges || []} />
          {(myGamification?.badges || []).length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Medal className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No badges earned yet</p>
              <p className="text-xs mt-1">Complete chapters, ace quizzes, and help classmates to earn badges!</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LeaderboardTab;
