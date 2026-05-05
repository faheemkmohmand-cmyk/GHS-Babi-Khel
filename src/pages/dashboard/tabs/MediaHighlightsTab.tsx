// Combined Media & Highlights: Gallery + Videos + Achievements + Honor Roll
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Image, Video, Trophy, Star } from "lucide-react";
import GalleryTab from "./GalleryTab";
import VideosTab from "./VideosTab";
import AchievementsTab from "./AchievementsTab";
import HonorRollTab from "./HonorRollTab";

const MediaHighlightsTab = () => (
  <div className="space-y-4">
    <div>
      <h2 className="text-xl font-heading font-bold text-foreground">Media & Highlights</h2>
      <p className="text-sm text-muted-foreground mt-0.5">Gallery, videos, achievements and honor roll</p>
    </div>
    <Tabs defaultValue="gallery" className="w-full">
      <TabsList className="flex w-full overflow-x-auto gap-1 h-auto p-1 justify-start">
        <TabsTrigger value="gallery" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
          <Image className="w-3.5 h-3.5" /><span>Gallery</span>
        </TabsTrigger>
        <TabsTrigger value="videos" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
          <Video className="w-3.5 h-3.5" /><span>Videos</span>
        </TabsTrigger>
        <TabsTrigger value="achievements" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
          <Trophy className="w-3.5 h-3.5" /><span>Achievements</span>
        </TabsTrigger>
        <TabsTrigger value="honor" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
          <Star className="w-3.5 h-3.5" /><span>Honor Roll</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="gallery" className="mt-4"><GalleryTab /></TabsContent>
      <TabsContent value="videos" className="mt-4"><VideosTab /></TabsContent>
      <TabsContent value="achievements" className="mt-4"><AchievementsTab /></TabsContent>
      <TabsContent value="honor" className="mt-4"><HonorRollTab /></TabsContent>
    </Tabs>
  </div>
);

export default MediaHighlightsTab;
