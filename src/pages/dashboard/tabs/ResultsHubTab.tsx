// Combined Results hub: Results + Exam Rolls + Result Card
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, Hash, FileText } from "lucide-react";
import ResultsTab from "./ResultsTab";
import RollNumbersTab from "./RollNumbersTab";
import ResultCardTab from "./ResultCardTab";

const ResultsHubTab = ({ onNavigate }: { onNavigate?: (tab: string) => void }) => (
  <div className="space-y-4">
    <div>
      <h2 className="text-xl font-heading font-bold text-foreground">Results</h2>
      <p className="text-sm text-muted-foreground mt-0.5">Results, roll numbers and result cards</p>
    </div>
    <Tabs defaultValue="card" className="w-full">
      <TabsList className="flex w-full overflow-x-auto gap-1 h-auto p-1 justify-start">
        <TabsTrigger value="results" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-md bg-blue-100 dark:bg-blue-900/40 shrink-0">
            <BarChart3 className="w-3 h-3 text-blue-500" />
          </span><span>Results</span>
        </TabsTrigger>
        <TabsTrigger value="rolls" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-md bg-indigo-100 dark:bg-indigo-900/40 shrink-0">
            <Hash className="w-3 h-3 text-indigo-500" />
          </span><span>Roll Numbers</span>
        </TabsTrigger>
        <TabsTrigger value="card" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 shrink-0">
            <FileText className="w-3 h-3 text-emerald-500" />
          </span><span>Result Card</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="results" className="mt-4"><ResultsTab /></TabsContent>
      <TabsContent value="rolls" className="mt-4"><RollNumbersTab /></TabsContent>
      <TabsContent value="card" className="mt-4"><ResultCardTab /></TabsContent>
    </Tabs>
  </div>
);

export default ResultsHubTab;
