/**
 * NetworkAwareWrapper.tsx — Visual feedback for network status
 * 
 * Shows user-friendly indicators when:
 * - Connection is slow
 * - Data is being saved in background
 * - Auto-save has occurred
 */

import { useState, useEffect } from 'react';
import { Wifi, WifiOff, Save, CheckCircle2, AlertCircle } from 'lucide-react';

type Status = 'online' | 'slow' | 'offline' | 'saving' | 'saved';

interface NetworkStatusProps {
  /** Show compact version (for inline use) */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

export function NetworkStatusIndicator({ compact = false, className = '' }: NetworkStatusProps) {
  const [status, setStatus] = useState<Status>('online');
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    // Detect initial status
    updateStatus();

    // Listen for changes
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    
    // Listen for custom save events
    const handleSaveStart = () => setStatus('saving');
    const handleSaveComplete = () => {
      setStatus('saved');
      setShowSaved(true);
      setTimeout(() => {
        setShowSaved(false);
        setStatus('online');
      }, 2000);
    };

    window.addEventListener('form-save-start', handleSaveStart);
    window.addEventListener('form-save-complete', handleSaveComplete);

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
      window.removeEventListener('form-save-start', handleSaveStart);
      window.removeEventListener('form-save-complete', handleSaveComplete);
    };
  }, []);

  const updateStatus = () => {
    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }

    // Try to detect slow connection
    const nav = navigator as any;
    if (nav.connection?.effectiveType === '2g' || nav.connection?.effectiveType === '3g') {
      setStatus('slow');
      return;
    }

    setStatus('online');
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        {status === 'offline' && (
          <>
            <WifiOff className="w-3.5 h-3.5 text-destructive" />
            <span className="text-[10px] text-destructive font-medium">Offline</span>
          </>
        )}
        {status === 'slow' && (
          <>
            <Wifi className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[10px] text-amber-600 font-medium">Slow</span>
          </>
        )}
        {(status === 'saving' || showSaved) && (
          <>
            {showSaved ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                <span className="text-[10px] text-green-600 font-medium">Saved!</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 text-primary animate-pulse" />
                <span className="text-[10px] text-primary font-medium">Saving...</span>
              </>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border ${className}`}>
      {status === 'offline' && (
        <>
          <WifiOff className="w-4 h-4 text-destructive" />
          <span className="text-xs text-destructive font-medium">You're offline. Changes will be saved locally.</span>
        </>
      )}
      {status === 'slow' && (
        <>
          <AlertCircle className="w-4 h-4 text-amber-500" />
          <span className="text-xs text-amber-700">Slow connection detected. Optimizing for your speed.</span>
        </>
      )}
      {status === 'saving' && (
        <>
          <Save className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-xs text-primary font-medium">Auto-saving...</span>
        </>
      )}
      {status === 'saved' && showSaved && (
        <>
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <span className="text-xs text-green-600 font-medium">All changes saved!</span>
        </>
      )}
    </div>
  );
}

/**
 * Hook to dispatch save events for NetworkStatusIndicator
 */
export function useSaveNotification() {
  const notifySaveStart = () => {
    window.dispatchEvent(new Event('form-save-start'));
  };

  const notifySaveComplete = () => {
    window.dispatchEvent(new Event('form-save-complete'));
  };

  return { notifySaveStart, notifySaveComplete };
}
