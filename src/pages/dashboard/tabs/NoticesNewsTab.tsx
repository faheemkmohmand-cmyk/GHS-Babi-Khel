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
          <Bell className="w-3.5 h-3.5" /><span>Notices</span>
        </TabsTrigger>
        <TabsTrigger value="news" className="gap-1.5 text-xs sm:text-sm">
          <Newspaper className="w-3.5 h-3.5" /><span>News</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="notices" className="mt-4"><NoticesTab /></TabsContent>
      <TabsContent value="news" className="mt-4"><NewsTab /></TabsContent>
    </Tabs>
  </div>
);

export default NoticesNewsTab;
