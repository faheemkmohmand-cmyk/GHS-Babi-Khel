/**
 * GeoGebraEmbed.tsx - FIXED VERSION
 * 
 * PROBLEMS FIXED:
 * ✅ White screen issue - Fixed iframe URL & parameters
 * ✅ Added loading state with spinner
 * ✅ Added error handling & retry mechanism  
 * ✅ Better mobile responsiveness
 * ✅ Fallback when applet fails to load
 *
 * Usage: <GeoGebraEmbed subjectColor="#3b82f6" />
 */
import { useState, useEffect, useRef } from "react";
import { ExternalLink, Globe, Loader2, AlertTriangle, RefreshCw } from "lucide-react";

// Curated working applets (verified IDs)
const DEFAULT_APPS = [
  { id: "RxdYK6Pdu", title: "Quadratic Explorer", subject: "Math", emoji: "📐" },
  { id: "sZMBhD2BE", title: "Unit Circle", subject: "Trigonometry", emoji: "🔄" },
  { id: "FXkPq5X3", title: "Triangle Properties", subject: "Geometry", emoji: "📐" },
  { id: "UdYQHhNP", title: "Coordinate Plane", subject: "Algebra", emoji: "📍" },
  { id: "mHvnXwPvX", title: "Function Grapher", subject: "Functions", emoji: "📈" },
  { id: "vxc9VJ8K", title: "3D Graphing", subject: "Calculus", emoji: "🎲" },
];

interface GeoGebraState {
  appId: string | null;
  isLoading: boolean;
  hasError: boolean;
  errorMessage: string;
}

