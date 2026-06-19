/**
 * ConceptMap.tsx
 * Auto-generate a mind map from a chapter's content using markmap.
 * Teachers don't need to do anything — we parse the HTML headings
 * and convert to a Markdown tree, then render as an interactive SVG.
 *
 * Usage: <ConceptMap subjectColor="#3b82f6" chapterTitle="Quadratic Equations" content="<h2>...</h2>..." />
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { Network, Loader2 } from "lucide-react";

// Convert HTML content with h1-h4 + lists into a Markdown tree suitable for markmap
function htmlToMarkmap(html: string, fallbackTitle: string): string {
  if (!html || !html.trim()) {
    return `# ${fallbackTitle}`;
  }
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,noscript,iframe,svg,img,table").forEach((el) => el.remove());

    const lines: string[] = [`# ${fallbackTitle}`];
    const walk = (node: Element, depth: number) => {
      for (const child of Array.from(node.children)) {
        const tag = child.tagName.toLowerCase();
        const text = (child.textContent || "").trim().replace(/\s+/g, " ");
        if (!text) continue;
        if (tag.match(/^h([1-4])$/)) {
          const level = parseInt(tag.slice(1));
          const mdLevel = "#".repeat(Math.min(level + 1, 6));
          lines.push(`${mdLevel} ${text}`);
        } else if (tag === "li") {
          lines.push(`${"  ".repeat(depth)}- ${text}`);
        } else if (tag === "p" && text.length < 100) {
          // short paragraphs become leaf nodes at current depth
          lines.push(`${"  ".repeat(depth)}- ${text}`);
        } else if (["ul", "ol", "div", "section", "article", "main"].includes(tag)) {
          walk(child, depth);
        }
      }
    };
    walk(doc.body, 1);
    const result = lines.join("\n");
    return result || `# ${fallbackTitle}`;
  } catch {
    return `# ${fallbackTitle}`;
  }
}

export default function ConceptMap({
  subjectColor = "#3b82f6",
  chapterTitle = "Chapter",
  content = "",
}: {
  subjectColor?: string;
  chapterTitle?: string;
  content?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const markdown = useMemo(() => htmlToMarkmap(content, chapterTitle), [content, chapterTitle]);

  useEffect(() => {
    let mounted = true;
    let mm: any = null;

    (async () => {
      if (collapsed) return;
      try {
        setLoading(true);
        const [{ Transformer }, { Markmap }] = await Promise.all([
          import("markmap-lib"),
          import("markmap-view"),
        ]);
        if (!mounted || !svgRef.current) return;

        const transformer = new Transformer();
        const { root } = transformer.transform(markdown);

        // Destroy previous instance if exists
        if ((svgRef.current as any).__markmap) {
          (svgRef.current as any).__markmap.destroy();
        }

        mm = Markmap.create(svgRef.current, {
          maxWidth: 280,
          duration: 300,
          spacingHorizontal: 60,
          spacingVertical: 12,
          paddingX: 8,
          autoFit: true,
          color: () => subjectColor,
        }, root);
        (svgRef.current as any).__markmap = mm;
        setLoading(false);
      } catch (e: any) {
        console.error("ConceptMap error:", e);
        setError(e?.message || "Failed to render");
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      if (mm && mm.destroy) {
        try { mm.destroy(); } catch { /* noop */ }
      }
    };
  }, [markdown, collapsed, subjectColor]);

  if (collapsed) {
    return (
      <div className="rounded-2xl border border-border bg-card p-3">
        <button
          onClick={() => setCollapsed(false)}
          className="w-full flex items-center gap-2 text-sm font-bold text-foreground"
        >
          <Network className="w-4 h-4" style={{ color: subjectColor }} />
          Show Concept Map
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 p-3 border-b border-border bg-secondary/30">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: subjectColor + "20" }}>
          <Network className="w-4 h-4" style={{ color: subjectColor }} />
        </div>
        <span className="font-bold text-sm text-foreground">Concept Map</span>
        <span className="ml-auto text-[10px] text-muted-foreground hidden sm:inline">
          Auto-generated from chapter headings
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded"
        >
          Hide
        </button>
      </div>

      <div ref={containerRef} className="relative p-2 bg-background" style={{ minHeight: "320px" }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
            <p className="text-xs text-red-500">{error}</p>
          </div>
        )}
        <svg
          ref={svgRef}
          className="w-full"
          style={{ minHeight: "320px", height: "60vh", maxWidth: "100%" }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground text-center p-2 border-t border-border">
        Click nodes to expand/collapse • Drag to pan • Scroll to zoom
      </p>
    </div>
  );
}
