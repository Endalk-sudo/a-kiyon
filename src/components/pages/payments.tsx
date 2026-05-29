'use client';

import { useState, useEffect, useCallback } from 'react';
import { paymentsApi } from '@/lib/api-client';
import { MemberAvatar } from '@/components/member-avatar';
import { formatCurrency, formatDate, formatMemberName, formatPaymentMethod } from '@/lib/format';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Printer,
  Ban,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemberInfo {
  id: string;
  firstName: string;
  lastName: string;
  photo?: string | null;
}

interface SubscriptionInfo {
  service?: { name: string };
}

interface PaymentRecord {
  id: string;
  memberId: string;
  amount: number;
  paymentDate: string;
  method: string;
  receiptNumber: string;
  isVoided: boolean;
  voidedAt: string | null;
  notes: string | null;
  member: MemberInfo;
  subscription: SubscriptionInfo;
}

interface PaymentsResponse {
  data: PaymentRecord[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// Payment method filter options
// ---------------------------------------------------------------------------

const methodFilters = [
  { value: 'all', label: 'All Methods' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'mobile_money', label: 'Mobile Money' },
] as const;

// ---------------------------------------------------------------------------
// PaymentsPage Component (read-only history)
// ---------------------------------------------------------------------------

export function PaymentsPage() {
  const { session } = useAppStore();
  const isOwner = session?.role === 'owner';

  // ---- Table state ----
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [methodFilter, setMethodFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // ---- Void Payment ----
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<PaymentRecord | null>(null);
  const [voiding, setVoiding] = useState(false);

  // ---- Fetch payments ----
  const fetchPayments = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params: Record<string, unknown> = {
          page,
          limit: pagination.limit,
        };
        if (methodFilter !== 'all') {
          params.method = methodFilter;
        }
        const result = (await paymentsApi.list(params)) as PaymentsResponse;
        setPayments(result.data || []);
        setPagination(result.pagination || { total: 0, page: 1, limit: 10, totalPages: 0 });
      } catch {
        toast.error('Failed to load payments');
      } finally {
        setLoading(false);
      }
    },
    [methodFilter, pagination.limit]
  );

  useEffect(() => {
    fetchPayments(1);
  }, [methodFilter, fetchPayments]);

