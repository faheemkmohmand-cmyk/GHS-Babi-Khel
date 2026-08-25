// Exam Roll Numbers hub.
// (Results was removed from the user dashboard — it's already available via
// the homepage Navbar, so this section now only shows Exam Roll Numbers.
// Result Card / full Results tab used to live here — see git history /
// ResultsTab.tsx if it needs to be restored.)
import RollNumbersTab from "./RollNumbersTab";

const ResultsHubTab = ({ onNavigate }: { onNavigate?: (tab: string) => void }) => (
  <div className="space-y-4">
    <div>
      <h2 className="text-xl font-heading font-bold text-foreground">Exam Roll Numbers</h2>
      <p className="text-sm text-muted-foreground mt-0.5">Find your exam roll number</p>
    </div>
    <RollNumbersTab />
  </div>
);

export default ResultsHubTab;
