'use client';

import { Badge } from '@/components/ui/badge';

type StatusType = 'active' | 'expiring_soon' | 'expired' | 'no_subscription';

interface StatusBadgeProps {
  status: StatusType;
  size?: 'sm' | 'md' | 'lg';
}

const statusConfig: Record<StatusType, { label: string; labelAm: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  active: {
    label: 'Active',
    labelAm: 'ንቁ',
    variant: 'default',
    className: 'bg-emerald-500 hover:bg-emerald-500 text-white border-emerald-500',
  },
  expiring_soon: {
    label: 'Expiring Soon',
    labelAm: 'በቅርብ ጊዜ ያበቃል',
    variant: 'default',
    className: 'bg-amber-500 hover:bg-amber-500 text-white border-amber-500',
  },
  expired: {
    label: 'Expired',
    labelAm: 'ያለፈ',
    variant: 'destructive',
    className: 'bg-red-500 hover:bg-red-500 text-white border-red-500',
  },
  no_subscription: {
    label: 'No Subscription',
    labelAm: 'ደንበኛነት የለም',
    variant: 'secondary',
    className: 'bg-gray-400 hover:bg-gray-400 text-white border-gray-400',
  },
};

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status];
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5',
  };

  return (
    <Badge
      variant={config.variant}
      className={`${config.className} ${sizeClasses[size]} font-medium rounded-full`}
    >
      <span className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${
          status === 'active' ? 'bg-white' :
          status === 'expiring_soon' ? 'bg-white animate-pulse' :
          status === 'expired' ? 'bg-white' :
          'bg-white'
        }`} />
        {config.label}
      </span>
    </Badge>
  );
}

export function getStatusColor(status: StatusType): string {
  const colors: Record<StatusType, string> = {
    active: 'emerald',
    expiring_soon: 'amber',
    expired: 'red',
    no_subscription: 'gray',
  };
  return colors[status];
}

export { type StatusType };
