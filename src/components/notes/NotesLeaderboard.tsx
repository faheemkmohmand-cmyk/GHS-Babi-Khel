import { useState } from "react";
import { useWeeklyLeaderboard, useLeaderboard, useGamification, useMyHouse, BADGES } from "@/hooks/useNotes";
import { useAuth } from "@/hooks/useAuth";
import { 
  Trophy, Medal, Star, Flame, Crown, Zap, Target, BookOpen, Award, Home, Users,
  ChevronDown, ChevronUp, Lock, TrendingUp, Calendar, Gem
} from "lucide-react";

type LeaderboardTab = "weekly" | "alltime" | "houses" | "badges";

// ─── Motivational Messages ──────────────────────────────────────────────────────
function getMotivationalMessage(rank: number): { emoji: string; message: string; color: string } {
  if (rank === 1) return { emoji: "👑", message: "You're the Champion!", color: "text-yellow-500" };
  if (rank === 2) return { emoji: "🥈", message: "So close to the top!", color: "text-gray-400" };
  if (rank === 3) return { emoji: "🥉", message: "You're on the podium!", color: "text-amber-600" };
  if (rank <= 10) return { emoji: "🔥", message: "You're in the elite!", color: "text-orange-500" };
  if (rank <= 25) return { emoji: "⭐", message: "Great progress! Keep going!", color: "text-blue-500" };
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
    { pos: 2, data: top3[1], label: "2nd", emoji: "🥈", colors: "from-gray-300 to-gray-400 text-gray-800", height: "h-28" },
    { pos: 1, data: top3[0], label: "1st", emoji: "🥇", colors: "from-yellow-300 to-amber-400 text-yellow-900", height: "h-36 glow-gold" },
    { pos: 3, data: top3[2], label: "3rd", emoji: "🥉", colors: "from-amber-400 to-orange-500 text-amber-900", height: "h-20" },
  ];

  return (
    <div className="flex items-end justify-center gap-2 sm:gap-4 py-6 px-2">
      {positions.map(({ pos, data: entry, label, emoji, colors, height }) => (
        <div key={pos} className="flex flex-col items-center flex-1 max-w-[120px]">
          {/* Avatar & Rank */}
          <div className={`relative mb-2 ${pos === 1 ? 'order-first' : ''}`}>
            <div className={`
              w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-2xl font-bold
              bg-gradient-to-br ${colors}
              shadow-lg ${entry?.user_id === currentUserId ? 'ring-4 ring-blue-400 ring-offset-2 ring-offset-background' : ''}
              ${pos === 1 ? 'animate-bounce-slow' : ''}
            `}>
              {emoji}
            </div>
            {pos === 1 && (
              <Crown className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 text-yellow-400 drop-shadow-lg animate-pulse" />
            )}
          </div>
          
          {/* Name */}
          <p className="text-xs sm:text-sm font-semibold text-center truncate w-full px-1">
            {entry?.full_name || `Player ${pos}`}
          </p>
          
          {/* Points */}
          <p className="text-sm font-bold text-primary">{entry?.total_points || entry?.weekly_points || 0} pts</p>
          
          {/* Streak */}
          {entry?.streak_days > 0 && (
            <div className="flex items-center gap-1 mt-1">
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

// ─── My Stats Card ─────────────────────────────────────────────────────────────
function MyStatsCard({ gamification, myHouse }: { gamification: any; myHouse: any }) {
  const [expanded, setExpanded] = useState(false);
  
  if (!gamification) return null;
  
  const rank = 1; // Would be calculated from leaderboard position
  const motivational = getMotivationalMessage(rank);

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950/40 dark:to-indigo-950/40 
                    rounded-2xl p-4 sm:p-5 border border-blue-200/50 dark:border-blue-800/30 
                    shadow-lg relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute -right-8 -top-8 w-32 h-32 bg-blue-200/20 dark:bg-blue-800/20 rounded-full blur-2xl" />
      
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 
                          flex items-center justify-center shadow-lg">
            <Trophy className="w-6 h-6 text-white" />
          </div>
          <div className="text-left">
            <p className="font-bold text-lg text-gray-800 dark:text-gray-100">My Stats</p>
            <p className={`text-sm font-medium ${motivational.color}`}>
              {motivational.emoji} {motivational.message}
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
      </button>

      <AnimateExpand expanded={expanded}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <StatCard icon={<Star className="w-5 h-5 text-yellow-500" />} 
                    label="Total Points" value={gamification.total_points} color="yellow" />
          <StatCard icon={<AnimatedFire size={20} />} 
                    label="Day Streak" value={`${gamification.streak_days} days`} color="orange" />
          <StatCard icon={<Award className="w-5 h-5 text-purple-500" />} 
                    label="Badges" value={`${gamification.badges?.length || 0}/${BADGES.length}`} color="purple" />
          <StatCard icon={<TrendingUp className="w-5 h-5 text-green-500" />} 
                    label="Rank" value={`#${rank}`} color="green" />
        </div>
        
        {myHouse?.houses && (
          <div className="mt-3 flex items-center gap-2 p-2 bg-white/50 dark:bg-white/5 rounded-lg">
            <Home className="w-4 h-4" style={{ color: myHouse.houses.color }} />
            <span className="text-sm font-medium">{myHouse.houses.emoji} {myHouse.houses.name}</span>
            <span className="ml-auto text-xs text-muted-foreground">{myHouse.houses.total_points} house pts</span>
          </div>
        )}
      </AnimateExpand>
    </div>
  );
}

// ─── Stat Card Helper ──────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    yellow: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-300" },
    orange: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-300" },
    purple: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300" },
    green: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300" },
  };
  const c = colorMap[color] || colorMap.yellow;
  
  return (
    <div className={`${c.bg} rounded-xl p-3 text-center`}>
      <div className="flex justify-center mb-1">{icon}</div>
      <p className={`text-lg font-bold ${c.text}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// ─── Animate Expand Wrapper ─────────────────────────────────────────────────────
function AnimateExpand({ children, expanded }: { children: React.ReactNode; expanded: boolean }) {
  return (
    <div className={`
      grid transition-all duration-300 ease-in-out
      ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}
    `}>
      <div className="overflow-hidden">{children}</div>
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
        <p className="font-bold text-primary">{entry.total_points || entry.weekly_points}</p>
        <p className="text-xs text-muted-foreground">pts</p>
      </div>
    </div>
  );
}

// ─── Houses Tab Content ─────────────────────────────────────────────────────────
function HousesContent() {
  // This would use useHouses hook in a real implementation
  const mockHouses = [
    { name: "Gryffindor", emoji: "🦁", color: "#dc2626", total_points: 4500, member_count: 25 },
    { name: "Ravenclaw", emoji: "🦅", color: "#2563eb", total_points: 4200, member_count: 23 },
    { name: "Hufflepuff", emoji: "🦡", color: "#ca8a04", total_points: 3800, member_count: 24 },
    { name: "Slytherin", emoji: "🐍", color: "#059669", total_points: 3500, member_count: 22 },
  ];

  return (
    <div className="space-y-3">
      {mockHouses.map((house, i) => (
        <div key={house.name} className="
          flex items-center gap-4 p-4 rounded-xl bg-card border shadow-sm
          hover:shadow-md transition-shadow
        ">
          <div className="flex items-center justify-center w-10 h-10 rounded-full text-2xl"
               style={{ backgroundColor: house.color + '20' }}>
            {house.emoji}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{house.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted">#{i + 1}</span>
            </div>
            <p className="text-sm text-muted-foreground">{house.member_count} members</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-lg" style={{ color: house.color }}>{house.total_points.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">points</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Badges Grid ────────────────────────────────────────────────────────────────
function BadgesGrid({ earnedBadges }: { earnedBadges: string[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {BADGES.map((badge) => {
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

      {/* My Stats Card */}
      <MyStatsCard gamification={gamification} myHouse={myHouse} />

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

            {/* Full Leaderboard List */}
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
                  <p>No data yet. Start studying to appear on the leaderboard!</p>
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
