'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

interface PhotoLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

/** Fullscreen photo overlay — close via backdrop click, ✕ button or Esc. */
export function PhotoLightbox({ src, alt, onClose }: PhotoLightboxProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center cursor-zoom-out"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        // stopPropagation: the overlay can be a DOM descendant of a clickable
        // row/card (via MemberAvatar) — don't let the closing click fall
        // through to it, or to Radix outside-click handlers on dialogs.
        e.stopPropagation();
        onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Full-size photo of ${alt}`}
    >
      <button
        className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors z-10"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close photo"
      >
        <X className="h-8 w-8" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-[95vw] max-h-[95vh] object-contain"
      />
    </div>
  );
}
