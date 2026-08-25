import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Image, ChevronLeft, ChevronRight, X, Camera, Play, WifiOff, RefreshCw } from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import { useGalleryAlbums, useGalleryPhotos, isVideoUrl } from "@/hooks/useGallery";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const Gallery = () => {
  const { data: albums = [], isLoading, isError: albumsError, refetch: refetchAlbums } = useGalleryAlbums();
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const { data: photos = [], isLoading: photosLoading, isError: photosError, refetch: refetchPhotos } = useGalleryPhotos(selectedAlbumId);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const selectedAlbum = albums.find((a) => a.id === selectedAlbumId);

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const prevPhoto = useCallback(() => {
    setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
  }, []);
  const nextPhoto = useCallback(() => {
    setLightboxIndex((i) => (i !== null && i < photos.length - 1 ? i + 1 : i));
  }, [photos.length]);

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

  return (
    <PageLayout>
      <PageBanner title="Photo Gallery" subtitle="Moments captured at GHS Babi Khel" />

      <section className="py-16">
        <div className="container mx-auto px-4">
          {selectedAlbumId && (
            <button
              onClick={() => setSelectedAlbumId(null)}
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline mb-6"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Albums
            </button>
          )}

          {!selectedAlbumId ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="bg-card rounded-2xl overflow-hidden shadow-card">
                      <Skeleton className="aspect-video w-full" />
                      <div className="p-5 space-y-2">
                        <Skeleton className="h-5 w-2/3" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))
                : albumsError && !albums.length ? (
                    <div className="col-span-full text-center py-20">
                      <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mx-auto mb-4">
                        <WifiOff className="w-8 h-8 text-orange-500" />
                      </div>
                      <p className="font-semibold text-foreground text-lg">Can't load gallery</p>
                      <p className="text-sm text-muted-foreground mt-1 mb-4">You appear to be offline. Albums you've visited before will load from cache.</p>
                      <button onClick={() => refetchAlbums()} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity">
                        <RefreshCw className="w-4 h-4" /> Try Again
                      </button>
                    </div>
                  )
                : albums.map((album) => (
                    <motion.div
                      key={album.id}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      onClick={() => setSelectedAlbumId(album.id)}
                      className="group bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-elevated transition-all duration-300 cursor-pointer"
                    >
                      <div className="aspect-video overflow-hidden relative">
                        {album.cover_url ? (
                          <img
                            src={album.cover_url}
                            alt={album.title}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full gradient-hero flex items-center justify-center">
                            <Camera className="w-12 h-12 text-primary-foreground/40" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/30 transition-colors duration-300 flex items-center justify-center">
                          <span className="text-white font-heading font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                            View Photos
                          </span>
                        </div>
                      </div>
                      <div className="p-5">
                        <h3 className="font-heading font-semibold text-foreground">{album.title}</h3>
                        {album.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{album.description}</p>
                        )}
                      </div>
                    </motion.div>
                  ))}
            </div>
          ) : (
            <>
              {selectedAlbum && (
                <h2 className="text-2xl font-heading font-bold text-foreground mb-6">{selectedAlbum.title}</h2>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {photosLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="aspect-square rounded-xl" />
                    ))
                  : photosError && !photos.length ? (
                      <div className="col-span-full text-center py-16">
                        <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mx-auto mb-4">
                          <WifiOff className="w-8 h-8 text-orange-500" />
                        </div>
                        <p className="font-semibold text-foreground">Can't load photos</p>
                        <p className="text-sm text-muted-foreground mt-1 mb-4">You appear to be offline.</p>
                        <button onClick={() => refetchPhotos()} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity">
                          <RefreshCw className="w-4 h-4" /> Try Again
                        </button>
                      </div>
                    )
                  : photos.map((photo, i) => {
                      const videoItem = isVideo(photo.photo_url, photo.media_type);
                      return (
                        <motion.div
                          key={photo.id}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.03 }}
                          onClick={() => setLightboxIndex(i)}
                          className="aspect-square rounded-xl overflow-hidden cursor-pointer group relative"
                        >
                          {videoItem ? (
                            <>
                              <video src={photo.photo_url} preload="metadata" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 flex items-center justify-center bg-foreground/20">
                                <div className="w-12 h-12 rounded-full bg-white/80 flex items-center justify-center">
                                  <Play className="w-6 h-6 text-foreground ml-0.5" />
                                </div>
                              </div>
                              <Badge className="absolute top-2 left-2 bg-foreground/70 text-white text-[10px] gap-1"><Play className="w-3 h-3" />VIDEO</Badge>
                            </>
                          ) : (
                            <img
                              src={photo.photo_url}
                              alt={photo.caption || "Photo"}
                              loading="lazy"
                              decoding="async"
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                            />
                          )}
                        </motion.div>
                      );
                    })}
              </div>

              {!photosLoading && photos.length === 0 && (
                <div className="text-center py-16 bg-card rounded-2xl shadow-card">
                  <Image className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No photos in this album yet.</p>
                </div>
              )}
            </>
          )}

          {!selectedAlbumId && !isLoading && albums.length === 0 && (
            <div className="text-center py-16 bg-card rounded-2xl shadow-card">
              <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No albums yet.</p>
            </div>
          )}
        </div>
      </section>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && photos[lightboxIndex] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-foreground/90 backdrop-blur-md flex items-center justify-center"
            onClick={closeLightbox}
          >
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
            >
              <X className="w-6 h-6" />
            </button>

            {lightboxIndex > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); prevPhoto(); }}
                className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
            )}

            {lightboxIndex < photos.length - 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); nextPhoto(); }}
                className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            )}

            <motion.div
              key={lightboxIndex}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-[90vw] max-h-[85vh] flex flex-col items-center"
            >
              {isVideo(photos[lightboxIndex].photo_url, photos[lightboxIndex].media_type) ? (
                <video
                  src={photos[lightboxIndex].photo_url}
                  controls
                  autoPlay
                  className="max-w-full max-h-[80vh] rounded-xl"
                />
              ) : (
                <img
                  src={photos[lightboxIndex].photo_url}
                  alt={photos[lightboxIndex].caption || "Photo"}
                  className="max-w-full max-h-[80vh] object-contain rounded-xl"
                />
              )}
              {photos[lightboxIndex].caption && (
                <p className="text-white/80 text-sm mt-3 text-center">{photos[lightboxIndex].caption}</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageLayout>
  );
};

export default Gallery;
