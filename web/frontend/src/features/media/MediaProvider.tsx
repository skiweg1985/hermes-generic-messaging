import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  /** Thumbnail-DOM fürs Shared-Element (FLIP) der Lightbox; null beim Unmount. */
  registerImageElement: (id: string, el: HTMLElement | null) => void;
  getImageElement: (id: string) => HTMLElement | null;
  openAt: (id: string) => void;
  openImage: (image: MediaImage) => void;
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
  const elementsRef = useRef<Map<string, HTMLElement>>(new Map());

  // Kein clear() der Element-Map beim Chat-Wechsel: die Ref-Cleanups der
  // unmountenden ImageCards räumen selbst auf, und dieser Effekt liefe NACH
  // den Ref-Callbacks der neuen Karten — er würde deren Einträge löschen.
  useEffect(() => {
    setImages([]);
  }, [registryKey]);

  const registerImageElement = useCallback((id: string, el: HTMLElement | null) => {
    if (el) elementsRef.current.set(id, el);
    else elementsRef.current.delete(id);
  }, []);

  const getImageElement = useCallback(
    (id: string) => elementsRef.current.get(id) ?? null,
    [],
  );

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

  const openImage = useCallback(
    (image: MediaImage) => {
      const existingIndex = images.findIndex((p) => p.id === image.id);
      const next = existingIndex >= 0 ? [...images] : [...images, image];
      const index = existingIndex >= 0 ? existingIndex : next.length - 1;
      next[index] = image;
      setImages(next);
      onOpenLightbox(next, index);
    },
    [images, onOpenLightbox],
  );

  const value = useMemo<MediaContextValue>(
    () => ({ images, registerImage, registerImageElement, getImageElement, openAt, openImage }),
    [images, registerImage, registerImageElement, getImageElement, openAt, openImage],
  );

  return <MediaContext.Provider value={value}>{children}</MediaContext.Provider>;
}

export function useMediaContext(): MediaContextValue | null {
  return useContext(MediaContext);
}
