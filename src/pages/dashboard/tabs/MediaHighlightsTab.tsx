// Combined Media & Highlights: Achievements + Honor Roll
//
// FIXED (per request): "Videos" sub-tab removed from here previously.
// "Gallery" sub-tab removed too — gallery/media is already available via
// the homepage Navbar, so a duplicate copy inside the dashboard's Media
// tab wasn't needed. This tab is now Achievements + Honor Roll only.
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trophy, Star } from "lucide-react";
import AchievementsTab from "./AchievementsTab";
import HonorRollTab from "./HonorRollTab";

const MediaHighlightsTab = () => (
  <div className="space-y-4">
    <div>
      <h2 className="text-xl font-heading font-bold text-foreground">Media & Highlights</h2>
      <p className="text-sm text-muted-foreground mt-0.5">Achievements and honor roll</p>
    </div>
    <Tabs defaultValue="achievements" className="w-full">
      <TabsList className="flex w-full overflow-x-auto gap-1 h-auto p-1 justify-start">
        <TabsTrigger value="achievements" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
          <Trophy className="w-3.5 h-3.5" /><span>Achievements</span>
        </TabsTrigger>
        <TabsTrigger value="honor" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
          <Star className="w-3.5 h-3.5" /><span>Honor Roll</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="achievements" className="mt-4"><AchievementsTab /></TabsContent>
      <TabsContent value="honor" className="mt-4"><HonorRollTab /></TabsContent>
    </Tabs>
  </div>
);

export default MediaHighlightsTab;
