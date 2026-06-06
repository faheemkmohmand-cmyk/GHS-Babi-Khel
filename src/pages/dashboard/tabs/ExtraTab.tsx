// src/pages/dashboard/tabs/ExtraTab.tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Satellite, Telescope, Hash, Globe } from "lucide-react";
import ISSTracker from "./ISSTracker";
import NASASpacePic from "./NASASpacePic";
import NumberFacts from "./NumberFacts";
import WorldExplorer from "./WorldExplorer";

const ExtraTab = () => (
  <div className="space-y-4">
    <div>
      <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
        ✨ Extra
      </h2>
      <p className="text-sm text-muted-foreground mt-0.5">
        World Explorer · Space science · ISS tracker · NASA photos · Number facts
      </p>
    </div>

    <Tabs defaultValue="world" className="w-full">
      <TabsList className="flex w-full overflow-x-auto gap-1 h-auto p-1 justify-start">
        <TabsTrigger value="world" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
          <Globe className="w-3.5 h-3.5" />
          <span>World Explorer</span>
        </TabsTrigger>
        <TabsTrigger value="iss" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
          <Satellite className="w-3.5 h-3.5" />
          <span>ISS Tracker</span>
        </TabsTrigger>
        <TabsTrigger value="nasa" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
          <Telescope className="w-3.5 h-3.5" />
          <span>Space Picture</span>
        </TabsTrigger>
        <TabsTrigger value="numbers" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
          <Hash className="w-3.5 h-3.5" />
          <span>Number Facts</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="world" className="mt-4">
        <WorldExplorer />
      </TabsContent>
      <TabsContent value="iss" className="mt-4">
        <ISSTracker />
      </TabsContent>
      <TabsContent value="nasa" className="mt-4">
        <NASASpacePic />
      </TabsContent>
      <TabsContent value="numbers" className="mt-4">
        <NumberFacts />
      </TabsContent>
    </Tabs>
  </div>
);

export default ExtraTab;
