'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/format';

interface MemberAvatarProps {
  photo?: string | null;
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

export function MemberAvatar({ photo, firstName, lastName, size = 'md' }: MemberAvatarProps) {
  return (
    <Avatar className={sizeClasses[size]}>
      {photo && <AvatarImage src={photo} alt={`${firstName} ${lastName}`} />}
      <AvatarFallback className={`${textSizes[size]} bg-primary/10 text-primary font-medium`}>
        {getInitials(firstName, lastName)}
      </AvatarFallback>
    </Avatar>
  );
}
