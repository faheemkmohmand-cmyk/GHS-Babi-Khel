import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookMarked, ClipboardCheck, Sparkles } from "lucide-react";
import NotesTab from "@/pages/notes/NotesTab";
import TestsTab from "./TestsTab";
import DailyQuizTab from "./DailyQuizTab";

const NotesHub = () => (
  <div className="space-y-4">
    <div>
      <h2 className="text-xl font-heading font-bold text-foreground">Notes Manager</h2>
      <p className="text-sm text-muted-foreground mt-0.5">Study notes, MCQ practice tests, and your daily quiz</p>
    </div>
    <Tabs defaultValue="notes" className="w-full">
      <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex">
        <TabsTrigger value="notes" className="gap-1.5 text-xs sm:text-sm">
          <BookMarked className="w-3.5 h-3.5" /> Study Notes
        </TabsTrigger>
        <TabsTrigger value="tests" className="gap-1.5 text-xs sm:text-sm">
          <ClipboardCheck className="w-3.5 h-3.5" /> MCQ Tests
        </TabsTrigger>
        <TabsTrigger value="daily" className="gap-1.5 text-xs sm:text-sm">
          <Sparkles className="w-3.5 h-3.5" /> Daily Quiz
        </TabsTrigger>
      </TabsList>
      <TabsContent value="notes" className="mt-4">
        <NotesTab />
      </TabsContent>
      <TabsContent value="tests" className="mt-4">
        <TestsTab />
      </TabsContent>
      <TabsContent value="daily" className="mt-4">
        <DailyQuizTab />
      </TabsContent>
    </Tabs>
  </div>
);

export default NotesHub;
