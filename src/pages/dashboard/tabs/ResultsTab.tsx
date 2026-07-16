// The Results tab now shows only the Roll No search interface (see
// ResultCardTab.tsx). The previous class-wise results table, exam
// sub-tabs, and the orange "Result Card" button have been removed —
// searching by exam roll number is the single, direct way to view a
// result here.
import ResultCardTab from "./ResultCardTab";

const ResultsTab = () => <ResultCardTab />;

export default ResultsTab;
