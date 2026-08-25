import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookMarked, ClipboardCheck } from "lucide-react";
import NotesTab from "@/pages/notes/NotesTab";
import TestsTab from "./TestsTab";

const NotesHub = () => (
  <div className="space-y-4">
    <div>
      <h2 className="text-xl font-heading font-bold text-foreground">Notes Manager</h2>
      <p className="text-sm text-muted-foreground mt-0.5">Study notes and MCQ practice tests</p>
    </div>
    <Tabs defaultValue="notes" className="w-full">
      <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:inline-flex">
        <TabsTrigger value="notes" className="gap-1.5 text-xs sm:text-sm">
          <BookMarked className="w-3.5 h-3.5" /> Study Notes
        </TabsTrigger>
        <TabsTrigger value="tests" className="gap-1.5 text-xs sm:text-sm">
          <ClipboardCheck className="w-3.5 h-3.5" /> MCQ Tests
        </TabsTrigger>
      </TabsList>
      <TabsContent value="notes" className="mt-4">
        <NotesTab />
      </TabsContent>
      <TabsContent value="tests" className="mt-4">
        <TestsTab />
      </TabsContent>
    </Tabs>
  </div>
);

export default NotesHub;
