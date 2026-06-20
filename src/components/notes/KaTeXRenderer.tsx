/**
 * KaTeXRenderer.tsx
 * Renders HTML content with LaTeX/KaTeX formulas.
 *
 * Supports delimiters:
 *   Display math:  $$...$$   or  \[...\]
 *   Inline math:   $...$     or  \(...\)
 *
 * Loads KaTeX CSS + JS from CDN on first use (zero npm dependency).
 * After KaTeX is loaded, parses the HTML string to find LaTeX expressions,
 * renders them via katex.renderToString(), and returns safe HTML.
 *
 * Also used by the admin RichTextEditor to preview formulas in real time.
 */

import { useState, useEffect, useMemo, useCallback } from "react";

// ─── KaTeX CDN Loader ────────────────────────────────────────────────────────
// Load KaTeX lazily from CDN. Once loaded, katex is available globally.

let katexLoadPromise: Promise<any> | null = null;

function loadKaTeX(): Promise<any> {
  if (katexLoadPromise) return katexLoadPromise;

  katexLoadPromise = new Promise((resolve, reject) => {
    // Check if already loaded
    if ((window as any).katex) {
      resolve((window as any).katex);
      return;
    }

    // Load CSS
    const cssLink = document.createElement("link");
    cssLink.rel = "stylesheet";
    cssLink.href = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";
    cssLink.crossOrigin = "anonymous";
    document.head.appendChild(cssLink);

    // Load JS
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js";
    script.crossOrigin = "anonymous";
    script.onload = () => {
      const katex = (window as any).katex;
      if (katex) resolve(katex);
      else reject(new Error("KaTeX loaded but not found on window"));
    };
    script.onerror = () => reject(new Error("Failed to load KaTeX from CDN"));
    document.head.appendChild(script);
  });

  return katexLoadPromise;
}

// ─── LaTeX Delimiter Regex ───────────────────────────────────────────────────
// Order matters: display math first (longer delimiter), then inline.
// We avoid matching inside HTML tags, code blocks, or already-rendered katex spans.

const DISPLAY_MATH_REGEX = /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g;
const INLINE_MATH_REGEX = /\$([^\$\n]+?)\$|\\\(([\s\S]*?)\\\)/g;

// ─── Render LaTeX in HTML string ─────────────────────────────────────────────

function renderLatexInHTML(html: string, katex: any): string {
  if (!katex || !html) return html;

  // Protect code blocks, <pre>, <code>, and already-rendered katex from processing
  const protectedBlocks: string[] = [];
  let result = html;

  // Protect <pre>...</pre> and <code>...</code> blocks
  result = result.replace(/<(pre|code)[^>]*>[\s\S]*?<\/\1>/gi, (match) => {
    protectedBlocks.push(match);
    return `%%PROTECTED_${protectedBlocks.length - 1}%%`;
  });

  // Protect <span class="katex">...</span> (already rendered)
  result = result.replace(/<span[^>]*class="katex[^"]*"[^>]*>[\s\S]*?<\/span>/gi, (match) => {
    protectedBlocks.push(match);
    return `%%PROTECTED_${protectedBlocks.length - 1}%%`;
  });

  // Protect HTML tags (so we don't match $ inside attributes)
  result = result.replace(/<[^>]+>/g, (match) => {
    protectedBlocks.push(match);
    return `%%PROTECTED_${protectedBlocks.length - 1}%%`;
  });

  // Render display math $$...$$ and \[...\]
  result = result.replace(DISPLAY_MATH_REGEX, (match, g1: string | undefined, g2: string | undefined) => {
    const latex = (g1 || g2 || "").trim();
    if (!latex) return match;
    try {
      const rendered = katex.renderToString(latex, {
        displayMode: true,
        throwOnError: false,
        trust: true,
        strict: false,
      });
      return rendered;
    } catch (e) {
      // Return the original text with error styling
      return `<span style="color:#ef4444;background:#fef2f2;padding:2px 6px;border-radius:4px;font-size:13px;" title="LaTeX Error: ${(e as Error).message}">${escapeHtml(match)}</span>`;
    }
  });

  // Render inline math $...$ and \(...\)
  result = result.replace(INLINE_MATH_REGEX, (match, g1: string | undefined, g2: string | undefined) => {
    const latex = (g1 || g2 || "").trim();
    if (!latex) return match;
    try {
      const rendered = katex.renderToString(latex, {
        displayMode: false,
        throwOnError: false,
        trust: true,
        strict: false,
      });
      return rendered;
    } catch (e) {
      return `<span style="color:#ef4444;background:#fef2f2;padding:2px 6px;border-radius:4px;font-size:13px;" title="LaTeX Error: ${(e as Error).message}">${escapeHtml(match)}</span>`;
    }
  });

  // Restore protected blocks
  result = result.replace(/%%PROTECTED_(\d+)%%/g, (_match, idx: string) => {
    return protectedBlocks[parseInt(idx)];
  });

  return result;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Sanitize chapter HTML ────────────────────────────────────────────────────
