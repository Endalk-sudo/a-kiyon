'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  const src = photoThumb || photo;
  return (
    <Avatar className={sizeClasses[size]}>
      {src && <AvatarImage src={src} alt={`${firstName} ${lastName}`} loading="lazy" />}
      <AvatarFallback className={`${textSizes[size]} bg-primary/10 text-primary font-medium`}>
        {getInitials(firstName, lastName)}
      </AvatarFallback>
    </Avatar>
  );
}
