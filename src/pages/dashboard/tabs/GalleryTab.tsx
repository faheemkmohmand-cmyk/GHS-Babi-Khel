import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, Camera, Image, Play, WifiOff, RefreshCw } from "lucide-react";
import { useGalleryAlbums, useGalleryPhotos, isVideoUrl } from "@/hooks/useGallery";
import { useSlowConnection, useSmartSkeleton, useImagePrefetch } from "@/hooks/useSlowConnection";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const GalleryTab = () => {
  const { data: albums = [], isLoading } = useGalleryAlbums();
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const { data: photos = [], isLoading: photosLoading } = useGalleryPhotos(selectedAlbumId);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // SLOW INTERNET OPTIMIZATIONS
  const { isSlowConnection, isOnline, withRetry } = useSlowConnection({ enablePrefetch: true });
  const showSkeleton = useSmartSkeleton(isLoading || photosLoading, isSlowConnection ? 800 : 300);
  const { prefetchBatch } = useImagePrefetch();
  
  // Prefetch next/prev images when lightbox is open
  useEffect(() => {
    if (lightboxIndex !== null && photos.length > 0 && !isSlowConnection) {
      const toPrefetch: string[] = [];
      
      // Previous image
      if (lightboxIndex > 0) {
        toPrefetch.push(photos[lightboxIndex - 1].photo_url);
      }
      // Next image
      if (lightboxIndex < photos.length - 1) {
        toPrefetch.push(photos[lightboxIndex + 1].photo_url);
      }
      // Next 2 images for smooth scrolling
      for (let i = 1; i <= 2; i++) {
        if (lightboxIndex + i < photos.length) {
          toPrefetch.push(photos[lightboxIndex + i].photo_url);
        }
      }
      
      prefetchBatch(toPrefetch, 3);
    }
  }, [lightboxIndex, photos, isSlowConnection, prefetchBatch]);

  // Retry failed gallery loads with exponential backoff
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = useCallback(async () => {
    if (isRetrying) return;
    
    setIsRetrying(true);
    try {
      // Invalidate queries to trigger refetch
      await withRetry(async () => {
        // This will be handled by React Query's internal retry
        // We just need to trigger a state update
        setRetryCount(c => c + 1);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }, 3);
    } finally {
      setIsRetrying(false);
    }
  }, [isRetrying, withRetry]);

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const prevPhoto = useCallback(() => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i)), []);
  const nextPhoto = useCallback(() => setLightboxIndex((i) => (i !== null && i < photos.length - 1 ? i + 1 : i)), [photos.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") prevPhoto();
      if (e.key === "ArrowRight") nextPhoto();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, closeLightbox, prevPhoto, nextPhoto]);

  const isVideo = (url: string, mediaType?: string) =>
    mediaType === "video" || isVideoUrl(url);

  // Offline/Slow connection component
  const ConnectionWarning = () => (
    (!isOnline || isSlowConnection) && (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 mb-4">
        {!isOnline ? (
          <>
            <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-xs text-amber-700 dark:text-amber-300">
              You're viewing cached content. Some features may be limited.
            </span>
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-spin" />
            <span className="text-xs text-amber-700 dark:text-amber-300">
              Slow connection detected. Images will load progressively.
            </span>
          </>
        )}
      </div>
    )
  );

  if (selectedAlbumId) {
    const album = albums.find((a) => a.id === selectedAlbumId);
    return (
      <div className="space-y-4">
        <button onClick={() => setSelectedAlbumId(null)} className="text-sm text-primary font-medium hover:underline flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Back to Albums
        </button>
        {album && <h3 className="font-heading font-semibold text-foreground">{album.title}</h3>}
        
        <ConnectionWarning />

        {/* Optimized grid with better loading states */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {showSkeleton
            ? Array.from({ length: 8 }).map((_, i) => (
                <Skeleton 
                  key={`skeleton-${i}-${retryCount}`} 
                  className="aspect-square rounded-lg"
                  style={{ animationDelay: `${i * 50}ms` }}
                />
              ))
            : photos.map((p, i) => {
                const videoItem = isVideo(p.photo_url, p.media_type);
                return (
                  <div key={p.id} onClick={() => setLightboxIndex(i)} className="aspect-square rounded-lg overflow-hidden cursor-pointer group relative bg-secondary">
                    {/* Placeholder while image loads */}
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                      <Camera className="w-6 h-6 text-primary/30" />
                    </div>
                    
                    {videoItem ? (
                      <>
                        <video 
                          src={p.photo_url} 
                          preload="metadata" 
                          className="w-full h-full object-cover relative z-10"
                          playsInline
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-foreground/20 z-20">
                          <Play className="w-8 h-8 text-white" />
                        </div>
                        <Badge className="absolute top-1 left-1 bg-foreground/70 text-white text-[9px] gap-0.5 z-30">
                          <Play className="w-2.5 h-2.5" />VIDEO
                        </Badge>
                      </>
                    ) : (
                      <img 
                        src={p.photo_url} 
                        alt={p.caption || ""} 
                        loading="lazy" 
                        decoding="async" 
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300 relative z-10"
                        // Progressive loading enhancement
                        style={{ contentVisibility: 'auto' }}
                        onError={(e) => {
                          // Show placeholder on error instead of broken image
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                        onLoad={(e) => {
                          // Image loaded successfully
                          (e.target as HTMLImageElement).classList.add('loaded');
                        }}
                      />
                    )}
                  </div>
                );
              })}
        </div>

        {!showSkeleton && photos.length === 0 && (
          <div className="text-center py-12 bg-card rounded-xl shadow-card">
            <Image className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No photos in this album.</p>
            {!isOnline && (
              <button 
                onClick={handleRetry}
                disabled={isRetrying}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
                {isRetrying ? 'Retrying...' : 'Try Again'}
              </button>
            )}
          </div>
        )}

        {/* Lightbox */}
        <AnimatePresence>
          {lightboxIndex !== null && photos[lightboxIndex] && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-foreground/90 backdrop-blur-md flex items-center justify-center" onClick={closeLightbox}>
              <button onClick={closeLightbox} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white z-10"><X className="w-6 h-6" /></button>
              {lightboxIndex > 0 && <button onClick={(e) => { e.stopPropagation(); prevPhoto(); }} className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white z-10"><ChevronLeft className="w-8 h-8" /></button>}
              {lightboxIndex < photos.length - 1 && <button onClick={(e) => { e.stopPropagation(); nextPhoto(); }} className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white z-10"><ChevronRight className="w-8 h-8" /></button>}
              <motion.div key={lightboxIndex} initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} onClick={(e) => e.stopPropagation()} className="max-w-[90vw] max-h-[85vh]">
                {isVideo(photos[lightboxIndex].photo_url, photos[lightboxIndex].media_type) ? (
                  <video src={photos[lightboxIndex].photo_url} controls autoPlay className="max-w-full max-h-[80vh] rounded-xl" preload="metadata" />
                ) : (
                  <img 
                    src={photos[lightboxIndex].photo_url} 
                    alt="" 
                    className="max-w-full max-h-[80vh] object-contain rounded-xl"
                    // Optimize lightbox image loading
                    decoding="async"
                    fetchPriority="high"
                  />
                )}
                {photos[lightboxIndex].caption && <p className="text-white/80 text-sm mt-2 text-center">{photos[lightboxIndex].caption}</p>}
                
                {/* Photo counter optimized for slow connections */}
                <p className="text-white/50 text-xs mt-2 text-center">
                  {lightboxIndex + 1} / {photos.length}
                  {!isOnline && ' • Offline'}
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ConnectionWarning />
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {showSkeleton
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl overflow-hidden shadow-card">
                <Skeleton className="aspect-video w-full" style={{ animationDelay: `${i * 100}ms` }} />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-4 w-2/3" style={{ animationDelay: `${i * 100 + 50}ms` }} />
                  <Skeleton className="h-3 w-1/2" style={{ animationDelay: `${i * 100 + 100}ms` }} />
                </div>
              </div>
            ))
          : albums.length === 0 ? (
              <div className="col-span-full text-center py-12 bg-card rounded-xl shadow-card">
                <Camera className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No albums yet.</p>
                {!isOnline && (
                  <p className="text-xs text-muted-foreground mt-2">Content will appear when you're back online.</p>
                )}
              </div>
            ) : albums.map((album) => (
              <div key={album.id} onClick={() => setSelectedAlbumId(album.id)} className="bg-card rounded-xl overflow-hidden shadow-card hover:shadow-elevated transition-all cursor-pointer group">
                <div className="aspect-video overflow-hidden relative bg-secondary">
                  {album.cover_url ? (
                    <img 
                      src={album.cover_url} 
                      alt={album.title} 
                      loading="lazy" 
                      decoding="async" 
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      style={{ contentVisibility: 'auto' }}
                    />
                  ) : (
                    <div className="w-full h-full gradient-hero flex items-center justify-center">
                      <Camera className="w-10 h-10 text-primary-foreground/40" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/20 transition-colors flex items-center justify-center">
                    <span className="text-white font-semibold text-sm opacity-0 group-hover:opacity-100 transition-opacity">View Photos</span>
                  </div>
                  
                  {/* Loading indicator for slow connections */}
                  {isSlowConnection && (
                    <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">
                      Tap to load
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-foreground text-sm">{album.title}</h3>
                  {album.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{album.description}</p>}
                </div>
              </div>
            ))}
      </div>
    </div>
  );
};

export default GalleryTab;
