// Combined Results hub: Results + Exam Rolls
// (Result Card was previously a third tab in this horizontal scroll, but it
// caused crowding on small screens. It's now accessed via an orange
// "Result Card" button inside ResultsTab itself — see ResultsTab.tsx.)
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, Hash } from "lucide-react";
import ResultsTab from "./ResultsTab";
import RollNumbersTab from "./RollNumbersTab";

const ResultsHubTab = ({ onNavigate }: { onNavigate?: (tab: string) => void }) => (
  <div className="space-y-4">
    <div>
      <h2 className="text-xl font-heading font-bold text-foreground">Results</h2>
      <p className="text-sm text-muted-foreground mt-0.5">Results and roll numbers</p>
    </div>
    <Tabs defaultValue="results" className="w-full">
      <TabsList className="flex w-full gap-1 h-auto p-1">
        <TabsTrigger value="results" className="flex-1 gap-1.5 text-xs sm:text-sm px-3 py-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-md bg-blue-100 dark:bg-blue-900/40 shrink-0">
            <BarChart3 className="w-3 h-3 text-blue-500" />
          </span><span>Results</span>
        </TabsTrigger>
        <TabsTrigger value="rolls" className="flex-1 gap-1.5 text-xs sm:text-sm px-3 py-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-md bg-indigo-100 dark:bg-indigo-900/40 shrink-0">
            <Hash className="w-3 h-3 text-indigo-500" />
          </span><span>Roll Numbers</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="results" className="mt-4"><ResultsTab /></TabsContent>
      <TabsContent value="rolls" className="mt-4"><RollNumbersTab /></TabsContent>
    </Tabs>
  </div>
);

export default ResultsHubTab;