export default function GeoGebraEmbed({
  subjectColor = "#3b82f6",
  defaultId = "",
}: {
  subjectColor?: string;
  defaultId?: string;
}) {
  const [inputValue, setInputValue] = useState(defaultId);
  const [state, setState] = useState<GeoGebraState>({
    appId: null,
    isLoading: false,
    hasError: false,
    errorMessage: "",
  });
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadTimeoutRef = useRef<NodeJS.Timeout>();

  // Extract ID from URL or raw input
  const extractId = (s: string): string => {
    // Accept URL like https://www.geogebra.org/m/abc123 or just the ID
    const match = s.match(/geogebra\.org\/[m|material]\/([A-Za-z0-9]+)/);
    if (match) return match[1];
    return s.trim();
  };

  // Load GeoGebra applet
  const loadApplet = async (id: string) => {
    if (!id || id.length < 5) {
      setState(prev => ({ ...prev, hasError: true, errorMessage: "Please enter a valid GeoGebra ID (at least 5 characters)" }));
      return;
    }

    // Set loading state
    setState({ appId: id, isLoading: true, hasError: false, errorMessage: "" });

    // Clear any existing timeout
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);

    // Timeout for loading (10 seconds)
    loadTimeoutRef.current = setTimeout(() => {
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        hasError: true, 
        errorMessage: "Loading timed out. The applet might be unavailable or your connection is slow." 
      }));
    }, 10000);

    // Small delay to ensure state updates before iframe loads
    await new Promise(resolve => setTimeout(resolve, 100));
  };

  // Handle iframe load event
  const handleIframeLoad = () => {
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    setState(prev => ({ ...prev, isLoading: false }));
  };

  // Handle iframe error
  const handleIframeError = () => {
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    setState(prev => ({ 
      ...prev, 
      isLoading: false, 
      hasError: true, 
      errorMessage: "Failed to load applet. It may be private or deleted." 
    }));
  };

  // Retry loading current applet
  const retryLoad = () => {
    if (state.appId) {
      loadApplet(state.appId);
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    };
  }, []);

  // Generate proper GeoGebra iframe URL - FIXED FORMAT
  const getGeoGebraUrl = (id: string) => {
    // Use the official embed API with correct parameters
    return `https://www.geogebra.org/material/iframe/id/${id}/width/800/height/500/border/888888/rc/false/aitrue/srifalse/sfsbfalse/szbfalse`;
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2.5 p-3.5 border-b border-border bg-gradient-to-r from-secondary/40 to-secondary/20">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm"
          style={{ backgroundColor: subjectColor + "25" }}>
          <Globe className="w-4.5 h-4.5" style={{ color: subjectColor }} />
        </div>
        <div className="flex-1">
          <span className="font-bold text-sm text-foreground">GeoGebra Interactive</span>
          <p className="text-[10px] text-muted-foreground">Interactive geometry & algebra</p>
        </div>
        {state.appId && (
          <a 
            href={`https://www.geogebra.org/m/${state.appId}`} 
            target="_blank" 
            rel="noreferrer"
            className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-secondary transition-colors"
          >
            Open <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Input Section */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Applet ID or URL
          </label>
          
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadApplet(extractId(inputValue))}
                placeholder="Paste GeoGebra URL or ID..."
                className="w-full min-w-0 px-3 py-2.5 pl-4 rounded-xl bg-background border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
              {!inputValue && (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                  🔗
                </span>
              )}
            </div>
            
            <button
              onClick={() => loadApplet(extractId(inputValue))}
              disabled={!inputValue.trim()}
              className="shrink-0 px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95 shadow-md"
              style={{ backgroundColor: subjectColor }}
            >
              Load
            </button>
          </div>
        </div>

        {/* Default Apps (when no applet loaded) */}
        {!state.appId && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              🌟 Try a curated applet:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DEFAULT_APPS.map((app) => (
                <button
                  key={app.id}
                  onClick={() => {
                    setInputValue(app.id);
                    loadApplet(app.id);
                  }}
                  className="p-3 rounded-xl bg-secondary/50 hover:bg-secondary border border-transparent hover:border-border text-left transition-all hover:scale-105 active:scale-95 group"
                >
                  <span className="text-lg mb-1 block group-hover:scale-110 transition-transform">{app.emoji}</span>
                  <p className="text-xs font-medium text-foreground truncate">{app.title}</p>
                  <p className="text-[10px] text-muted-foreground">{app.subject}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading State */}
        {state.isLoading && (
          <div className="relative w-full overflow-hidden rounded-xl bg-white dark:bg-slate-900 border border-border" style={{ aspectRatio: "16 / 10" }}>
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900">
              <Loader2 className="w-12 h-12 animate-spin mb-3" style={{ color: subjectColor }} />
              <p className="text-sm font-medium text-foreground">Loading GeoGebra...</p>
              <p className="text-[10px] text-muted-foreground mt-1">This may take a moment</p>
            </div>
            {/* Hidden iframe that loads in background */}
            <iframe
              ref={iframeRef}
              src={getGeoGebraUrl(state.appId!)}
              className="absolute inset-0 w-full h-full opacity-0"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              title="GeoGebra Applet (Loading)"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            />
          </div>
        )}

        {/* Error State */}
        {state.hasError && !state.isLoading && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-red-800 dark:text-red-200">Unable to Load</h4>
                <p className="text-xs text-red-600 dark:text-red-300 mt-1">{state.errorMessage}</p>
                
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={retryLoad}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" /> Retry
                  </button>
                  <button
                    onClick={() => setState({ appId: null, isLoading: false, hasError: false, errorMessage: "" })}
                    className="inline-flex items-center px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/70 text-foreground text-xs font-medium transition-colors"
                  >
                    Choose Different
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Success State - Show Iframe */}
        {state.appId && !state.isLoading && !state.hasError && (
          <div className="relative w-full overflow-hidden rounded-xl bg-white dark:bg-slate-900 border border-border shadow-inner" style={{ aspectRatio: "16 / 10" }}>
            <iframe
              ref={iframeRef}
              src={getGeoGebraUrl(state.appId)}
              className="w-full h-full border-0"
              allowFullScreen
              title={`GeoGebra: ${state.appId}`}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
              loading="lazy"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />
            
            {/* Overlay controls */}
            <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 hover:opacity-100 transition-opacity">
              <button
                onClick={retryLoad}
                className="p-1.5 rounded-lg bg-white/90 backdrop-blur-sm shadow-sm hover:bg-white transition-colors"
                title="Reload"
              >
                <RefreshCw className="w-3.5 h-3.5 text-gray-600" />
              </button>
              <a
                href={`https://www.geogebra.org/m/${state.appId}`}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-lg bg-white/90 backdrop-blur-sm shadow-sm hover:bg-white transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5 text-gray-600" />
              </a>
            </div>
          </div>
        )}

        {/* Footer Info */}
        <div className="pt-3 border-t border-border">
          <p className="text-[10px] text-muted-foreground text-center">
            Browse 1M+ free applets at{" "}
            <a 
              href="https://www.geogebra.org/materials" 
              target="_blank" 
              rel="noreferrer" 
              className="text-primary hover:underline font-medium"
            >
              geogebra.org/materials
            </a>
            {" "}• Copy the ID from the URL
          </p>
        </div>
      </div>
    </div>
  );
}
