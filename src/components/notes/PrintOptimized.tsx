import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sanitizeChapterHTML } from "@/components/notes/KaTeXRenderer";

interface PrintOptimizedProps {
  chapter: {
    title: string;
    content?: string;
  };
  subject: {
    name: string;
  };
  schoolName: string;
  onClose: () => void;
}

const PrintOptimized = ({ chapter, subject, schoolName, onClose }: PrintOptimizedProps) => {
  const handlePrint = () => {
    setTimeout(() => {
      window.print();
    }, 100);
  };

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-950 overflow-auto print:bg-white print:text-black print:z-auto">
      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .print-content { page-break-inside: avoid; }
          h1, h2, h3 { page-break-after: avoid; }
          p { orphans: 2; widows: 2; }
        }
      `}</style>

      <div className="no-print sticky top-0 bg-white dark:bg-card border-b border-border p-4 flex items-center justify-between gap-4 z-50">
        <h2 className="font-bold text-foreground">{chapter.title}</h2>
        <div className="flex gap-2">
          <Button onClick={handlePrint} variant="default" size="sm">
            Print Now
          </Button>
          <Button onClick={onClose} variant="ghost" size="icon">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="print-content max-w-4xl mx-auto px-6 md:px-8 py-8">
        <div className="mb-8 pb-8 border-b border-zinc-300 print:border-black">
          <h1 className="text-4xl font-black text-foreground print:text-black mb-2">{chapter.title}</h1>
          <p className="text-lg text-muted-foreground print:text-zinc-700">{subject.name}</p>
        </div>

        <div className="prose prose-base max-w-none dark:prose-invert print:prose-invert print:text-black">
          {chapter.content ? (
            <div dangerouslySetInnerHTML={{ __html: sanitizeChapterHTML(chapter.content) }} />
          ) : (
            <p className="text-muted-foreground">No content available</p>
          )}
        </div>

        <div className="mt-12 pt-8 border-t border-zinc-300 print:border-black text-xs text-muted-foreground print:text-zinc-600">
          <p className="font-semibold">{schoolName}</p>
          <p>{chapter.title}</p>
          <p className="text-[10px] mt-2">Printed on {new Date().toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  );
};

export default PrintOptimized;
