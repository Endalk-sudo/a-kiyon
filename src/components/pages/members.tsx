'use client';

import { useCallback, useEffect, useState } from 'react';
import { membersApi, servicesApi, subscriptionsApi } from '@/lib/api-client';
import { StatusBadge, type StatusType } from '@/components/status-badge';
import { MemberAvatar } from '@/components/member-avatar';
import { PhotoCapture } from '@/components/photo-capture';
import { formatCurrency, formatDate, formatMemberName } from '@/lib/format';
import { useAppStore } from '@/lib/store';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';

import { EthiopianDateInput } from '@/components/ethiopian-date-input';
import { Card, CardContent } from '@/components/ui/card';
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
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search,
  Plus,
  Eye,
  Pencil,
  Trash2,
  RotateCcw,
  Phone,
  AlertTriangle,
  Users,
  UserPlus,
  MapPin,
  Scale,
  Ruler,
  Droplets,
  Heart,
  RefreshCw,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  photo: string | null;
  address: string | null;
  weight: number | null;
  height: number | null;
  bloodType: string | null;
  emergencyContact: string | null;
  notes: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  status: StatusType;
  subscriptionEndDate: string | null;
}

interface MemberDetail extends Member {
  subscriptions: Array<{
    id: string;
    startDate: string;
    endDate: string;
    status: string;
    priceSnapshot: number;
    notes: string | null;
    service: { id: string; name: string; nameAm: string | null };
    payments: Array<{
      id: string;
      amount: number;
      paymentDate: string;
      method: string;
      receiptNumber: string;
      isVoided: boolean;
    }>;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    paymentDate: string;
    method: string;
    receiptNumber: string;
    isVoided: boolean;
    createdAt: string;
    subscription: {
      service: { name: string } | null;
    } | null;
  }>;
}

interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface MemberFormData {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  weight: string;
  height: string;
  bloodType: string;
  emergencyContact: string;
  notes: string;
  photo: string | null;
}

const emptyFormData: MemberFormData = {
  firstName: '',
  lastName: '',
  phone: '',
  address: '',
  weight: '',
  height: '',
  bloodType: '',
  emergencyContact: '',
  notes: '',
  photo: null,
};

const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const statusFilters: { value: StatusType | 'all'; label: string; color: string }[] = [
  { value: 'all', label: 'All', color: '' },
  { value: 'active', label: 'Active', color: 'bg-emerald-500 text-white hover:bg-emerald-600' },
  { value: 'expiring_soon', label: 'Expiring Soon', color: 'bg-amber-500 text-white hover:bg-amber-600' },
  { value: 'expired', label: 'Expired', color: 'bg-red-500 text-white hover:bg-red-600' },
  { value: 'no_subscription', label: 'No Subscription', color: 'bg-gray-400 text-white hover:bg-gray-500' },
];

const PAGE_LIMIT = 20;

// ─── Component ───────────────────────────────────────────────────────────────

