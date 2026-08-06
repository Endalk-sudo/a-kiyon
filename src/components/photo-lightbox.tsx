'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface PhotoLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

const INTERCEPT_EVENTS = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'touchstart',
  'touchend',
  'click',
] as const;

/** Fullscreen photo overlay — close via backdrop click, ✕ button or Esc. */
export function PhotoLightbox({ src, alt, onClose }: PhotoLightboxProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Native capture-phase interception: runs before any document-level bubble
  // listener (Radix dialog outside-click/pointerdown dismissal), independent
  // of React event delegation. The overlay can also be a DOM descendant of a
  // clickable row/card (via MemberAvatar), so nothing may see these events
  // but the lightbox itself.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const intercept = (event: Event) => {
      event.stopPropagation();
      if (event.type === 'click') onCloseRef.current();
    };

    for (const type of INTERCEPT_EVENTS) {
      root.addEventListener(type, intercept, true);
    }
    return () => {
      for (const type of INTERCEPT_EVENTS) {
        root.removeEventListener(type, intercept, true);
      }
    };
  }, []);

  // Move focus into the overlay on open and restore it to the trigger on
  // close (aria-modal overlays must not leave focus behind the backdrop).
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();

    return () => {
      previouslyFocused?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      // Only the ✕ button is focusable inside the overlay — trap Tab.
      if (e.key === 'Tab') {
        e.preventDefault();
        closeBtnRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center cursor-zoom-out pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Full-size photo of ${alt}`}
    >
      <button
        ref={closeBtnRef}
        type="button"
        className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors z-10 flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"
        aria-label="Close photo"
      >
        <X className="h-6 w-6" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-[95vw] max-h-[95vh] object-contain"
      />
    </div>
  );
}
