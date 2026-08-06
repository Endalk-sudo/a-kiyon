'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PhotoLightbox } from '@/components/photo-lightbox';
import { getInitials } from '@/lib/format';

interface MemberAvatarProps {
  photo?: string | null;
  photoThumb?: string | null;
  firstName: string;
  lastName: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-14 w-14',
};

const textSizes = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

export function MemberAvatar({ photo, photoThumb, firstName, lastName, size = 'md' }: MemberAvatarProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const full = photo || photoThumb || null;
  const src = photoThumb || photo;
  const name = `${firstName} ${lastName}`;

  const avatar = (
    <Avatar className={sizeClasses[size]}>
      {src && <AvatarImage src={src} alt={name} loading="lazy" />}
      <AvatarFallback className={`${textSizes[size]} bg-primary/10 text-primary font-medium`}>
        {getInitials(firstName, lastName)}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <>
      {full ? (
        <button
          type="button"
          className="rounded-full overflow-hidden cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={(e) => {
            e.stopPropagation();
            setLightboxOpen(true);
          }}
          aria-label={`View full-size photo of ${name}`}
        >
          {avatar}
        </button>
      ) : (
        avatar
      )}
      {lightboxOpen && full && (
        <PhotoLightbox src={full} alt={name} onClose={() => setLightboxOpen(false)} />
      )}
    </>
  );
}
