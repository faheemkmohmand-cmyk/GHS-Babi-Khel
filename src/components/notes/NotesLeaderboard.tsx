import { useState } from "react";
import { useWeeklyLeaderboard, useLeaderboard, useGamification, useMyHouse, useHouses, getRankOf, BADGES, type BadgeTier } from "@/hooks/useNotes";
import { useAuth } from "@/hooks/useAuth";
import { 
  Trophy, Medal, Star, Flame, Crown, Zap, Target, BookOpen, Award, Home, Users,
  ChevronDown, ChevronUp, Lock, TrendingUp, Calendar, Gem
} from "lucide-react";

type LeaderboardTab = "weekly" | "alltime" | "houses" | "badges";

// ─── Motivational Messages ──────────────────────────────────────────────────────
function getMotivationalMessage(rank: number | null): { emoji: string; message: string; color: string } {
  if (rank === 1) return { emoji: "👑", message: "You're the Champion!", color: "text-yellow-500" };
  if (rank === 2) return { emoji: "🥈", message: "So close to the top!", color: "text-gray-400" };
  if (rank === 3) return { emoji: "🥉", message: "You're on the podium!", color: "text-amber-600" };
  if (rank && rank <= 10) return { emoji: "🔥", message: "You're in the elite!", color: "text-orange-500" };
  if (rank && rank <= 25) return { emoji: "⭐", message: "Great progress! Keep going!", color: "text-blue-500" };
  return { emoji: "💪", message: "Keep studying to climb the ranks!", color: "text-green-500" };
}

// ─── Animated Fire Icon for Streaks ─────────────────────────────────────────────
function AnimatedFire({ size = 24 }: { size?: number }) {
  return (
    <span className="inline-block animate-pulse">
      <Flame size={size} className="text-orange-500 fill-orange-500" />
    </span>
  );
}

