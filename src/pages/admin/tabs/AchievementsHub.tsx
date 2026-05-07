import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, TrendingUp } from "lucide-react";
import AdminAchievements from "./AdminAchievements";
import AdminMeritList from "./AdminMeritList";

const AchievementsHub = () => (
  <div className="space-y-4">
    <div>
      <h2 className="text-xl font-heading font-bold text-foreground">Achievements</h2>
      <p className="text-sm text-muted-foreground mt-0.5">Manage student achievements and merit list</p>
    </div>
    <Tabs defaultValue="achievements" className="w-full">
      <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:inline-flex">
        <TabsTrigger value="achievements" className="gap-1.5 text-xs sm:text-sm">
          <Trophy className="w-3.5 h-3.5" /> Achievements
        </TabsTrigger>
        <TabsTrigger value="merit-list" className="gap-1.5 text-xs sm:text-sm">
          <TrendingUp className="w-3.5 h-3.5" /> Merit List
        </TabsTrigger>
      </TabsList>
      <TabsContent value="achievements" className="mt-4">
        <AdminAchievements />
      </TabsContent>
      <TabsContent value="merit-list" className="mt-4">
        <AdminMeritList />
      </TabsContent>
    </Tabs>
  </div>
);

export default AchievementsHub;
