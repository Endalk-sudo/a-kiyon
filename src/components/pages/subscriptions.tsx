'use client';

import { useState, useEffect, useCallback } from 'react';
import { subscriptionsApi } from '@/lib/api-client';
import { MemberAvatar } from '@/components/member-avatar';
import { StatusBadge } from '@/components/status-badge';
import { formatCurrency, formatDate, formatMemberName } from '@/lib/format';
import { useAppStore } from '@/lib/store';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Filter,
  Ban,
  RefreshCw,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';

// Types
interface Member {
  id: string;
  firstName: string;
  lastName: string;
  photo?: string | null;
}

interface Subscription {
  id: string;
  memberId: string;
  serviceId: string;
  startDate: string;
  endDate: string;
  status: string;
  priceSnapshot: number;
  notes?: string | null;
  member: Member;
  service: { id: string; name: string; nameAm: string | null; price: number; duration: number };
}

interface SubscriptionsResponse {
  data: Subscription[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

type SubscriptionStatus = 'all' | 'active' | 'expired' | 'cancelled';

const statusFilters: { value: SubscriptionStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
];

function SubscriptionStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    active: {
      label: 'Active',
      className: 'bg-emerald-500 hover:bg-emerald-500 text-white border-emerald-500',
    },
    expired: {
      label: 'Expired',
      className: 'bg-red-500 hover:bg-red-500 text-white border-red-500',
    },
    cancelled: {
      label: 'Cancelled',
      className: 'bg-gray-400 hover:bg-gray-400 text-white border-gray-400',
    },
  };

  const c = config[status] || { label: status, className: '' };

  return (
    <Badge variant="default" className={`${c.className} text-xs px-2.5 py-0.5 font-medium rounded-full`}>
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-white" />
        {c.label}
      </span>
    </Badge>
  );
}

