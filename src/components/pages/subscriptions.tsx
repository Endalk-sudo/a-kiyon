'use client';

import { useState, useEffect, useCallback } from 'react';
import { subscriptionsApi, membersApi, servicesApi } from '@/lib/api-client';
import { EthiopianDateInput } from '@/components/ethiopian-date-input';
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
  DialogTrigger,
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
import { Textarea } from '@/components/ui/textarea';
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
  Plus,
  Search,
  Filter,
  Ban,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// Types
interface Member {
  id: string;
  firstName: string;
  lastName: string;
  photo?: string | null;
}

interface Service {
  id: string;
  name: string;
  price: number;
  duration: number;
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
  service: { name: string; price: number; duration: number };
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
  const [searchTerm, setSearchTerm] = useState('');

  // Add subscription dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [startDateValue, setStartDateValue] = useState('');
  const [startDateIso, setStartDateIso] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Cancel subscription dialog state
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [subscriptionToCancel, setSubscriptionToCancel] = useState<Subscription | null>(null);
  const [cancelling, setCancelling] = useState(false);

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
      const response = await subscriptionsApi.list(params) as SubscriptionsResponse;
      setSubscriptions(response.data);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Failed to fetch subscriptions:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  // Fetch members and services for the add dialog
  const fetchFormData = useCallback(async () => {
    try {
      const [membersRes, servicesRes] = await Promise.all([
        membersApi.list({ limit: 100, showDeleted: false }) as Promise<{ data: Member[] }>,
        servicesApi.list({ includeInactive: false }) as Promise<{ data: Service[] }>,
      ]);
      setMembers(membersRes.data || []);
      setServices(servicesRes.data || []);
    } catch (error) {
      console.error('Failed to fetch form data:', error);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptions(1);
  }, [fetchSubscriptions]);

  useEffect(() => {
    if (addDialogOpen) {
      fetchFormData();
      // Reset form
      setSelectedMemberId('');
      setSelectedServiceId('');
      setStartDateValue('');
      setStartDateIso(null);
      setNotes('');
      setFormError(null);
    }
  }, [addDialogOpen, fetchFormData]);

  // Handle add subscription
  const handleAddSubscription = async () => {
    if (!selectedMemberId) {
      setFormError('Please select a member.');
      return;
    }
    if (!selectedServiceId) {
      setFormError('Please select a service.');
      return;
    }
    if (!startDateIso) {
      setFormError('Please enter a valid start date.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      await subscriptionsApi.create({
        memberId: selectedMemberId,
        serviceId: selectedServiceId,
        startDate: startDateIso,
        notes: notes || undefined,
      });
      setAddDialogOpen(false);
      fetchSubscriptions(1);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to create subscription');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle cancel subscription
  const handleCancelSubscription = async () => {
    if (!subscriptionToCancel) return;
    setCancelling(true);
    try {
      await subscriptionsApi.update(subscriptionToCancel.id, { status: 'cancelled' });
      setCancelDialogOpen(false);
      setSubscriptionToCancel(null);
      fetchSubscriptions(pagination.page);
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
    } finally {
      setCancelling(false);
    }
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    fetchSubscriptions(page);
  };

  // Check if user can manage subscriptions
  const canManage = session?.role === 'owner' || session?.role === 'manager';

  // Selected service for end date preview
  const selectedService = services.find((s) => s.id === selectedServiceId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
          <p className="text-muted-foreground">Manage member subscriptions and services</p>
        </div>
        {canManage && (
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Subscription
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Subscription</DialogTitle>
                <DialogDescription>
                  Create a new subscription for a member. The end date will be calculated automatically based on the service duration.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
                {/* Member Select */}
                <div className="space-y-2">
                  <Label htmlFor="member-select">Member</Label>
                  <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                    <SelectTrigger className="w-full" id="member-select">
                      <SelectValue placeholder="Select a member" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.firstName} {member.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Service Select */}
                <div className="space-y-2">
                  <Label htmlFor="service-select">Service</Label>
                  <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                    <SelectTrigger className="w-full" id="service-select">
                      <SelectValue placeholder="Select a service" />
                    </SelectTrigger>
                    <SelectContent>
                      {services.map((service) => (
                        <SelectItem key={service.id} value={service.id}>
                          {service.name} - {formatCurrency(service.price)} ({service.duration} days)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedService && (
                    <p className="text-xs text-muted-foreground">
                      Duration: {selectedService.duration} days | Price: {formatCurrency(selectedService.price)}
                    </p>
                  )}
                </div>

                {/* Start Date */}
                <EthiopianDateInput
                  value={startDateValue}
                  onChange={(value, iso) => {
                    setStartDateValue(value);
                    setStartDateIso(iso);
                  }}
                  label="Start Date (EC)"
                  placeholder="dd/mm/yyyy"
                  required
                />

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="sub-notes">Notes (Optional)</Label>
                  <Textarea
                    id="sub-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any additional notes..."
                    rows={3}
                  />
                </div>

                {formError && (
                  <p className="text-sm text-red-500">{formError}</p>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAddDialogOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button onClick={handleAddSubscription} disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Subscription'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
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
              <TableHead className="hidden md:table-cell">Start Date (EC)</TableHead>
              <TableHead className="hidden md:table-cell">End Date (EC)</TableHead>
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
                      {sub.status === 'active' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            setSubscriptionToCancel(sub);
                            setCancelDialogOpen(true);
                          }}
                        >
                          <Ban className="h-4 w-4 mr-1" />
                          <span className="hidden sm:inline">Cancel</span>
                        </Button>
                      )}
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
                  // Show first, last, current, and adjacent pages
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
                  This will also cancel any pending invoices associated with this subscription.
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
    </div>
  );
}