  // ---- Print receipt ----
  const handlePrintReceipt = (payment: PaymentRecord) => {
    const memberName = formatMemberName(payment.member);
    const serviceName =
      payment.subscription?.service?.name || 'N/A';
    const amountFormatted = formatCurrency(payment.amount);
    const dateFormatted = formatDate(payment.paymentDate);
    const methodFormatted = formatPaymentMethod(payment.method);

    const receiptHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt - ${payment.receiptNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: 'Courier New', monospace;
              max-width: 320px;
              margin: 20px auto;
              padding: 20px;
              color: #000;
            }
            .header {
              text-align: center;
              border-bottom: 2px dashed #000;
              padding-bottom: 12px;
              margin-bottom: 12px;
            }
            .header h1 {
              font-size: 20px;
              margin-bottom: 4px;
            }
            .header p {
              font-size: 11px;
              color: #555;
            }
            .row {
              display: flex;
              justify-content: space-between;
              padding: 4px 0;
              font-size: 13px;
            }
            .row .label { color: #555; }
            .row .value { font-weight: bold; }
            .separator {
              border-top: 1px dashed #999;
              margin: 10px 0;
            }
            .amount {
              text-align: center;
              padding: 14px 0;
              border-top: 2px dashed #000;
              border-bottom: 2px dashed #000;
              margin: 10px 0;
            }
            .amount .value {
              font-size: 26px;
              font-weight: bold;
            }
            .amount .currency {
              font-size: 12px;
              color: #555;
            }
            .footer {
              text-align: center;
              margin-top: 16px;
              font-size: 12px;
              color: #555;
            }
            .footer .thanks {
              font-size: 14px;
              font-weight: bold;
              color: #000;
              margin-bottom: 4px;
            }
            @media print {
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>A-kiyon</h1>
            <p>Fitness Center</p>
          </div>
          <div class="row">
            <span class="label">Receipt #</span>
            <span class="value">${payment.receiptNumber}</span>
          </div>
          <div class="row">
            <span class="label">Date</span>
            <span class="value">${dateFormatted}</span>
          </div>
          <div class="separator"></div>
          <div class="row">
            <span class="label">Member</span>
            <span class="value">${memberName}</span>
          </div>
          <div class="row">
            <span class="label">Service</span>
            <span class="value">${serviceName}</span>
          </div>
          <div class="row">
            <span class="label">Method</span>
            <span class="value">${methodFormatted}</span>
          </div>
          ${payment.notes ? `<div class="row"><span class="label">Notes</span><span class="value">${payment.notes}</span></div>` : ''}
          <div class="amount">
            <div class="currency">Amount (ETB)</div>
            <div class="value">${amountFormatted}</div>
          </div>
          <div class="footer">
            <div class="thanks">Thank you for your payment!</div>
            <p>This is a computer-generated receipt.</p>
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (printWindow) {
      printWindow.document.write(receiptHtml);
      printWindow.document.close();
    } else {
      toast.error('Please allow popups to print receipts');
    }
  };

  // ---- Void payment ----
  const handleVoidPayment = async () => {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await paymentsApi.void(voidTarget.id);
      toast.success('Payment voided successfully');
      setVoidDialogOpen(false);
      setVoidTarget(null);
      fetchPayments(pagination.page);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to void payment');
    } finally {
      setVoiding(false);
    }
  };

  const openVoidDialog = (payment: PaymentRecord) => {
    setVoidTarget(payment);
    setVoidDialogOpen(true);
  };

  // ---- Pagination ----
  const goToPage = (page: number) => {
    if (page < 1 || page > pagination.totalPages) return;
    fetchPayments(page);
  };

  // ---- Compute filtered payments for client-side search ----
  const displayedPayments = searchQuery
    ? payments.filter(
        (p) =>
          p.receiptNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
          formatMemberName(p.member).toLowerCase().includes(searchQuery.toLowerCase())
      )
    : payments;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Payments</h2>
          <p className="text-muted-foreground text-sm">
            View payment history recorded from subscriptions
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by receipt # or member name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by method" />
              </SelectTrigger>
              <SelectContent>
                {methodFilters.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Records
            {pagination.total > 0 && (
              <Badge variant="secondary" className="ml-1">
                {pagination.total} total
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt #</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Date (EC)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : displayedPayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      No payments found
                    </TableCell>
                  </TableRow>
                ) : (
                  displayedPayments.map((payment) => (
                    <TableRow
                      key={payment.id}
                      className={payment.isVoided ? 'opacity-50 bg-muted/30' : ''}
                    >
                      <TableCell className="font-mono text-sm">
                        {payment.receiptNumber}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <MemberAvatar
                            photo={payment.member.photo}
                            firstName={payment.member.firstName}
                            lastName={payment.member.lastName}
                            size="sm"
                          />
                          <span className="font-medium">
                            {formatMemberName(payment.member)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          {formatPaymentMethod(payment.method)}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                      <TableCell>
                        {payment.isVoided ? (
                          <Badge
                            variant="destructive"
                            className="bg-gray-500 hover:bg-gray-500 text-white border-gray-500"
                          >
                            VOIDED
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white border-emerald-500">
                            Completed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!payment.isVoided && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handlePrintReceipt(payment)}
                              title="Print Receipt"
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                          )}
                          {isOwner && !payment.isVoided && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openVoidDialog(payment)}
                              title="Void Payment"
                              className="text-destructive hover:text-destructive"
                            >
                              <Ban className="h-4 w-4" />
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

          {/* Mobile card layout */}
          <div className="md:hidden space-y-3 p-4 max-h-[600px] overflow-y-auto">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4 space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                  </CardContent>
                </Card>
              ))
            ) : displayedPayments.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                No payments found
              </div>
            ) : (
              displayedPayments.map((payment) => (
                <Card
                  key={payment.id}
                  className={payment.isVoided ? 'opacity-50' : ''}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-muted-foreground">
                        {payment.receiptNumber}
                      </span>
                      {payment.isVoided ? (
                        <Badge
                          variant="destructive"
                          className="bg-gray-500 hover:bg-gray-500 text-white border-gray-500"
                        >
                          VOIDED
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white border-emerald-500">
                          Completed
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <MemberAvatar
                        photo={payment.member.photo}
                        firstName={payment.member.firstName}
                        lastName={payment.member.lastName}
                        size="sm"
                      />
                      <span className="font-medium">
                        {formatMemberName(payment.member)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Amount</p>
                        <p className="font-semibold">{formatCurrency(payment.amount)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Method</p>
                        <Badge variant="outline" className="font-normal">
                          {formatPaymentMethod(payment.method)}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Date</p>
                        <p className="text-sm">{formatDate(payment.paymentDate)}</p>
                      </div>
                    </div>
                    {!payment.isVoided && (
                      <div className="flex gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handlePrintReceipt(payment)}
                        >
                          <Printer className="h-3 w-3 mr-1" />
                          Print
                        </Button>
                        {isOwner && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-destructive hover:text-destructive"
                            onClick={() => openVoidDialog(payment)}
                          >
                            <Ban className="h-3 w-3 mr-1" />
                            Void
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} &middot;{' '}
            {pagination.total} records
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ===== Void Payment AlertDialog ===== */}
      <AlertDialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void Payment</AlertDialogTitle>
            <AlertDialogDescription>
              {voidTarget && (
                <>
                  Are you sure you want to void payment{' '}
                  <span className="font-semibold">{voidTarget.receiptNumber}</span> for{' '}
                  <span className="font-semibold">
                    {formatMemberName(voidTarget.member)}
                  </span>{' '}
                  of <span className="font-semibold">{formatCurrency(voidTarget.amount)}</span>?
                  This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={voiding}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleVoidPayment}
              disabled={voiding}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {voiding ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Voiding...
                </>
              ) : (
                'Void Payment'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
