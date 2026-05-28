'use client';

import { useState, useEffect, useCallback } from 'react';
import { invoicesApi } from '@/lib/api-client';
import { MemberAvatar } from '@/components/member-avatar';
import { formatCurrency, formatDate, formatMemberName, formatInvoiceStatus } from '@/lib/format';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  CheckCircle,
  Eye,
  Filter,
} from 'lucide-react';

// Types
interface InvoiceMember {
  id: string;
  firstName: string;
  lastName: string;
  photo?: string | null;
  phone?: string;
  email?: string;
}

interface InvoiceSubscription {
  id: string;
  serviceId: string;
  startDate: string;
  endDate: string;
  status: string;
  priceSnapshot?: number;
  service?: {
    id: string;
    name: string;
    nameAm?: string;
    price: number;
    duration: number;
  };
}

interface Payment {
  id: string;
  amount: number;
  paymentDate: string;
  method: string;
  receiptNumber: string;
  isVoided: boolean;
  notes?: string | null;
  user?: {
    id: string;
    name: string;
  };
}

interface InvoiceDetail {
  id: string;
  memberId: string;
  subscriptionId: string;
  amount: number;
  status: string;
  dueDate: string;
  paidAt?: string | null;
  createdAt: string;
  member: InvoiceMember;
  subscription: InvoiceSubscription;
  payments: Payment[];
}

interface InvoiceListItem {
  id: string;
  memberId: string;
  subscriptionId: string;
  amount: number;
  status: string;
  dueDate: string;
  paidAt?: string | null;
  member: InvoiceMember;
  subscription: {
    service: { name: string };
  };
}

interface InvoicesResponse {
  data: InvoiceListItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

type InvoiceStatus = 'all' | 'pending' | 'paid' | 'overdue' | 'cancelled';

const statusFilters: { value: InvoiceStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
];

function InvoiceStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: {
      label: 'Pending',
      className: 'bg-amber-500 hover:bg-amber-500 text-white border-amber-500',
    },
    paid: {
      label: 'Paid',
      className: 'bg-emerald-500 hover:bg-emerald-500 text-white border-emerald-500',
    },
    overdue: {
      label: 'Overdue',
      className: 'bg-red-500 hover:bg-red-500 text-white border-red-500',
    },
    cancelled: {
      label: 'Cancelled',
      className: 'bg-gray-400 hover:bg-gray-400 text-white border-gray-400',
    },
  };

  const c = config[status] || { label: formatInvoiceStatus(status), className: 'bg-gray-400 hover:bg-gray-400 text-white border-gray-400' };

  return (
    <Badge variant="default" className={`${c.className} text-xs px-2.5 py-0.5 font-medium rounded-full`}>
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-white" />
        {c.label}
      </span>
    </Badge>
  );
}

