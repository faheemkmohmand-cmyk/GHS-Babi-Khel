import { Trophy } from "lucide-react";
import { useAchievements } from "@/hooks/useAchievements";
import { Skeleton } from "@/components/ui/skeleton";

const AchievementsTab = () => {
  const { data: achievements = [], isLoading } = useAchievements();

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : achievements.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl shadow-card">
          <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">No achievements recorded yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {achievements.map((a) => (
            <div key={a.id} className="bg-card rounded-xl p-5 shadow-card">
              <div className="w-10 h-10 rounded-lg bg-warning/15 flex items-center justify-center mb-3">
                <Trophy className="w-5 h-5 text-warning" />
              </div>
              <h3 className="font-semibold text-foreground text-sm">{a.title}</h3>
              {a.student_name && (
                <p className="text-xs text-primary font-medium mt-1">
                  {a.student_name} {a.class && `· Class ${a.class}`}
                </p>
              )}
              {a.description && <p className="text-xs text-muted-foreground mt-1.5">{a.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AchievementsTab;
