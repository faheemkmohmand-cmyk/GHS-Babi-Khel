// Combined Media & Highlights: Gallery + Achievements + Honor Roll
//
// FIXED (per request): "Videos" sub-tab removed from here. Videos now live
// only in the Navbar's merged Library page (Files + Videos), so having a
// second, separate Videos view inside the dashboard's Media tab was
// duplicate/dead-end content. This tab is now Gallery + Achievements +
// Honor Roll only.
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Image, Trophy, Star } from "lucide-react";
import GalleryTab from "./GalleryTab";
import AchievementsTab from "./AchievementsTab";
import HonorRollTab from "./HonorRollTab";

const MediaHighlightsTab = () => (
  <div className="space-y-4">
    <div>
      <h2 className="text-xl font-heading font-bold text-foreground">Media & Highlights</h2>
      <p className="text-sm text-muted-foreground mt-0.5">Gallery, achievements and honor roll</p>
    </div>
    <Tabs defaultValue="gallery" className="w-full">
      <TabsList className="flex w-full overflow-x-auto gap-1 h-auto p-1 justify-start">
        <TabsTrigger value="gallery" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
          <Image className="w-3.5 h-3.5" /><span>Gallery</span>
        </TabsTrigger>
        <TabsTrigger value="achievements" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
          <Trophy className="w-3.5 h-3.5" /><span>Achievements</span>
        </TabsTrigger>
        <TabsTrigger value="honor" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
          <Star className="w-3.5 h-3.5" /><span>Honor Roll</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="gallery" className="mt-4"><GalleryTab /></TabsContent>
      <TabsContent value="achievements" className="mt-4"><AchievementsTab /></TabsContent>
      <TabsContent value="honor" className="mt-4"><HonorRollTab /></TabsContent>
    </Tabs>
  </div>
);

export default MediaHighlightsTab;