export function InvoicesPage() {
  const { session } = useAppStore();

  // Data state
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus>('all');

  // View invoice dialog state
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Mark as paid state
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

  // Check if user can manage invoices
  const canManage = session?.role === 'owner' || session?.role === 'manager';

  // Fetch invoices
  const fetchInvoices = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page,
        limit: 10,
      };
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      const response = await invoicesApi.list(params) as InvoicesResponse;
      setInvoices(response.data);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Failed to fetch invoices:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchInvoices(1);
  }, [fetchInvoices]);

  // Fetch invoice detail for view dialog
  const fetchInvoiceDetail = async (id: string) => {
    setLoadingDetail(true);
    setViewDialogOpen(true);
    try {
      const detail = await invoicesApi.get(id) as { data: InvoiceDetail };
      setSelectedInvoice(detail.data || (detail as unknown as InvoiceDetail));
    } catch (error) {
      console.error('Failed to fetch invoice detail:', error);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Handle mark as paid
  const handleMarkAsPaid = async (invoiceId: string) => {
    setMarkingPaidId(invoiceId);
    try {
      await invoicesApi.update(invoiceId, { status: 'paid' });
      fetchInvoices(pagination.page);
      // If viewing the same invoice, refresh detail
      if (selectedInvoice?.id === invoiceId) {
        const detail = await invoicesApi.get(invoiceId) as { data: InvoiceDetail };
        setSelectedInvoice(detail.data || (detail as unknown as InvoiceDetail));
      }
    } catch (error) {
      console.error('Failed to mark invoice as paid:', error);
    } finally {
      setMarkingPaidId(null);
    }
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    fetchInvoices(page);
  };

  // Format payment method
  const formatPaymentMethod = (method: string) => {
    const methods: Record<string, string> = {
      cash: 'Cash',
      bank_transfer: 'Bank Transfer',
      mobile_money: 'Mobile Money',
    };
    return methods[method] || method;
  };

  // Calculate total paid for an invoice detail
  const getTotalPaid = (invoice: InvoiceDetail | null) => {
    if (!invoice?.payments) return 0;
    return invoice.payments
      .filter((p) => !p.isVoided)
      .reduce((sum, p) => sum + p.amount, 0);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
        <p className="text-muted-foreground">Track and manage subscription invoices</p>
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
              <TableHead>Subscription</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Due Date (EC)</TableHead>
              <TableHead className="hidden lg:table-cell">Paid Date (EC)</TableHead>
              <TableHead>Actions</TableHead>
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
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-20" /></TableCell>
                </TableRow>
              ))
            ) : invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <p>No invoices found.</p>
                    {statusFilter !== 'all' && (
                      <p className="text-sm">Try changing the filter to see more results.</p>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <MemberAvatar
                        photo={invoice.member.photo}
                        firstName={invoice.member.firstName}
                        lastName={invoice.member.lastName}
                        size="sm"
                      />
                      <span className="font-medium text-sm">
                        {formatMemberName(invoice.member)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {invoice.subscription?.service?.name || 'N/A'}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {formatCurrency(invoice.amount)}
                  </TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={invoice.status} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    {formatDate(invoice.dueDate)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">
                    {invoice.paidAt ? formatDate(invoice.paidAt) : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => fetchInvoiceDetail(invoice.id)}
                        title="View details"
                      >
                        <Eye className="h-4 w-4" />
                        <span className="hidden sm:inline ml-1">View</span>
                      </Button>
                      {canManage && (invoice.status === 'pending' || invoice.status === 'overdue') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={() => handleMarkAsPaid(invoice.id)}
                          disabled={markingPaidId === invoice.id}
                          title="Mark as paid"
                        >
                          <CheckCircle className="h-4 w-4" />
                          <span className="hidden sm:inline ml-1">
                            {markingPaidId === invoice.id ? 'Paying...' : 'Pay'}
                          </span>
                        </Button>
                      )}
                    </div>
                  </TableCell>
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
            {pagination.total} invoices
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

      {/* View Invoice Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Invoice Details</DialogTitle>
          </DialogHeader>
          {loadingDetail ? (
            <div className="space-y-4 py-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
              <Separator />
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ) : selectedInvoice ? (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Invoice header info */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Invoice ID</p>
                  <p className="font-mono text-sm">{selectedInvoice.id}</p>
                </div>
                <InvoiceStatusBadge status={selectedInvoice.status} />
              </div>

              <Separator />

              {/* Member info */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground">Member</h4>
                <div className="flex items-center gap-3">
                  <MemberAvatar
                    photo={selectedInvoice.member.photo}
                    firstName={selectedInvoice.member.firstName}
                    lastName={selectedInvoice.member.lastName}
                    size="md"
                  />
                  <div>
                    <p className="font-medium">{formatMemberName(selectedInvoice.member)}</p>
                    {selectedInvoice.member.phone && (
                      <p className="text-sm text-muted-foreground">{selectedInvoice.member.phone}</p>
                    )}
                    {selectedInvoice.member.email && (
                      <p className="text-sm text-muted-foreground">{selectedInvoice.member.email}</p>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Subscription info */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground">Subscription</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Service</p>
                    <p className="font-medium">{selectedInvoice.subscription?.service?.name || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Duration</p>
                    <p className="font-medium">{selectedInvoice.subscription?.service?.duration || '-'} days</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Start Date</p>
                    <p className="font-medium">{formatDate(selectedInvoice.subscription?.startDate)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">End Date</p>
                    <p className="font-medium">{formatDate(selectedInvoice.subscription?.endDate)}</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Invoice details */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground">Invoice</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Amount</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedInvoice.amount)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Due Date</p>
                    <p className="font-medium">{formatDate(selectedInvoice.dueDate)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Paid Date</p>
                    <p className="font-medium">{selectedInvoice.paidAt ? formatDate(selectedInvoice.paidAt) : 'Not paid'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total Paid</p>
                    <p className="font-medium">{formatCurrency(getTotalPaid(selectedInvoice))}</p>
                  </div>
                </div>
              </div>

              {/* Payments */}
              {selectedInvoice.payments && selectedInvoice.payments.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-muted-foreground">
                      Payments ({selectedInvoice.payments.length})
                    </h4>
                    <div className="space-y-2">
                      {selectedInvoice.payments.map((payment) => (
                        <div
                          key={payment.id}
                          className={`rounded-lg border p-3 text-sm ${
                            payment.isVoided ? 'opacity-50 bg-muted/30' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-mono text-xs text-muted-foreground">
                                {payment.receiptNumber}
                              </span>
                              {payment.isVoided && (
                                <Badge variant="secondary" className="ml-2 text-xs">Voided</Badge>
                              )}
                            </div>
                            <span className="font-bold">{formatCurrency(payment.amount)}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              {formatPaymentMethod(payment.method)} &middot; {formatDate(payment.paymentDate)}
                            </span>
                            {payment.user && (
                              <span>By {payment.user.name}</span>
                            )}
                          </div>
                          {payment.notes && (
                            <p className="mt-1 text-xs text-muted-foreground italic">{payment.notes}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Mark as paid button */}
              {canManage && (selectedInvoice.status === 'pending' || selectedInvoice.status === 'overdue') && (
                <>
                  <Separator />
                  <Button
                    className="w-full"
                    onClick={() => handleMarkAsPaid(selectedInvoice.id)}
                    disabled={markingPaidId === selectedInvoice.id}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    {markingPaidId === selectedInvoice.id ? 'Marking as Paid...' : 'Mark as Paid'}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              Failed to load invoice details.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
