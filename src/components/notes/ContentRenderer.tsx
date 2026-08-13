/**
 * ContentRenderer.tsx
 * 
 * Simple HTML content renderer for Notes chapters.
 * NO KaTeX dependency — renders raw HTML pasted from admin panel.
 * 
 * ✅ RTL (Right-to-Left) SUPPORT:
 * Automatically detects RTL languages (Urdu, Arabic, Pashto, Persian, etc.)
 * and applies proper direction, text alignment, and font settings.
 */

import { useMemo } from "react";

// ─── RTL Language Detection ──────────────────────────────────────────────────

/**
 * List of RTL language names/keywords for detection
 */
const RTL_LANGUAGE_KEYWORDS = [
  'urdu', 'اردو', 'عربی', 'arabic', 'pashto', 'پښتو', 'persian', 'فارسی', 'farsi',
  'dari', 'دری', 'hebrew', 'עברית', 'yiddish', 'ייִדיש', 'sindhi', 'سنڌي',
  'uyghur', 'ئۇيغۇرچە'
];

/**
 * Unicode ranges for RTL script detection
 */
const RTL_UNICODE_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF\uFB1D-\uFB4F\u0700-\u074F\u0780-\u07BF]/;

/**
 * Detects if text contains significant RTL characters
 */
export function containsRTLText(text: string, threshold: number = 0.15): boolean {
  if (!text) return false;
  
  const plainText = text.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
  
  if (plainText.length === 0) return false;
  
  const rtlMatches = plainText.match(RTL_UNICODE_REGEX);
  const rtlCharCount = rtlMatches ? rtlMatches.length : 0;
  
  return (rtlCharCount / plainText.length) >= threshold;
}

/**
 * Checks if a subject name indicates an RTL language
 */
export function isRTLLanguage(subjectName?: string): boolean {
  if (!subjectName) return false;
  
  const lowerName = subjectName.toLowerCase();
  
  return RTL_LANGUAGE_KEYWORDS.some(keyword => 
    lowerName.includes(keyword.toLowerCase())
  );
}

/**
 * Sanitize HTML content — removes dangerous tags but keeps formatting
 */
export function sanitizeContentHTML(html: string): string {
  if (!html) return html;
  let safe = html;
  
  // Remove <style>...</style> blocks (can leak global CSS)
  safe = safe.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  
  // Remove <script>...</script> blocks (security)
  safe = safe.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  
  // Strip inline event handlers
  safe = safe.replace(/\son\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "");
  
  // Strip javascript: URLs
  safe = safe.replace(/\s(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "");
  
  return safe;
}

// ─── React Component ─────────────────────────────────────────────────────────

interface ContentRendererProps {
  /** Raw HTML content (pasted from admin) */
  content: string;
  /** Additional CSS classes */
  className?: string;
  /** Additional styles */
  style?: React.CSSProperties;
  /** Subject name for RTL auto-detection hint */
  subjectName?: string;
  /** Force RTL mode */
  forceRTL?: boolean;
  /** Force LTR mode */
  forceLTR?: boolean;
}

const ContentRenderer: React.FC<ContentRendererProps> = ({ 
  content, 
  className, 
  style,
  subjectName,
  forceRTL = false,
  forceLTR = false
}) => {
  // Determine RTL configuration
  const config = useMemo(() => {
    if (forceLTR) {
      return { dir: "ltr" as const, isRTL: false };
    }
    if (forceRTL) {
      return { dir: "rtl" as const, isRTL: true };
    }
    
    // Auto-detect based on subject name or content
    const subjectIsRTL = isRTLLanguage(subjectName);
    const contentHasRTL = containsRTLText(content);
    
    if (subjectIsRTL || contentHasRTL) {
      return { dir: "rtl" as const, isRTL: true };
    }
    
    return { dir: "ltr" as const, isRTL: false };
  }, [content, subjectName, forceRTL, forceLTR]);

  // Build styles
  const mergedStyle: React.CSSProperties = {
    ...style,
    ...(config.isRTL ? {
      direction: "rtl",
      textAlign: "right",
      fontFamily: "'Noto Nastaliq Urdu', 'Noto Naskh Arabic', 'Jameel Noori Nastaleeq', 'Arial', sans-serif",
      lineHeight: 2,
    } : {
      direction: "ltr",
      textAlign: "left",
    })
  };

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
      dir={config.dir}
      className={className}
      style={mergedStyle}
      dangerouslySetInnerHTML={{ __html: sanitizeContentHTML(content) }}
    />
  );
};

export default ContentRenderer;