// Chapter content is admin-authored rich text (often pasted from Word/Google
// Docs/other sources) and is rendered directly into the page via
// dangerouslySetInnerHTML — NOT inside an iframe. If the saved HTML contains a
// stray <style> or <script> tag, it leaks into the global document and can
// override site-wide styles (e.g. turning the footer or whole page white).
// Strip those tags (and inline event-handler attributes / javascript: URLs)
// before rendering.
export function sanitizeChapterHTML(html: string): string {
  if (!html) return html;
  let safe = html;
  // Remove <style>...</style> blocks entirely — these are the main culprit
  // for global CSS leaks (e.g. a pasted "body { background: white }" rule).
  safe = safe.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  // Remove <script>...</script> blocks — never execute admin-pasted scripts
  // inline on the live page (animation_code already runs safely in its own
  // sandboxed iframe elsewhere).
  safe = safe.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  // Strip inline on* event handler attributes (onclick=, onerror=, etc.)
  safe = safe.replace(/\son\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "");
  // Strip javascript: URLs in href/src
  safe = safe.replace(/\s(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "");
  return safe;
}

// ─── React Component ─────────────────────────────────────────────────────────

interface KaTeXRendererProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
  liteMode?: boolean;
}

const KaTeXRenderer: React.FC<KaTeXRendererProps> = ({ content, className, style, liteMode }) => {
  const [katexLoaded, setKatexLoaded] = useState(!!(window as any).katex);
  const [renderedHTML, setRenderedHTML] = useState("");

  // Load KaTeX on mount
  useEffect(() => {
    loadKaTeX()
      .then(() => setKatexLoaded(true))
      .catch((err) => {
        console.warn("KaTeX CDN load failed, formulas will show as raw text:", err);
        setKatexLoaded(true); // Still set true so we render raw content
      });
  }, []);

  // Render LaTeX whenever content or katex status changes
  useEffect(() => {
    const katex = (window as any).katex;
    if (!content) {
      setRenderedHTML("");
      return;
    }

    let processedContent = sanitizeChapterHTML(content);

    // Lite mode: strip images
    if (liteMode) {
      processedContent = processedContent.replace(/<img[^>]*>/g, "");
    }

    if (katex && katexLoaded) {
      processedContent = renderLatexInHTML(processedContent, katex);
    }

    setRenderedHTML(processedContent);
  }, [content, katexLoaded, liteMode]);

  if (!content) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-4xl mb-3">📝</p>
        <p>Content coming soon...</p>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: renderedHTML }}
    />
  );
};

// ─── Utility: render LaTeX string for admin preview ──────────────────────────
// Call this to render a preview of a formula the admin is typing

export async function renderLatexPreview(latex: string, displayMode = false): Promise<string> {
  const katex = await loadKaTeX();
  if (!katex) return latex;
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      trust: true,
      strict: false,
    });
  } catch {
    return latex;
  }
}

// ─── Utility: insert LaTeX into Tiptap editor ────────────────────────────────
// Admin can click a toolbar button to insert a LaTeX formula

export function insertLatexIntoEditor(editor: any, displayMode = false) {
  const latex = prompt(
    displayMode
      ? "Enter display math (e.g. E = mc^2 or \\frac{a}{b}):"
      : "Enter inline math (e.g. x^2 or \\sqrt{2}):",
    displayMode ? "E = mc^2" : "x^2"
  );
  if (!latex || !latex.trim() || !editor) return;

  const delimiter = displayMode ? `$$${latex.trim()}$$` : `$${latex.trim()}$`;
  editor.chain().focus().insertContent(delimiter + " ").run();
}

export default KaTeXRenderer;
  
