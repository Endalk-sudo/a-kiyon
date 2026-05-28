'use client';

import { useState, useEffect, useCallback } from 'react';
import { paymentsApi, invoicesApi, membersApi } from '@/lib/api-client';
import { EthiopianDateInput } from '@/components/ethiopian-date-input';
import { MemberAvatar } from '@/components/member-avatar';
import { formatCurrency, formatDate, formatMemberName, formatPaymentMethod } from '@/lib/format';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
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

interface InvoiceInfo {
  id: string;
  amount: number;
  status: string;
  dueDate: string;
  subscription?: {
    service?: { name: string };
  };
}

interface PaymentRecord {
  id: string;
  invoiceId: string;
  memberId: string;
  amount: number;
  paymentDate: string;
  method: string;
  receiptNumber: string;
  isVoided: boolean;
  voidedAt: string | null;
  notes: string | null;
  member: MemberInfo;
  invoice: InvoiceInfo;
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

interface MemberOption {
  id: string;
  firstName: string;
  lastName: string;
  photo?: string | null;
}

interface PendingInvoice {
  id: string;
  amount: number;
  status: string;
  dueDate: string;
  subscription?: {
    service?: { name: string };
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
// PaymentsPage Component
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

  // ---- Record Payment dialog ----
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [pendingInvoices, setPendingInvoices] = useState<PendingInvoice[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentDateIso, setPaymentDateIso] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

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

  // ---- Fetch members for Record Payment ----
  useEffect(() => {
    if (!recordDialogOpen) return;
    let cancelled = false;
    setLoadingMembers(true);
    (async () => {
      try {
        const result = (await membersApi.list({ limit: 200 })) as {
          data: MemberOption[];
        };
        if (!cancelled) {
          setMembers(result.data || []);
        }
      } catch {
        if (!cancelled) toast.error('Failed to load members');
      } finally {
        if (!cancelled) setLoadingMembers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recordDialogOpen]);

  // ---- Fetch pending invoices when member selected ----
  useEffect(() => {
    if (!selectedMemberId) {
      setPendingInvoices([]);
      setSelectedInvoiceId('');
      setPaymentAmount('');
      return;
    }
    let cancelled = false;
    setLoadingInvoices(true);
    (async () => {
      try {
        const result = (await invoicesApi.list({
          memberId: selectedMemberId,
          status: 'pending',
          limit: 50,
        })) as { data: PendingInvoice[] };
        if (!cancelled) {
          const invoices = result.data || [];
          // Also include overdue invoices
          const overdueResult = (await invoicesApi.list({
            memberId: selectedMemberId,
            status: 'overdue',
            limit: 50,
          })) as { data: PendingInvoice[] };
          const allPending = [...invoices, ...(overdueResult.data || [])];
          setPendingInvoices(allPending);
          if (allPending.length === 1) {
            setSelectedInvoiceId(allPending[0].id);
            setPaymentAmount(String(allPending[0].amount));
          }
        }
      } catch {
        if (!cancelled) toast.error('Failed to load invoices');
      } finally {
        if (!cancelled) setLoadingInvoices(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedMemberId]);

  // ---- Handle invoice selection ----
  const handleInvoiceSelect = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    const inv = pendingInvoices.find((i) => i.id === invoiceId);
    if (inv) {
      setPaymentAmount(String(inv.amount));
    }
  };

  // ---- Submit record payment ----
  const handleRecordPayment = async () => {
    if (!selectedMemberId) {
      toast.error('Please select a member');
      return;
    }
    if (!selectedInvoiceId) {
      toast.error('Please select an invoice');
      return;
    }
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (!paymentDateIso) {
      toast.error('Please enter a valid Ethiopian date');
      return;
    }

    setSubmitting(true);
    try {
      await paymentsApi.create({
        invoiceId: selectedInvoiceId,
        memberId: selectedMemberId,
        amount: parseFloat(paymentAmount),
        paymentDate: paymentDateIso,
        method: paymentMethod,
        notes: paymentNotes || undefined,
      });
      toast.success('Payment recorded successfully');
      resetRecordForm();
      setRecordDialogOpen(false);
      fetchPayments(pagination.page);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const resetRecordForm = () => {
    setSelectedMemberId('');
    setSelectedInvoiceId('');
    setPaymentAmount('');
    setPaymentDate('');
    setPaymentDateIso(null);
    setPaymentMethod('cash');
    setPaymentNotes('');
    setPendingInvoices([]);
  };

  // ---- Print receipt ----
  const handlePrintReceipt = (payment: PaymentRecord) => {
    const memberName = formatMemberName(payment.member);
    const serviceName =
      payment.invoice?.subscription?.service?.name || 'N/A';
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
            <h1>FCMS</h1>
            <p>Fitness Center Management System</p>
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

  // ---- Selected member for avatar display ----
  const selectedMember = members.find((m) => m.id === selectedMemberId);

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
            Manage payment records, print receipts, and void transactions
          </p>
        </div>
        <Button onClick={() => setRecordDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Record Payment
        </Button>
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

      {/* ===== Record Payment Dialog ===== */}
      <Dialog open={recordDialogOpen} onOpenChange={(open) => {
        if (!open) resetRecordForm();
        setRecordDialogOpen(open);
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Create a new payment record for a member&apos;s pending invoice.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Select Member */}
            <div className="space-y-2">
              <Label htmlFor="select-member">Member</Label>
              <Select
                value={selectedMemberId}
                onValueChange={(val) => {
                  setSelectedMemberId(val);
                  setSelectedInvoiceId('');
                  setPaymentAmount('');
                }}
                disabled={loadingMembers}
              >
                <SelectTrigger id="select-member">
                  <SelectValue placeholder={loadingMembers ? 'Loading members...' : 'Select a member'} />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.firstName} {m.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedMember && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <MemberAvatar
                    photo={selectedMember.photo}
                    firstName={selectedMember.firstName}
                    lastName={selectedMember.lastName}
                    size="lg"
                  />
                  <div>
                    <p className="font-semibold">
                      {selectedMember.firstName} {selectedMember.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">Member selected</p>
                  </div>
                </div>
              )}
            </div>

            {/* Select Invoice */}
            {selectedMemberId && (
              <div className="space-y-2">
                <Label htmlFor="select-invoice">Invoice</Label>
                {loadingInvoices ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : pendingInvoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    No pending invoices found for this member.
                  </p>
                ) : (
                  <Select
                    value={selectedInvoiceId}
                    onValueChange={handleInvoiceSelect}
                  >
                    <SelectTrigger id="select-invoice">
                      <SelectValue placeholder="Select an invoice" />
                    </SelectTrigger>
                    <SelectContent>
                      {pendingInvoices.map((inv) => (
                        <SelectItem key={inv.id} value={inv.id}>
                          {inv.subscription?.service?.name || 'Invoice'} —{' '}
                          {formatCurrency(inv.amount)} (Due: {formatDate(inv.dueDate)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="payment-amount">Amount (ETB)</Label>
              <Input
                id="payment-amount"
                type="number"
                min="0"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            {/* Payment Date (Ethiopian) */}
            <EthiopianDateInput
              value={paymentDate}
              onChange={(val, iso) => {
                setPaymentDate(val);
                setPaymentDateIso(iso);
              }}
              label="Payment Date (EC)"
              required
            />

            {/* Payment Method */}
            <div className="space-y-2">
              <Label htmlFor="payment-method">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="payment-method">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="payment-notes">Notes (optional)</Label>
              <Textarea
                id="payment-notes"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                resetRecordForm();
                setRecordDialogOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRecordPayment}
              disabled={submitting || !selectedInvoiceId || !paymentDateIso}
            >
              {submitting ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Recording...
                </>
              ) : (
                'Record Payment'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  This action cannot be undone. The invoice status will be reverted if
                  applicable.
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