export function SubscriptionsPage() {
  const { session } = useAppStore();

  // Data state
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  // Renew dialog payment method
  const [renewPaymentMethod, setRenewPaymentMethod] = useState('cash');

  // Cancel subscription dialog state
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [subscriptionToCancel, setSubscriptionToCancel] = useState<Subscription | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Renew subscription dialog state
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const [subscriptionToRenew, setSubscriptionToRenew] = useState<Subscription | null>(null);
  const [renewing, setRenewing] = useState(false);

  // Fetch subscriptions
  const fetchSubscriptions = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page,
        limit: 10,
      };
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      if (searchDebounced) {
        params.search = searchDebounced;
      }
      const response = await subscriptionsApi.list(params) as SubscriptionsResponse;
      setSubscriptions(response.data);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Failed to fetch subscriptions:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchDebounced]);

  useEffect(() => {
    fetchSubscriptions(1);
  }, [fetchSubscriptions]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Handle cancel subscription
  const handleCancelSubscription = async () => {
    if (!subscriptionToCancel) return;
    setCancelling(true);
    try {
      await subscriptionsApi.update(subscriptionToCancel.id, { status: 'cancelled' });
      toast.success('Subscription cancelled');
      setCancelDialogOpen(false);
      setSubscriptionToCancel(null);
      fetchSubscriptions(pagination.page);
    } catch (error) {
      toast.error('Failed to cancel subscription');
      console.error('Failed to cancel subscription:', error);
    } finally {
      setCancelling(false);
    }
  };

  // Handle renew subscription
  const handleRenewSubscription = async () => {
    if (!subscriptionToRenew) return;
    setRenewing(true);
    try {
      const result = await subscriptionsApi.renew(subscriptionToRenew.id, { paymentMethod: renewPaymentMethod }) as {
        subscription: Subscription;
        payment: { id: string; amount: number; receiptNumber: string };
      };
      toast.success(
        `Subscription renewed! Payment of ${formatCurrency(result.payment?.amount || subscriptionToRenew.priceSnapshot)} recorded. Receipt: ${result.payment?.receiptNumber || ''}`
      );
      setRenewDialogOpen(false);
      setSubscriptionToRenew(null);
      fetchSubscriptions(pagination.page);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to renew subscription');
    } finally {
      setRenewing(false);
    }
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    fetchSubscriptions(page);
  };

  // Check if user can manage subscriptions
  const canManage = session?.role === 'owner' || session?.role === 'manager';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
          <p className="text-muted-foreground">Manage member subscriptions and renewals</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by member name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Status:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {statusFilters.map((filter) => (
            <Button
              key={filter.value}
              variant={statusFilter === filter.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Service</TableHead>
              <TableHead className="hidden md:table-cell">Start Date</TableHead>
              <TableHead className="hidden md:table-cell">End Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Price</TableHead>
              {canManage && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              // Loading skeleton
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-16" /></TableCell>
                  {canManage && <TableCell><Skeleton className="h-8 w-8" /></TableCell>}
                </TableRow>
              ))
            ) : subscriptions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 7 : 6} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <p>No subscriptions found.</p>
                    {statusFilter !== 'all' && (
                      <p className="text-sm">Try changing the filter to see more results.</p>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              subscriptions.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <MemberAvatar
                        photo={sub.member.photo}
                        firstName={sub.member.firstName}
                        lastName={sub.member.lastName}
                        size="sm"
                      />
                      <span className="font-medium text-sm">
                        {formatMemberName(sub.member)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{sub.service.name}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    {formatDate(sub.startDate)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    {formatDate(sub.endDate)}
                  </TableCell>
                  <TableCell>
                    <SubscriptionStatusBadge status={sub.status} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm font-medium">
                    {formatCurrency(sub.priceSnapshot)}
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {sub.status === 'active' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => {
                              setSubscriptionToCancel(sub);
                              setCancelDialogOpen(true);
                            }}
                            title="Cancel subscription"
                          >
                            <Ban className="h-4 w-4" />
                            <span className="hidden sm:inline ml-1">Cancel</span>
                          </Button>
                        )}
                        {(sub.status === 'expired' || sub.status === 'cancelled') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            onClick={() => {
                              setSubscriptionToRenew(sub);
                              setRenewDialogOpen(true);
                            }}
                            title="Renew subscription"
                          >
                            <RefreshCw className="h-4 w-4" />
                            <span className="hidden sm:inline ml-1">Renew</span>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!loading && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} subscriptions
          </p>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (pagination.page > 1) handlePageChange(pagination.page - 1);
                  }}
                  className={pagination.page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                .filter((page) => {
                  return (
                    page === 1 ||
                    page === pagination.totalPages ||
                    Math.abs(page - pagination.page) <= 1
                  );
                })
                .reduce<(number | 'ellipsis')[]>((acc, page, idx, arr) => {
                  if (idx > 0 && page - (arr[idx - 1] as number) > 1) {
                    acc.push('ellipsis');
                  }
                  acc.push(page);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === 'ellipsis' ? (
                    <PaginationItem key={`ellipsis-${idx}`}>
                      <span className="flex h-9 w-9 items-center justify-center text-muted-foreground">
                        ...
                      </span>
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={item as number}>
                      <PaginationLink
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          handlePageChange(item as number);
                        }}
                        isActive={pagination.page === item}
                        className="cursor-pointer"
                      >
                        {item as number}
                      </PaginationLink>
                    </PaginationItem>
                  )
                )}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (pagination.page < pagination.totalPages) handlePageChange(pagination.page + 1);
                  }}
                  className={pagination.page >= pagination.totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
            <AlertDialogDescription>
              {subscriptionToCancel && (
                <>
                  Are you sure you want to cancel the subscription for{' '}
                  <strong>{formatMemberName(subscriptionToCancel.member)}</strong> to{' '}
                  <strong>{subscriptionToCancel.service.name}</strong>?
                  This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep Subscription</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSubscription}
              disabled={cancelling}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {cancelling ? 'Cancelling...' : 'Cancel Subscription'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Renew Confirmation Dialog */}
      <Dialog open={renewDialogOpen} onOpenChange={setRenewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-emerald-600" />
              Renew Subscription
            </DialogTitle>
            <DialogDescription>
              Renew the subscription and record the payment in one step.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {subscriptionToRenew && (
              <>
                <p className="text-sm">
                  Renewing <strong>{subscriptionToRenew.service.name}</strong> for{' '}
                  <strong>{formatMemberName(subscriptionToRenew.member)}</strong>.
                </p>
                <div className="p-3 rounded-lg bg-muted/50 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Service:</span>
                    <span className="font-medium">{subscriptionToRenew.service.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price:</span>
                    <span className="font-bold text-emerald-600">{formatCurrency(subscriptionToRenew.priceSnapshot)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration:</span>
                    <span className="font-medium">{subscriptionToRenew.service.duration} days</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="renew-payment-method">Payment Method</Label>
                  <Select value={renewPaymentMethod} onValueChange={setRenewPaymentMethod}>
                    <SelectTrigger className="w-full" id="renew-payment-method">
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="mobile_money">Mobile Money</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewDialogOpen(false)} disabled={renewing}>
              Cancel
            </Button>
            <Button
              onClick={handleRenewSubscription}
              disabled={renewing}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {renewing ? 'Renewing...' : 'Confirm Renewal & Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
