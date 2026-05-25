import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export interface MediaImage {
  id: string;
  url: string;
  caption?: string;
  downloadUrl?: string;
  alt?: string;
}

interface MediaContextValue {
  images: MediaImage[];
  registerImage: (image: MediaImage) => void;
  openAt: (id: string) => void;
}

const MediaContext = createContext<MediaContextValue | null>(null);

interface MediaProviderProps {
  children: ReactNode;
  /** Clears the lightbox registry when the active chat changes. */
  registryKey: string;
  onOpenLightbox: (images: MediaImage[], index: number) => void;
}

/**
 * Collects all rendered images in the current transcript so the Lightbox
 * can navigate forward/backward across them.
 */
export function MediaProvider({ children, registryKey, onOpenLightbox }: MediaProviderProps) {
  const [images, setImages] = useState<MediaImage[]>([]);

  useEffect(() => {
    setImages([]);
  }, [registryKey]);

  const registerImage = useCallback((image: MediaImage) => {
    setImages((prev) => {
      const idx = prev.findIndex((p) => p.id === image.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = image;
        return next;
      }
      return [...prev, image];
    });
  }, []);

  const openAt = useCallback(
    (id: string) => {
      setImages((prev) => {
        const idx = prev.findIndex((p) => p.id === id);
        if (idx >= 0) onOpenLightbox(prev, idx);
        return prev;
      });
    },
    [onOpenLightbox],
  );

  const value = useMemo<MediaContextValue>(
    () => ({ images, registerImage, openAt }),
    [images, registerImage, openAt],
  );

  return <MediaContext.Provider value={value}>{children}</MediaContext.Provider>;
}

export function useMediaContext(): MediaContextValue | null {
  return useContext(MediaContext);
}
