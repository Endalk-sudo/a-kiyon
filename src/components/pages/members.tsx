'use client';

import { useCallback, useEffect, useState } from 'react';
import { membersApi } from '@/lib/api-client';
import { StatusBadge, type StatusType } from '@/components/status-badge';
import { MemberAvatar } from '@/components/member-avatar';
import { formatCurrency, formatDate, formatMemberName } from '@/lib/format';
import { useAppStore } from '@/lib/store';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';

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
  Mail,
  AlertTriangle,
  Users,
  UserPlus,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  photo: string | null;
  emergencyContact: string | null;
  notes: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  status: StatusType;
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
    invoices: Array<{
      id: string;
      amount: number;
      status: string;
      dueDate: string;
      paidAt: string | null;
      payments: Array<{
        id: string;
        amount: number;
        paymentDate: string;
        method: string;
        receiptNumber: string;
        isVoided: boolean;
      }>;
    }>;
  }>;
  invoices: Array<{
    id: string;
    amount: number;
    status: string;
    dueDate: string;
    createdAt: string;
    subscription: { id: string; service: { name: string } } | null;
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
    invoice: {
      subscription: { service: { name: string } } | null;
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
  email: string;
  emergencyContact: string;
  notes: string;
}

const emptyFormData: MemberFormData = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  emergencyContact: '',
  notes: '',
};

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
  const { toast } = useToast();

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
      setMembers(result.data);
      setPagination((prev) => ({
        ...result.pagination,
        page: prev.page, // keep the requested page
      }));
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to load members',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [pagination.page, searchDebounced, statusFilter, showDeleted, toast]);

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
      toast({
        title: 'Error',
        description: 'Failed to load member details',
        variant: 'destructive',
      });
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
      email: member.email || '',
      emergencyContact: member.emergencyContact || '',
      notes: member.notes || '',
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
    setAddDialogOpen(true);
  };

  // ─── Form Validation ────────────────────────────────────────────────────

  const validateForm = (data: MemberFormData): boolean => {
    const errors: Partial<Record<keyof MemberFormData, string>> = {};
    if (!data.firstName.trim()) errors.firstName = 'First name is required';
    if (!data.lastName.trim()) errors.lastName = 'Last name is required';
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.email = 'Invalid email format';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ─── Submit Handlers ────────────────────────────────────────────────────

  const handleCreateMember = async () => {
    if (!validateForm(formData)) return;
    setSubmitting(true);
    try {
      await membersApi.create({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        emergencyContact: formData.emergencyContact.trim() || null,
        notes: formData.notes.trim() || null,
      });
      toast({ title: 'Success', description: 'Member created successfully' });
      setAddDialogOpen(false);
      setFormData(emptyFormData);
      fetchMembers();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to create member',
        variant: 'destructive',
      });
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
        email: formData.email.trim() || null,
        emergencyContact: formData.emergencyContact.trim() || null,
        notes: formData.notes.trim() || null,
      });
      toast({ title: 'Success', description: 'Member updated successfully' });
      setEditDialogOpen(false);
      fetchMembers();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to update member',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedMember) return;
    try {
      await membersApi.delete(selectedMember.id);
      toast({ title: 'Success', description: 'Member deleted successfully' });
      setDeleteDialogOpen(false);
      fetchMembers();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to delete member',
        variant: 'destructive',
      });
    }
  };

  const handleConfirmRestore = async () => {
    if (!selectedMember) return;
    try {
      await membersApi.restore(selectedMember.id);
      toast({ title: 'Success', description: 'Member restored successfully' });
      setRestoreDialogOpen(false);
      fetchMembers();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to restore member',
        variant: 'destructive',
      });
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
            Manage your fitness center members
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
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Filter Row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter Buttons */}
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

            {/* Show Deleted Toggle (owner only) */}
            {isOwner && (
              <>
                <Separator orientation="vertical" className="h-6 mx-1 hidden sm:block" />
                <div className="flex items-center gap-2">
                  <Switch
                    id="show-deleted"
                    checked={showDeleted}
                    onCheckedChange={setShowDeleted}
                  />
                  <Label htmlFor="show-deleted" className="text-sm cursor-pointer">
                    Show Deleted
                  </Label>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Members Count */}
      <div className="text-sm text-muted-foreground">
        {loading ? (
          <Skeleton className="h-4 w-32" />
        ) : (
          `${pagination.total} member${pagination.total !== 1 ? 's' : ''} found`
        )}
      </div>

      {/* Members List */}
      {loading ? (
        <MembersListSkeleton isMobile={isMobile} />
      ) : members.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold text-lg">No members found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {search || statusFilter !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Get started by adding your first member'}
            </p>
            {isManagerOrAbove && !search && statusFilter === 'all' && (
              <Button onClick={handleAddMember} className="mt-4">
                <UserPlus className="h-4 w-4 mr-2" />
                Add Member
              </Button>
            )}
          </CardContent>
        </Card>
      ) : isMobile ? (
        /* Mobile Card Layout */
        <div className="space-y-3">
          {members.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              isOwner={isOwner}
              isManagerOrAbove={isManagerOrAbove}
              onView={handleViewMember}
              onEdit={handleEditMember}
              onDelete={handleDeleteMember}
              onRestore={handleRestoreMember}
            />
          ))}
        </div>
      ) : (
        /* Desktop Table Layout */
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[280px]">Member</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow
                    key={member.id}
                    className={member.isDeleted ? 'opacity-60' : ''}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <MemberAvatar
                          photo={member.photo}
                          firstName={member.firstName}
                          lastName={member.lastName}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {formatMemberName(member)}
                            {member.isDeleted && (
                              <Badge variant="outline" className="ml-2 text-xs text-destructive border-destructive">
                                Deleted
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {member.phone || '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {member.email || '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={member.status} size="sm" />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(member.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <MemberActions
                        member={member}
                        isOwner={isOwner}
                        isManagerOrAbove={isManagerOrAbove}
                        onView={handleViewMember}
                        onEdit={handleEditMember}
                        onDelete={handleDeleteMember}
                        onRestore={handleRestoreMember}
                      />
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
                <PaginationPrevious
                  onClick={() =>
                    setPagination((prev) => ({
                      ...prev,
                      page: Math.max(1, prev.page - 1),
                    }))
                  }
                  className={
                    pagination.page <= 1
                      ? 'pointer-events-none opacity-50'
                      : 'cursor-pointer'
                  }
                />
              </PaginationItem>
              {getPageNumbers().map((page, idx) =>
                page === 'ellipsis' ? (
                  <PaginationItem key={`ellipsis-${idx}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={page}>
                    <PaginationLink
                      isActive={pagination.page === page}
                      onClick={() =>
                        setPagination((prev) => ({ ...prev, page }))
                      }
                      className="cursor-pointer"
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                )
              )}
              <PaginationItem>
                <PaginationNext
                  onClick={() =>
                    setPagination((prev) => ({
                      ...prev,
                      page: Math.min(prev.totalPages, prev.page + 1),
                    }))
                  }
                  className={
                    pagination.page >= pagination.totalPages
                      ? 'pointer-events-none opacity-50'
                      : 'cursor-pointer'
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* ─── Add Member Dialog ──────────────────────────────────────────── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Member</DialogTitle>
            <DialogDescription>
              Create a new member account in the system.
            </DialogDescription>
          </DialogHeader>
          <MemberForm
            formData={formData}
            setFormData={setFormData}
            formErrors={formErrors}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateMember} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Member Dialog ──────────────────────────────────────────── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Member</DialogTitle>
            <DialogDescription>
              Update member information.
            </DialogDescription>
          </DialogHeader>
          <MemberForm
            formData={formData}
            setFormData={setFormData}
            formErrors={formErrors}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateMember} disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Changes'}
            </Button>
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
              <div className="flex items-center gap-4">
                <Skeleton className="h-14 w-14 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : memberDetail ? (
            <div className="space-y-6">
              {/* Member Header */}
              <div className="flex items-start gap-4">
                <MemberAvatar
                  photo={memberDetail.photo}
                  firstName={memberDetail.firstName}
                  lastName={memberDetail.lastName}
                  size="lg"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-semibold">
                      {formatMemberName(memberDetail)}
                    </h3>
                    <StatusBadge status={memberDetail.status} size="sm" />
                    {memberDetail.isDeleted && (
                      <Badge variant="outline" className="text-xs text-destructive border-destructive">
                        Deleted
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-1 text-sm text-muted-foreground">
                    {memberDetail.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" />
                        {memberDetail.phone}
                      </span>
                    )}
                    {memberDetail.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" />
                        {memberDetail.email}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              {(memberDetail.emergencyContact || memberDetail.notes) && (
                <div className="space-y-2">
                  {memberDetail.emergencyContact && (
                    <div className="text-sm">
                      <span className="font-medium">Emergency Contact:</span>{' '}
                      {memberDetail.emergencyContact}
                    </div>
                  )}
                  {memberDetail.notes && (
                    <div className="text-sm">
                      <span className="font-medium">Notes:</span>{' '}
                      {memberDetail.notes}
                    </div>
                  )}
                </div>
              )}

              <Separator />

              {/* Subscriptions */}
              <div>
                <h4 className="font-semibold mb-3">
                  Subscriptions ({memberDetail.subscriptions.length})
                </h4>
                {memberDetail.subscriptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No subscriptions yet</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {memberDetail.subscriptions.map((sub) => (
                      <div
                        key={sub.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                      >
                        <div>
                          <div className="font-medium text-sm">
                            {sub.service.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(sub.startDate)} — {formatDate(sub.endDate)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {formatCurrency(sub.priceSnapshot)}
                          </span>
                          <Badge
                            variant={
                              sub.status === 'active'
                                ? 'default'
                                : sub.status === 'expired'
                                ? 'secondary'
                                : 'outline'
                            }
                            className="text-xs"
                          >
                            {sub.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Invoices */}
              <div>
                <h4 className="font-semibold mb-3">
                  Invoices ({memberDetail.invoices.length})
                </h4>
                {memberDetail.invoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No invoices yet</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {memberDetail.invoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                      >
                        <div>
                          <div className="font-medium text-sm">
                            {inv.subscription?.service?.name || 'Service'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Due: {formatDate(inv.dueDate)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {formatCurrency(inv.amount)}
                          </span>
                          <Badge
                            variant={
                              inv.status === 'paid'
                                ? 'default'
                                : inv.status === 'pending'
                                ? 'secondary'
                                : inv.status === 'overdue'
                                ? 'destructive'
                                : 'outline'
                            }
                            className="text-xs"
                          >
                            {inv.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Payments */}
              <div>
                <h4 className="font-semibold mb-3">
                  Payments ({memberDetail.payments.length})
                </h4>
                {memberDetail.payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments yet</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {memberDetail.payments.map((pay) => (
                      <div
                        key={pay.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                      >
                        <div>
                          <div className="font-medium text-sm">
                            {pay.receiptNumber}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {pay.invoice?.subscription?.service?.name || 'Service'} — {formatDate(pay.paymentDate)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {formatCurrency(pay.amount)}
                          </span>
                          {pay.isVoided && (
                            <Badge variant="destructive" className="text-xs">
                              Voided
                            </Badge>
                          )}
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
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Member
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <strong>{selectedMember && formatMemberName(selectedMember)}</strong>?
              This action soft-deletes the member. You can restore them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Restore Confirmation Dialog ─────────────────────────────────── */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Restore Member
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore{' '}
              <strong>{selectedMember && formatMemberName(selectedMember)}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRestore}>
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

/** Member Card (mobile layout) */
function MemberCard({
  member,
  isOwner,
  isManagerOrAbove,
  onView,
  onEdit,
  onDelete,
  onRestore,
}: {
  member: Member;
  isOwner: boolean;
  isManagerOrAbove: boolean;
  onView: (m: Member) => void;
  onEdit: (m: Member) => void;
  onDelete: (m: Member) => void;
  onRestore: (m: Member) => void;
}) {
  return (
    <Card className={member.isDeleted ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <MemberAvatar
            photo={member.photo}
            firstName={member.firstName}
            lastName={member.lastName}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold truncate">
                {formatMemberName(member)}
              </span>
              <StatusBadge status={member.status} size="sm" />
            </div>
            {member.isDeleted && (
              <Badge variant="outline" className="mt-1 text-xs text-destructive border-destructive">
                Deleted
              </Badge>
            )}
            <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
              {member.phone && (
                <div className="flex items-center gap-1.5">
                  <Phone className="h-3 w-3 shrink-0" />
                  <span className="truncate">{member.phone}</span>
                </div>
              )}
              {member.email && (
                <div className="flex items-center gap-1.5">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{member.email}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-3">
              <Button variant="outline" size="sm" onClick={() => onView(member)}>
                <Eye className="h-3.5 w-3.5" />
              </Button>
              {isManagerOrAbove && !member.isDeleted && (
                <Button variant="outline" size="sm" onClick={() => onEdit(member)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
              {isOwner && member.isDeleted && (
                <Button variant="outline" size="sm" onClick={() => onRestore(member)}>
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )}
              {isOwner && !member.isDeleted && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onDelete(member)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Member Action Buttons (desktop table) */
function MemberActions({
  member,
  isOwner,
  isManagerOrAbove,
  onView,
  onEdit,
  onDelete,
  onRestore,
}: {
  member: Member;
  isOwner: boolean;
  isManagerOrAbove: boolean;
  onView: (m: Member) => void;
  onEdit: (m: Member) => void;
  onDelete: (m: Member) => void;
  onRestore: (m: Member) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon" onClick={() => onView(member)} title="View">
        <Eye className="h-4 w-4" />
      </Button>
      {isManagerOrAbove && !member.isDeleted && (
        <Button variant="ghost" size="icon" onClick={() => onEdit(member)} title="Edit">
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      {isOwner && member.isDeleted && (
        <Button variant="ghost" size="icon" onClick={() => onRestore(member)} title="Restore">
          <RotateCcw className="h-4 w-4" />
        </Button>
      )}
      {isOwner && !member.isDeleted && (
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          onClick={() => onDelete(member)}
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

/** Member Form (shared between Add & Edit) */
function MemberForm({
  formData,
  setFormData,
  formErrors,
}: {
  formData: MemberFormData;
  setFormData: React.Dispatch<React.SetStateAction<MemberFormData>>;
  formErrors: Partial<Record<keyof MemberFormData, string>>;
}) {
  const updateField = (field: keyof MemberFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">
            First Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="firstName"
            value={formData.firstName}
            onChange={(e) => updateField('firstName', e.target.value)}
            placeholder="Enter first name"
            className={formErrors.firstName ? 'border-destructive' : ''}
          />
          {formErrors.firstName && (
            <p className="text-xs text-destructive">{formErrors.firstName}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">
            Last Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="lastName"
            value={formData.lastName}
            onChange={(e) => updateField('lastName', e.target.value)}
            placeholder="Enter last name"
            className={formErrors.lastName ? 'border-destructive' : ''}
          />
          {formErrors.lastName && (
            <p className="text-xs text-destructive">{formErrors.lastName}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            placeholder="Enter phone number"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => updateField('email', e.target.value)}
            placeholder="Enter email address"
            className={formErrors.email ? 'border-destructive' : ''}
          />
          {formErrors.email && (
            <p className="text-xs text-destructive">{formErrors.email}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="emergencyContact">Emergency Contact</Label>
        <Input
          id="emergencyContact"
          value={formData.emergencyContact}
          onChange={(e) => updateField('emergencyContact', e.target.value)}
          placeholder="Enter emergency contact info"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => updateField('notes', e.target.value)}
          placeholder="Additional notes about the member"
          rows={3}
        />
      </div>
    </div>
  );
}

/** Loading Skeleton for Members List */
function MembersListSkeleton({ isMobile }: { isMobile: boolean }) {
  if (isMobile) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-36" />
                  <div className="flex gap-1.5 mt-2">
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-32" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
