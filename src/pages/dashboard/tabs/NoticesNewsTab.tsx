// Combined Notices + News tab for User Dashboard
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Bell, Newspaper } from "lucide-react";
import NoticesTab from "./NoticesTab";
import NewsTab from "./NewsTab";

const NoticesNewsTab = () => (
  <div className="space-y-4">
    <div>
      <h2 className="text-xl font-heading font-bold text-foreground">Notices & News</h2>
      <p className="text-sm text-muted-foreground mt-0.5">School announcements and latest news</p>
    </div>
    <Tabs defaultValue="notices" className="w-full">
      <TabsList className="w-full grid grid-cols-2 sm:inline-flex sm:w-auto">
        <TabsTrigger value="notices" className="gap-1.5 text-xs sm:text-sm">
          <span className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-100 dark:bg-amber-900/40 shrink-0">
            <Bell className="w-3 h-3 text-amber-500" />
          </span><span>Notices</span>
        </TabsTrigger>
        <TabsTrigger value="news" className="gap-1.5 text-xs sm:text-sm">
          <span className="flex items-center justify-center w-5 h-5 rounded-md bg-sky-100 dark:bg-sky-900/40 shrink-0">
            <Newspaper className="w-3 h-3 text-sky-500" />
          </span><span>News</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="notices" className="mt-4"><NoticesTab /></TabsContent>
      <TabsContent value="news" className="mt-4"><NewsTab /></TabsContent>
    </Tabs>
  </div>
);

export default NoticesNewsTab;