// ─── Podium Component (Top 3) ───────────────────────────────────────────────────
function PodiumDisplay({ data, currentUserId }: { data: any[]; currentUserId?: string }) {
  const top3 = data.slice(0, 3);
  
  // Reorder for visual display: 2nd, 1st, 3rd
  const positions = [
    { pos: 2, data: top3[1], label: "2nd", emoji: "🥈", colors: "from-gray-300 to-gray-400 text-gray-800", ring: "ring-gray-300", height: "h-24 sm:h-28" },
    { pos: 1, data: top3[0], label: "1st", emoji: "🥇", colors: "from-yellow-300 to-amber-400 text-yellow-900", ring: "ring-yellow-300", height: "h-32 sm:h-36 glow-gold" },
    { pos: 3, data: top3[2], label: "3rd", emoji: "🥉", colors: "from-amber-400 to-orange-500 text-amber-900", ring: "ring-amber-400", height: "h-16 sm:h-20" },
  ];

  return (
    <div className="flex items-end justify-center gap-2 sm:gap-4 py-6 px-2">
      {positions.map(({ pos, data: entry, emoji, colors, ring, height }) => (
        <div key={pos} className="flex flex-col items-center flex-1 max-w-[120px]">
          {/* Avatar & Rank */}
          <div className={`relative mb-2 ${pos === 1 ? 'order-first' : ''}`}>
            <div className={`
              w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-2xl font-bold
              bg-gradient-to-br ${colors} ring-4 ${ring}
              shadow-lg ${entry?.user_id === currentUserId ? 'ring-4 ring-blue-400 ring-offset-2 ring-offset-background' : ''}
              ${pos === 1 ? 'animate-bounce-slow' : ''}
            `}>
              {emoji}
            </div>
            {pos === 1 && (
              <Crown className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 text-yellow-400 drop-shadow-lg animate-pulse" />
            )}
            {pos !== 1 && entry && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-background border-2 border-current flex items-center justify-center text-[10px] font-black"
                   style={{ color: pos === 2 ? '#9ca3af' : '#f59e0b' }}>
                {pos}
              </div>
            )}
          </div>
          
          {/* Name */}
          <p className="text-xs sm:text-sm font-semibold text-center truncate w-full px-1">
            {entry?.full_name || "—"}
          </p>
          
          {/* Points */}
          <p className="text-sm font-bold text-primary">{entry ? (entry.total_points ?? entry.weekly_points ?? 0) : 0} pts</p>
          
          {/* Badges count for extra flair on the podium */}
          {entry?.badges?.length > 0 && (
            <div className="flex items-center gap-1 mt-0.5 text-[10px] text-purple-600 dark:text-purple-400">
              <Award size={10} /> {entry.badges.length}
            </div>
          )}
          
          {/* Streak */}
          {entry?.streak_days > 0 && (
            <div className="flex items-center gap-1 mt-0.5">
              <AnimatedFire size={12} />
              <span className="text-xs text-orange-600 dark:text-orange-400">{entry.streak_days}</span>
            </div>
          )}
          
          {/* Podium Base */}
          <div className={`
            w-full rounded-t-lg bg-gradient-to-t ${colors} flex items-center justify-center
            ${height} mt-2 shadow-md transition-all duration-300 hover:shadow-lg
          `}>
            <span className="text-lg sm:text-xl font-black opacity-80">#{pos}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── My Rank Strip (replaces the old "My Stats" card; no self-evident stats, just a quick rank pointer) ──
function MyRankStrip({ rank, myHouse }: { rank: number | null; myHouse: any }) {
  if (!rank) return null;
  const motivational = getMotivationalMessage(rank);

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-800/30 text-sm">
      <span className={`font-bold ${motivational.color}`}>{motivational.emoji}</span>
      <span className="font-semibold">You're ranked #{rank}</span>
      <span className="text-muted-foreground hidden sm:inline">— {motivational.message}</span>
      {myHouse?.houses && (
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Home className="w-3.5 h-3.5" style={{ color: myHouse.houses.color }} />
          {myHouse.houses.emoji} {myHouse.houses.name}
        </span>
      )}
    </div>
  );
}

// ─── Leaderboard Row ───────────────────────────────────────────────────────────
function LeaderboardRow({ entry, index, isCurrentUser }: { entry: any; index: number; isCurrentUser: boolean }) {
  const rank = index + 1;
  const getRankStyle = () => {
    if (rank === 1) return "bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20 border-l-4 border-yellow-500";
    if (rank === 2) return "bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/20 dark:to-slate-900/20 border-l-4 border-gray-400";
    if (rank === 3) return "bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border-l-4 border-amber-600";
    if (isCurrentUser) return "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-l-4 border-blue-500";
    return "hover:bg-muted/50";
  };

  const getRankBadge = () => {
    if (rank === 1) return <Medal className="w-5 h-5 text-yellow-500 fill-yellow-500" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400 fill-gray-400" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-600 fill-amber-600" />;
    return <span className="text-sm font-mono text-muted-foreground w-5 text-center">{rank}</span>;
  };

  return (
    <div className={`
      flex items-center gap-3 p-3 rounded-xl transition-all duration-200
      ${getRankStyle()}
    `}>
      {/* Rank */}
      <div className="w-8 flex justify-center">{getRankBadge()}</div>
      
      {/* Avatar */}
      <div className={`
        w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm
        ${rank <= 3 ? 'bg-gradient-to-br from-primary to-primary/70 text-white' : 'bg-muted'}
      `}>
        {entry.full_name?.charAt(0)?.toUpperCase() || '?'}
      </div>
      
      {/* Name & Info */}
      <div className="flex-1 min-w-0">
        <p className={`font-semibold truncate ${isCurrentUser ? 'text-primary' : ''}`}>
          {entry.full_name || 'Anonymous'}
          {isCurrentUser && <span className="text-xs ml-1 text-muted-foreground">(you)</span>}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {entry.streak_days > 0 && (
            <span className="flex items-center gap-0.5">
              <Flame size={10} className="text-orange-500 fill-orange-500" />{entry.streak_days}
            </span>
          )}
          <span>{entry.badges?.length || 0} badges</span>
        </div>
      </div>
      
      {/* Points */}
      <div className="text-right">
        <p className="font-bold text-primary">{entry.total_points ?? entry.weekly_points ?? 0}</p>
        <p className="text-xs text-muted-foreground">pts</p>
      </div>
    </div>
  );
}

// ─── Houses Tab Content ─────────────────────────────────────────────────────────
function HousesContent() {
  const { data: houses, isLoading } = useHouses();

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-xl" />)}
      </div>
    );
  }

  if (!houses || houses.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Home className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>No houses set up yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {houses.map((house, i) => (
        <div key={house.id} className="
          flex items-center gap-4 p-4 rounded-xl bg-card border shadow-sm
          hover:shadow-md transition-shadow
        ">
          <div className="flex items-center justify-center w-10 h-10 rounded-full text-2xl shrink-0"
               style={{ backgroundColor: house.color + '20' }}>
            {house.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold truncate">{house.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted shrink-0">#{i + 1}</span>
            </div>
            <p className="text-sm text-muted-foreground">{house.member_count ?? 0} members</p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-lg" style={{ color: house.color }}>{house.total_points.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">points</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Badges Grid ────────────────────────────────────────────────────────────────
const TIER_META: Record<BadgeTier, { label: string; color: string }> = {
  easy:   { label: "Easy",   color: "text-green-600 dark:text-green-400" },
  normal: { label: "Normal", color: "text-blue-600 dark:text-blue-400" },
  hard:   { label: "Hard",   color: "text-red-600 dark:text-red-400" },
};

function BadgesGrid({ earnedBadges }: { earnedBadges: string[] }) {
  const tiers: BadgeTier[] = ["easy", "normal", "hard"];
  return (
    <div className="space-y-6">
      {tiers.map((tier) => {
        const tierBadges = BADGES.filter((b) => b.tier === tier);
        const earnedCount = tierBadges.filter((b) => earnedBadges.includes(b.id)).length;
        return (
          <div key={tier}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className={`text-sm font-bold ${TIER_META[tier].color}`}>{TIER_META[tier].label}</span>
              <span className="text-xs text-muted-foreground">{earnedCount}/{tierBadges.length} earned</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {tierBadges.map((badge) => {
                const earned = earnedBadges.includes(badge.id);
                return (
                  <div key={badge.id} className={`
                    relative p-4 rounded-xl border text-center transition-all duration-300
                    ${earned 
                      ? 'bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/30 border-yellow-200 dark:border-yellow-800 shadow-md' 
                      : 'bg-muted/50 border-border opacity-60 grayscale'
                    }
                    hover:scale-105 hover:shadow-lg
                  `}>
                    {!earned && (
                      <Lock className="absolute top-2 right-2 w-4 h-4 text-muted-foreground" />
                    )}
                    <div className={`text-3xl mb-2 ${!earned && 'grayscale opacity-50'}`}>
                      {badge.emoji}
                    </div>
                    <p className={`font-semibold text-sm ${earned ? '' : 'text-muted-foreground'}`}>
                      {badge.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {badge.desc}
                    </p>
                    {earned && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main NotesLeaderboard Component ────────────────────────────────────────────
export default function NotesLeaderboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<LeaderboardTab>("weekly");
  
  const { data: weeklyData, isLoading: weeklyLoading } = useWeeklyLeaderboard();
  const { data: allTimeData, isLoading: allTimeLoading } = useLeaderboard();
  const { data: gamification } = useGamification(user?.id);
  const { data: myHouse } = useMyHouse(user?.id);

  const isLoading = activeTab === "weekly" ? weeklyLoading : allTimeLoading;
  const currentData = activeTab === "weekly" ? weeklyData : allTimeData;
  const myRank = getRankOf(currentData, user?.id);

  const tabs: { id: LeaderboardTab; label: string; icon: React.ReactNode }[] = [
    { id: "weekly", label: "Weekly", icon: <Calendar className="w-4 h-4" /> },
    { id: "alltime", label: "All Time", icon: <Trophy className="w-4 h-4" /> },
    { id: "houses", label: "Houses", icon: <Home className="w-4 h-4" /> },
    { id: "badges", label: "My Badges", icon: <Gem className="w-4 h-4" /> },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-yellow-100 to-amber-100 
                        dark:from-yellow-900/30 dark:to-amber-900/30 rounded-full">
          <Trophy className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          <span className="font-bold text-yellow-800 dark:text-yellow-200">Notes Leaderboard</span>
        </div>
        <p className="text-sm text-muted-foreground">Compete with classmates and earn rewards!</p>
      </div>

      {/* My Rank quick strip (only for weekly/alltime tabs where rank applies) */}
      {(activeTab === "weekly" || activeTab === "alltime") && (
        <MyRankStrip rank={myRank} myHouse={myHouse} />
      )}

      {/* Tab Navigation */}
      <div className="flex flex-wrap justify-center gap-2 p-1 bg-muted/50 rounded-xl">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
              transition-all duration-200
              ${activeTab === tab.id 
                ? 'bg-primary text-primary-foreground shadow-md' 
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
              }
            `}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[300px]">
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded-xl" />
            ))}
          </div>
        ) : activeTab === "houses" ? (
          <HousesContent />
        ) : activeTab === "badges" ? (
          <BadgesGrid earnedBadges={gamification?.badges || []} />
        ) : (
          <>
            {/* Top 3 Podium */}
            {currentData && currentData.length >= 3 && (
              <PodiumDisplay data={currentData} currentUserId={user?.id} />
            )}

            {/* Full Leaderboard List — every ranked student, from #1 down, starting the moment they earn a single point */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {(currentData || []).map((entry, index) => (
                <LeaderboardRow 
                  key={entry.user_id} 
                  entry={entry} 
                  index={index} 
                  isCurrentUser={entry.user_id === user?.id}
                />
              ))}
              
              {(!currentData || currentData.length === 0) && (
                <div className="text-center py-12 text-muted-foreground">
                  <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No one has earned points yet. Be the first — start studying now!</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Custom Styles */}
      <style>{`
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        .animate-bounce-slow {
          animation: bounce-slow 2s ease-in-out infinite;
        }
        .glow-gold {
          box-shadow: 0 0 20px rgba(234, 179, 8, 0.4), 0 0 40px rgba(234, 179, 8, 0.2);
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: hsl(var(--muted));
          border-radius: 3px;
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