export function MembersPage() {
  const { session } = useAppStore();
  const isMobile = useIsMobile();

  const isOwner = session?.role === 'owner';
  const isManagerOrAbove = session?.role === 'owner' || session?.role === 'manager';

  // ─── State ───────────────────────────────────────────────────────────────

  const [members, setMembers] = useState<Member[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    total: 0,
    page: 1,
    limit: PAGE_LIMIT,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusType | 'all'>('all');
  const [showDeleted, setShowDeleted] = useState(false);

  // Dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);

  // Selected member for actions
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [memberDetail, setMemberDetail] = useState<MemberDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Form data
  const [formData, setFormData] = useState<MemberFormData>(emptyFormData);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof MemberFormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  // Optional subscription on create
  const [addWithSubscription, setAddWithSubscription] = useState(false);
  const [availableServices, setAvailableServices] = useState<Array<{ id: string; name: string; price: number; duration: number }>>([]);
  const [newServiceId, setNewServiceId] = useState('');
  const [newPaymentMethod, setNewPaymentMethod] = useState('cash');
  const [newPaymentDate, setNewPaymentDate] = useState('');
  const [newPaymentDateIso, setNewPaymentDateIso] = useState<string | null>(null);
  const [newSubscriptionNotes, setNewSubscriptionNotes] = useState('');

  // ─── Fetch Members ──────────────────────────────────────────────────────

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page: pagination.page,
        limit: PAGE_LIMIT,
      };
      if (searchDebounced) params.search = searchDebounced;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (showDeleted) params.showDeleted = true;

      const result = await membersApi.list(params) as { data: Member[]; pagination: PaginationInfo };
      setMembers(result.data || []);
      setPagination((prev) => ({
        ...result.pagination,
        page: prev.page,
      }));
    } catch (err) {
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, searchDebounced, statusFilter, showDeleted]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search);
      setPagination((prev) => ({ ...prev, page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page when filters change
  useEffect(() => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, [statusFilter, showDeleted]);

  // ─── Fetch Member Detail ────────────────────────────────────────────────

  const fetchMemberDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const detail = await membersApi.get(id) as MemberDetail;
      setMemberDetail(detail);
    } catch {
      toast.error('Failed to load member details');
    } finally {
      setDetailLoading(false);
    }
  };

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleViewMember = (member: Member) => {
    setSelectedMember(member);
    setViewDialogOpen(true);
    fetchMemberDetail(member.id);
  };

  const handleEditMember = (member: Member) => {
    setSelectedMember(member);
    setFormData({
      firstName: member.firstName,
      lastName: member.lastName,
      phone: member.phone || '',
      address: member.address || '',
      weight: member.weight?.toString() || '',
      height: member.height?.toString() || '',
      bloodType: member.bloodType || '',
      emergencyContact: member.emergencyContact || '',
      notes: member.notes || '',
      photo: member.photo || null,
    });
    setFormErrors({});
    setEditDialogOpen(true);
  };

  const handleDeleteMember = (member: Member) => {
    setSelectedMember(member);
    setDeleteDialogOpen(true);
  };

  const handleRestoreMember = (member: Member) => {
    setSelectedMember(member);
    setRestoreDialogOpen(true);
  };

  const handleAddMember = () => {
    setFormData(emptyFormData);
    setFormErrors({});
    setAddWithSubscription(false);
    setNewServiceId('');
    setNewPaymentMethod('cash');
    setNewPaymentDate('');
    setNewPaymentDateIso(null);
    setNewSubscriptionNotes('');
    setAddDialogOpen(true);
    servicesApi.list({ includeInactive: false }).then((res) => {
      setAvailableServices((res as { data: Array<{ id: string; name: string; price: number; duration: number }> }).data || []);
    }).catch(() => {});
  };

  // ─── Form Validation ────────────────────────────────────────────────────

  const validateForm = (data: MemberFormData): boolean => {
    const errors: Partial<Record<keyof MemberFormData, string>> = {};
    if (!data.firstName.trim()) errors.firstName = 'First name is required';
    if (!data.lastName.trim()) errors.lastName = 'Last name is required';
    if (data.weight && (isNaN(Number(data.weight)) || Number(data.weight) <= 0)) {
      errors.weight = 'Weight must be a positive number';
    }
    if (data.height && (isNaN(Number(data.height)) || Number(data.height) <= 0)) {
      errors.height = 'Height must be a positive number';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ─── Submit Handlers ────────────────────────────────────────────────────

  const handleCreateMember = async () => {
    if (!validateForm(formData)) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phone: formData.phone.trim() || null,
        photo: formData.photo,
        address: formData.address.trim() || null,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        height: formData.height ? parseFloat(formData.height) : null,
        bloodType: formData.bloodType || null,
        emergencyContact: formData.emergencyContact.trim() || null,
        notes: formData.notes.trim() || null,
      };
      if (addWithSubscription && newServiceId) {
        payload.serviceId = newServiceId;
        payload.paymentMethod = newPaymentMethod;
        if (newPaymentDateIso) payload.paymentDate = newPaymentDateIso;
        if (newSubscriptionNotes) payload.subscriptionNotes = newSubscriptionNotes;
      }
      await membersApi.create(payload);
      toast.success(addWithSubscription ? 'Member created and subscribed successfully' : 'Member created successfully');
      setAddDialogOpen(false);
      setFormData(emptyFormData);
      fetchMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateMember = async () => {
    if (!selectedMember || !validateForm(formData)) return;
    setSubmitting(true);
    try {
      await membersApi.update(selectedMember.id, {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phone: formData.phone.trim() || null,
        photo: formData.photo,
        address: formData.address.trim() || null,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        height: formData.height ? parseFloat(formData.height) : null,
        bloodType: formData.bloodType || null,
        emergencyContact: formData.emergencyContact.trim() || null,
        notes: formData.notes.trim() || null,
      });
      toast.success('Member updated successfully');
      setEditDialogOpen(false);
      fetchMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedMember) return;
    try {
      await membersApi.delete(selectedMember.id);
      toast.success('Member deleted successfully');
      setDeleteDialogOpen(false);
      fetchMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete member');
    }
  };

  const handleConfirmRestore = async () => {
    if (!selectedMember) return;
    try {
      await membersApi.restore(selectedMember.id);
      toast.success('Member restored successfully');
      setRestoreDialogOpen(false);
      fetchMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restore member');
    }
  };

  // ─── Pagination helpers ─────────────────────────────────────────────────

  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const pages: (number | 'ellipsis')[] = [];
    const total = pagination.totalPages;

    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      if (pagination.page > 3) pages.push('ellipsis');
      const start = Math.max(2, pagination.page - 1);
      const end = Math.min(total - 1, pagination.page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (pagination.page < total - 2) pages.push('ellipsis');
      pages.push(total);
    }
    return pages;
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" />
            Members
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage your members
          </p>
        </div>
        {isManagerOrAbove && (
          <Button onClick={handleAddMember} className="shrink-0">
            <UserPlus className="h-4 w-4 mr-2" />
            Add Member
          </Button>
        )}
      </div>

      {/* Search & Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {statusFilters.map((filter) => (
              <Button
                key={filter.value}
                variant={statusFilter === filter.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(filter.value)}
                className={
                  statusFilter === filter.value && filter.value !== 'all'
                    ? filter.color
                    : ''
                }
              >
                {filter.label}
              </Button>
            ))}
            {isOwner && (
              <>
                <Separator orientation="vertical" className="h-6 mx-1 hidden sm:block" />
                <div className="flex items-center gap-2">
                  <Switch id="show-deleted" checked={showDeleted} onCheckedChange={setShowDeleted} />
                  <Label htmlFor="show-deleted" className="text-sm cursor-pointer">Show Deleted</Label>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Members Count */}
      <div className="text-sm text-muted-foreground">
        {loading ? <Skeleton className="h-4 w-32" /> : `${pagination.total} member${pagination.total !== 1 ? 's' : ''} found`}
      </div>

      {/* Members List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : members.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold text-lg">No members found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {search || statusFilter !== 'all' ? 'Try adjusting your search or filters' : 'Get started by adding your first member'}
            </p>
            {isManagerOrAbove && !search && statusFilter === 'all' && (
              <Button onClick={handleAddMember} className="mt-4">
                <UserPlus className="h-4 w-4 mr-2" /> Add Member
              </Button>
            )}
          </CardContent>
        </Card>
      ) : isMobile ? (
        <div className="space-y-3">
          {members.map((member) => (
            <MemberCard key={member.id} member={member} isOwner={isOwner} isManagerOrAbove={isManagerOrAbove}
              onView={handleViewMember} onEdit={handleEditMember} onDelete={handleDeleteMember} onRestore={handleRestoreMember} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[280px]">Member</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Blood</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Expires</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id} className={member.isDeleted ? 'opacity-60' : ''}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <MemberAvatar photo={member.photo} firstName={member.firstName} lastName={member.lastName} size="sm" />
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {formatMemberName(member)}
                            {member.isDeleted && (
                              <Badge variant="outline" className="ml-2 text-xs text-destructive border-destructive">Deleted</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{member.phone || '—'}</TableCell>
                    <TableCell>
                      {member.bloodType ? (
                        <Badge variant="outline" className="text-xs text-red-600 border-red-200 bg-red-50">
                          <Droplets className="h-3 w-3 mr-1" />{member.bloodType}
                        </Badge>
                      ) : '—'}
                    </TableCell>
                    <TableCell><StatusBadge status={member.status} size="sm" /></TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {member.subscriptionEndDate ? formatDate(member.subscriptionEndDate) : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(member.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <MemberActions member={member} isOwner={isOwner} isManagerOrAbove={isManagerOrAbove}
                        onView={handleViewMember} onEdit={handleEditMember} onDelete={handleDeleteMember} onRestore={handleRestoreMember} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center pt-2">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
                  className={pagination.page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
              </PaginationItem>
              {getPageNumbers().map((page, idx) =>
                page === 'ellipsis' ? (
                  <PaginationItem key={`e-${idx}`}><PaginationEllipsis /></PaginationItem>
                ) : (
                  <PaginationItem key={page}>
                    <PaginationLink isActive={pagination.page === page} onClick={() => setPagination((p) => ({ ...p, page }))} className="cursor-pointer">{page}</PaginationLink>
                  </PaginationItem>
                )
              )}
              <PaginationItem>
                <PaginationNext onClick={() => setPagination((p) => ({ ...p, page: Math.min(p.totalPages, p.page + 1) }))}
                  className={pagination.page >= pagination.totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* ─── Add Member Dialog ──────────────────────────────────────────── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Member</DialogTitle>
            <DialogDescription>Enter member information and photo.</DialogDescription>
          </DialogHeader>
          <MemberForm formData={formData} setFormData={setFormData} formErrors={formErrors} />

          {/* Optional initial subscription */}
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Switch
                id="add-subscription"
                checked={addWithSubscription}
                onCheckedChange={setAddWithSubscription}
              />
              <Label htmlFor="add-subscription" className="text-sm font-medium cursor-pointer">
                Add initial subscription
              </Label>
            </div>
            {addWithSubscription && (
              <div className="space-y-3 pl-1 border-l-2 border-muted pl-4">
                <div className="space-y-2">
                  <Label htmlFor="sub-service">Service</Label>
                  <Select value={newServiceId} onValueChange={setNewServiceId}>
                    <SelectTrigger id="sub-service">
                      <SelectValue placeholder="Select a service" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableServices.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} — {formatCurrency(s.price)} ({s.duration} days)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {newServiceId && (() => {
                  const svc = availableServices.find((s) => s.id === newServiceId);
                  return svc ? (
                    <div className="p-3 rounded-lg bg-muted/50 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Duration:</span>
                        <span className="font-medium">{svc.duration} days</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Price:</span>
                        <span className="font-bold text-emerald-600">{formatCurrency(svc.price)}</span>
                      </div>
                    </div>
                  ) : null;
                })()}
                <div className="space-y-2">
                  <Label htmlFor="sub-payment-method">Payment Method</Label>
                  <Select value={newPaymentMethod} onValueChange={setNewPaymentMethod}>
                    <SelectTrigger id="sub-payment-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="mobile_money">Mobile Money</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <EthiopianDateInput
                  value={newPaymentDate}
                  onChange={(val, iso) => { setNewPaymentDate(val); setNewPaymentDateIso(iso); }}
                  label="Payment Date (EC)"
                  required
                />
                <div className="space-y-2">
                  <Label htmlFor="sub-notes">Notes (Optional)</Label>
                  <Textarea
                    id="sub-notes"
                    value={newSubscriptionNotes}
                    onChange={(e) => setNewSubscriptionNotes(e.target.value)}
                    placeholder="Subscription notes..."
                    rows={2}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleCreateMember} disabled={submitting}>{submitting ? 'Creating...' : 'Create Member'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Member Dialog ──────────────────────────────────────────── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Member</DialogTitle>
            <DialogDescription>Update member information.</DialogDescription>
          </DialogHeader>
          <MemberForm formData={formData} setFormData={setFormData} formErrors={formErrors} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleUpdateMember} disabled={submitting}>{submitting ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── View Member Dialog ──────────────────────────────────────────── */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Member Details</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4"><Skeleton className="h-14 w-14 rounded-full" /><div className="space-y-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-24" /></div></div>
              <Skeleton className="h-4 w-32" /><Skeleton className="h-32 w-full" />
            </div>
          ) : memberDetail ? (
            <div className="space-y-6">
              {/* Member Header */}
              <div className="flex items-start gap-4">
                <MemberAvatar photo={memberDetail.photo} firstName={memberDetail.firstName} lastName={memberDetail.lastName} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-semibold">{formatMemberName(memberDetail)}</h3>
                    <StatusBadge status={memberDetail.status} size="sm" />
                    {memberDetail.isDeleted && <Badge variant="outline" className="text-xs text-destructive border-destructive">Deleted</Badge>}
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-1 text-sm text-muted-foreground">
                    {memberDetail.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{memberDetail.phone}</span>}
                  </div>
                </div>
              </div>

              {/* Physical Info */}
              {(memberDetail.address || memberDetail.weight || memberDetail.height || memberDetail.bloodType) && (
                <div className="grid grid-cols-2 gap-3">
                  {memberDetail.address && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm">{memberDetail.address}</span>
                    </div>
                  )}
                  {memberDetail.weight && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                      <Scale className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm">{memberDetail.weight} kg</span>
                    </div>
                  )}
                  {memberDetail.height && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                      <Ruler className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm">{memberDetail.height} cm</span>
                    </div>
                  )}
                  {memberDetail.bloodType && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 text-red-700">
                      <Droplets className="h-4 w-4 shrink-0" />
                      <span className="text-sm font-medium">{memberDetail.bloodType}</span>
                    </div>
                  )}
                </div>
              )}

              {(memberDetail.emergencyContact || memberDetail.notes) && (
                <div className="space-y-2">
                  {memberDetail.emergencyContact && (
                    <div className="text-sm"><span className="font-medium">Emergency Contact:</span> {memberDetail.emergencyContact}</div>
                  )}
                  {memberDetail.notes && (
                    <div className="text-sm"><span className="font-medium">Notes:</span> {memberDetail.notes}</div>
                  )}
                </div>
              )}

              <Separator />

              {/* BMI if both weight and height */}
              {memberDetail.weight && memberDetail.height && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 text-emerald-700">
                  <Heart className="h-4 w-4" />
                  <span className="text-sm font-medium">BMI: {(memberDetail.weight / ((memberDetail.height / 100) ** 2)).toFixed(1)}</span>
                </div>
              )}

              {/* Subscriptions */}
              <div>
                <h4 className="font-semibold mb-3">Subscriptions ({memberDetail.subscriptions?.length || 0})</h4>
                {!memberDetail.subscriptions?.length ? (
                  <p className="text-sm text-muted-foreground">No subscriptions yet</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {memberDetail.subscriptions.map((sub) => (
                      <div key={sub.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                        <div>
                          <div className="font-medium text-sm">{sub.service.name}</div>
                          <div className="text-xs text-muted-foreground">{formatDate(sub.startDate)} — {formatDate(sub.endDate)}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{formatCurrency(sub.priceSnapshot)}</span>
                          <Badge variant={sub.status === 'active' ? 'default' : sub.status === 'expired' ? 'secondary' : 'outline'} className="text-xs">{sub.status}</Badge>
                          {isManagerOrAbove && (sub.status === 'expired' || sub.status === 'cancelled') && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-7 text-xs"
                              onClick={async () => {
                                try {
                                  const result = await subscriptionsApi.renew(sub.id) as { subscription: { priceSnapshot: number } };
                                  toast.success(`Subscription renewed! Payment of ${formatCurrency(result.subscription?.priceSnapshot || sub.priceSnapshot)} has been recorded.`);
                                  fetchMemberDetail(memberDetail.id);
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : 'Failed to renew subscription');
                                }
                              }}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Renew
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Payments */}
              <div>
                <h4 className="font-semibold mb-3">Payments ({memberDetail.payments?.length || 0})</h4>
                {!memberDetail.payments?.length ? (
                  <p className="text-sm text-muted-foreground">No payments yet</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {memberDetail.payments.map((pay) => (
                      <div key={pay.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                        <div>
                          <div className="font-medium text-sm">{pay.receiptNumber}</div>
                          <div className="text-xs text-muted-foreground">{pay.subscription?.service?.name || 'Service'} — {formatDate(pay.paymentDate)}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{formatCurrency(pay.amount)}</span>
                          {pay.isVoided && <Badge variant="destructive" className="text-xs">Voided</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ──────────────────────────────────── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" />Delete Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{selectedMember && formatMemberName(selectedMember)}</strong>? This action soft-deletes the member. You can restore them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Restore Confirmation Dialog ─────────────────────────────────── */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5" />Restore Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore <strong>{selectedMember && formatMemberName(selectedMember)}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRestore}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

/** Member Card (mobile layout) */
function MemberCard({ member, isOwner, isManagerOrAbove, onView, onEdit, onDelete, onRestore }: {
  member: Member; isOwner: boolean; isManagerOrAbove: boolean;
  onView: (m: Member) => void; onEdit: (m: Member) => void; onDelete: (m: Member) => void; onRestore: (m: Member) => void;
}) {
  return (
    <Card className={member.isDeleted ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <MemberAvatar photo={member.photo} firstName={member.firstName} lastName={member.lastName} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold truncate">{formatMemberName(member)}</span>
              <StatusBadge status={member.status} size="sm" />
            </div>
            {member.isDeleted && <Badge variant="outline" className="mt-1 text-xs text-destructive border-destructive">Deleted</Badge>}
            <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
              {member.phone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3 shrink-0" /><span className="truncate">{member.phone}</span></div>}
              {member.bloodType && <div className="flex items-center gap-1.5"><Droplets className="h-3 w-3 shrink-0 text-red-500" /><span>{member.bloodType}</span></div>}
              {member.subscriptionEndDate && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Expires:</span>
                  <span className="font-medium">{formatDate(member.subscriptionEndDate)}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-3">
              <Button variant="outline" size="sm" onClick={() => onView(member)}><Eye className="h-3.5 w-3.5" /></Button>
              {isManagerOrAbove && !member.isDeleted && <Button variant="outline" size="sm" onClick={() => onEdit(member)}><Pencil className="h-3.5 w-3.5" /></Button>}
              {isOwner && member.isDeleted && <Button variant="outline" size="sm" onClick={() => onRestore(member)}><RotateCcw className="h-3.5 w-3.5" /></Button>}
              {isOwner && !member.isDeleted && <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(member)}><Trash2 className="h-3.5 w-3.5" /></Button>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Member Actions (desktop table) */
function MemberActions({ member, isOwner, isManagerOrAbove, onView, onEdit, onDelete, onRestore }: {
  member: Member; isOwner: boolean; isManagerOrAbove: boolean;
  onView: (m: Member) => void; onEdit: (m: Member) => void; onDelete: (m: Member) => void; onRestore: (m: Member) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onView(member)}><Eye className="h-4 w-4" /></Button>
      {isManagerOrAbove && !member.isDeleted && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(member)}><Pencil className="h-4 w-4" /></Button>}
      {isOwner && member.isDeleted && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onRestore(member)}><RotateCcw className="h-4 w-4" /></Button>}
      {isOwner && !member.isDeleted && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(member)}><Trash2 className="h-4 w-4" /></Button>}
    </div>
  );
}

/** Member Form (shared between Add and Edit dialogs) */
function MemberForm({ formData, setFormData, formErrors }: {
  formData: MemberFormData;
  setFormData: React.Dispatch<React.SetStateAction<MemberFormData>>;
  formErrors: Partial<Record<keyof MemberFormData, string>>;
}) {
  const updateField = (field: keyof MemberFormData, value: string | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-5">
      {/* Photo Section */}
      <PhotoCapture
        value={formData.photo}
        onChange={(url) => updateField('photo', url)}
        firstName={formData.firstName}
        lastName={formData.lastName}
      />

      <Separator />

      {/* Personal Info */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground">Personal Information</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">First Name *</Label>
            <Input id="firstName" value={formData.firstName} onChange={(e) => updateField('firstName', e.target.value)} placeholder="First name" />
            {formErrors.firstName && <p className="text-xs text-destructive">{formErrors.firstName}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Last Name *</Label>
            <Input id="lastName" value={formData.lastName} onChange={(e) => updateField('lastName', e.target.value)} placeholder="Last name" />
            {formErrors.lastName && <p className="text-xs text-destructive">{formErrors.lastName}</p>}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={formData.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="+251..." />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="address">Address</Label>
          <Input id="address" value={formData.address} onChange={(e) => updateField('address', e.target.value)} placeholder="Street, City" />
        </div>
      </div>

      <Separator />

      {/* Physical Info */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground">Physical Information</h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="weight">Weight (kg)</Label>
            <Input id="weight" type="number" step="0.1" value={formData.weight} onChange={(e) => updateField('weight', e.target.value)} placeholder="70" />
            {formErrors.weight && <p className="text-xs text-destructive">{formErrors.weight}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="height">Height (cm)</Label>
            <Input id="height" type="number" step="0.1" value={formData.height} onChange={(e) => updateField('height', e.target.value)} placeholder="175" />
            {formErrors.height && <p className="text-xs text-destructive">{formErrors.height}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bloodType">Blood Type</Label>
            <Select value={formData.bloodType} onValueChange={(v) => updateField('bloodType', v)}>
              <SelectTrigger id="bloodType"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {bloodTypes.map((bt) => (
                  <SelectItem key={bt} value={bt}>{bt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {/* BMI Preview */}
        {formData.weight && formData.height && Number(formData.height) > 0 && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm">
            <Heart className="h-4 w-4" />
            <span>BMI: {(Number(formData.weight) / ((Number(formData.height) / 100) ** 2)).toFixed(1)}</span>
          </div>
        )}
      </div>

      <Separator />

      {/* Additional Info */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground">Additional Information</h4>
        <div className="space-y-1.5">
          <Label htmlFor="emergencyContact">Emergency Contact</Label>
          <Input id="emergencyContact" value={formData.emergencyContact} onChange={(e) => updateField('emergencyContact', e.target.value)} placeholder="Name and phone number" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" value={formData.notes} onChange={(e) => updateField('notes', e.target.value)} placeholder="Any additional notes..." rows={2} />
        </div>
      </div>
    </div>
  );
}
