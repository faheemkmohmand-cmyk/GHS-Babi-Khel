// src/pages/dashboard/tabs/ExtraTab.tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Telescope, Globe, Orbit } from "lucide-react";
import NASASpacePic from "./NASASpacePic";
import WorldExplorer from "./WorldExplorer";
import SolarSystem from "./SolarSystem";

const ExtraTab = () => (
  <div className="space-y-4">
    <div>
      <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
        ✨ Extra
      </h2>
      <p className="text-sm text-muted-foreground mt-0.5">
        World Explorer · Space science · NASA photos · Solar System Live
      </p>
    </div>

    <Tabs defaultValue="world" className="w-full">
      <TabsList className="flex w-full overflow-x-auto gap-1 h-auto p-1 justify-start">
        <TabsTrigger value="world" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
          <Globe className="w-3.5 h-3.5" />
          <span>World Explorer</span>
        </TabsTrigger>
        <TabsTrigger value="solar" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
          <Orbit className="w-3.5 h-3.5" />
          <span>Solar System</span>
        </TabsTrigger>
        <TabsTrigger value="nasa" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
          <Telescope className="w-3.5 h-3.5" />
          <span>Space Picture</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="world" className="mt-4">
        <WorldExplorer />
      </TabsContent>
      <TabsContent value="solar" className="mt-4">
        <SolarSystem />
      </TabsContent>
      <TabsContent value="nasa" className="mt-4">
        <NASASpacePic />
      </TabsContent>
    </Tabs>
  </div>
);

export default ExtraTab;
