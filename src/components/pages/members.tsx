'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { membersApi, servicesApi, subscriptionsApi } from '@/lib/api-client';
import { StatusBadge, type StatusType } from '@/components/status-badge';
import { MemberAvatar } from '@/components/member-avatar';
import { PhotoLightbox } from '@/components/photo-lightbox';
import { PhotoCapture } from '@/components/photo-capture';
import { formatCurrency, formatDate, formatMemberName, getInitials } from '@/lib/format';
import { useAppStore } from '@/lib/store';
import { sanitizeError } from '@/lib/errors';
import { t } from '@/lib/messages';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { calculateNavyBodyFatPercent, hasNavyBodyFatData, type Sex } from '@/lib/body-fat';

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
  Eye,
  Pencil,
  Trash2,
  RotateCcw,
  Phone,
  AlertTriangle,
  Users,
  UserPlus,
  Plus,
  MapPin,
  Scale,
  Ruler,
  Droplets,
  Heart,
  RefreshCw,
  X,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  photo: string | null;
  photoThumb?: string | null;
  address: string | null;
  weight: number | null;
  height: number | null;
  bloodType: string | null;
  sex: Sex | null;
  neck: number | null;
  waist: number | null;
  hip: number | null;
  bodyFatPercent: number | null;
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
    hasVoidedPayment?: boolean;
    voidedPaymentNote?: string | null;
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
  sex: string;
  neck: string;
  waist: string;
  hip: string;
  emergencyContact: string;
  notes: string;
  photo: string | null;
  photoThumb: string | null;
}

const emptyFormData: MemberFormData = {
  firstName: '',
  lastName: '',
  phone: '',
  address: '',
  weight: '',
  height: '',
  bloodType: '',
  sex: '',
  neck: '',
  waist: '',
  hip: '',
  emergencyContact: '',
  notes: '',
  photo: null,
  photoThumb: null,
};

const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const sexOptions: { value: Sex; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

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
  const session = useAppStore((s) => s.session);
  const locale = useAppStore((s) => s.locale);
  const isMobile = useIsMobile();

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
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);

  // Selected member for actions
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [memberDetail, setMemberDetail] = useState<MemberDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Renew subscription (from member detail modal)
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const [subscriptionToRenew, setSubscriptionToRenew] = useState<MemberDetail['subscriptions'][number] | null>(null);
  const [renewPaymentMethod, setRenewPaymentMethod] = useState('cash');
  const [renewing, setRenewing] = useState(false);

  // Subscribe existing member (from member detail modal)
  const [subscribeDialogOpen, setSubscribeDialogOpen] = useState(false);
  const [subscribeServices, setSubscribeServices] = useState<Array<{ id: string; name: string; price: number; duration: number }>>([]);
  const [subscribeServiceId, setSubscribeServiceId] = useState('');
  const [subscribePaymentMethod, setSubscribePaymentMethod] = useState('cash');
  const [subscribeNotes, setSubscribeNotes] = useState('');
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  // Form data
  const [formData, setFormData] = useState<MemberFormData>(emptyFormData);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof MemberFormData, string>>>({});
  const [subscriptionErrors, setSubscriptionErrors] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Subscription on create (required)
  const [availableServices, setAvailableServices] = useState<Array<{ id: string; name: string; price: number; duration: number }>>([]);
  const [newServiceId, setNewServiceId] = useState('');
  const [newPaymentMethod, setNewPaymentMethod] = useState('cash');
  const [newSubscriptionNotes, setNewSubscriptionNotes] = useState('');

  // ─── Fetch Members ──────────────────────────────────────────────────────

  // Guards against out-of-order responses: only the latest request wins.
  const fetchSeqRef = useRef(0);

  const fetchMembers = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: PAGE_LIMIT,
        ...(searchDebounced ? { search: searchDebounced } : {}),
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
        ...(showDeleted ? { showDeleted: 'true' as const } : {}),
      };

      const result = await membersApi.list(params);
      if (seq !== fetchSeqRef.current) return;
      setMembers(result.data || []);
      setPagination((prev) => ({
        ...result.pagination,
        page: prev.page,
      }));
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      toast.error(t(locale, 'Failed to load members', 'አባላትን መጫን አልተሳካም'));
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [pagination.page, searchDebounced, statusFilter, showDeleted, locale]);

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
      toast.error(t(locale, 'Failed to load member details', 'የአባል ዝርዝሮችን መጫን አልተሳካም'));
    } finally {
      setDetailLoading(false);
    }
  };

  // ─── Renew Subscription ─────────────────────────────────────────────────

  const handleRenewSubscription = async () => {
    if (!subscriptionToRenew) return;
    setRenewing(true);
    try {
      const result = await subscriptionsApi.renew(subscriptionToRenew.id, { paymentMethod: renewPaymentMethod });
      toast.success(t(
        locale,
        `Subscription renewed! Payment of ${formatCurrency(result.subscription.priceSnapshot || subscriptionToRenew.priceSnapshot)} has been recorded. Receipt: ${result.payment?.receiptNumber || ''}`,
        `ምዝገባ ታድሷል! ክፍያ ተመዝግቧል ደረሰኝ ቁጥር: ${result.payment?.receiptNumber || ''}`,
      ));
      setRenewDialogOpen(false);
      setSubscriptionToRenew(null);
      if (memberDetail) fetchMemberDetail(memberDetail.id);
    } catch (err) {
      toast.error(sanitizeError(err, locale, 'Failed to renew subscription', 'ምዝገባ ማደስ አልተሳካም'));
    } finally {
      setRenewing(false);
    }
  };

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleOpenSubscribe = () => {
    setSubscribeServiceId('');
    setSubscribeNotes('');
    setSubscribeError(null);
    setSubscribeDialogOpen(true);
    if (subscribeServices.length === 0) {
      servicesApi.list({ includeInactive: false }).then((res) => {
        setSubscribeServices((res as { data: Array<{ id: string; name: string; price: number; duration: number }> }).data || []);
      }).catch(() => toast.error(t(locale, 'Failed to load services', 'አገልግሎቶችን መጫን አልተሳካም')));
    }
  };

  const handleSubscribeMember = async () => {
    if (!memberDetail) return;
    if (!subscribeServiceId) {
      setSubscribeError(t(locale, 'Please select a service', 'እባክዎ አገልግሎት ይምረጡ'));
      return;
    }
    setSubscribing(true);
    try {
      const result = await subscriptionsApi.create({
        memberId: memberDetail.id,
        serviceId: subscribeServiceId,
        paymentMethod: subscribePaymentMethod,
        notes: subscribeNotes || undefined,
      });
      toast.success(t(
        locale,
        `Subscription created! Payment of ${formatCurrency(result.subscription.priceSnapshot)} recorded. Receipt: ${result.payment?.receiptNumber || ''}`,
        `ምዝገባ ተፈጥሯል! ክፍያ ተመዝግቧል ደረሰኝ ቁጥር: ${result.payment?.receiptNumber || ''}`,
      ));
      setSubscribeDialogOpen(false);
      setSubscribeServiceId('');
      setSubscribeNotes('');
      fetchMemberDetail(memberDetail.id);
      fetchMembers();
    } catch (err) {
      toast.error(sanitizeError(err, locale, 'Failed to create subscription', 'ምዝገባ መፍጠር አልተሳካም'));
    } finally {
      setSubscribing(false);
    }
  };

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
      sex: member.sex || '',
      neck: member.neck?.toString() || '',
      waist: member.waist?.toString() || '',
      hip: member.hip?.toString() || '',
      emergencyContact: member.emergencyContact || '',
      notes: member.notes || '',
      photo: member.photo || null,
      photoThumb: member.photoThumb || null,
    });
    setFormErrors({});
    setNewServiceId('');
    setSubscriptionErrors(null);
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
    setNewServiceId('');
    setNewPaymentMethod('cash');
    setNewSubscriptionNotes('');
    setSubscriptionErrors(null);
    setAddDialogOpen(true);
    servicesApi.list({ includeInactive: false }).then((res) => {
      setAvailableServices((res as { data: Array<{ id: string; name: string; price: number; duration: number }> }).data || []);
    }).catch(() => toast.error(t(locale, 'Failed to load services', 'አገልግሎቶችን መጫን አልተሳካም')));
  };

  // ─── Form Validation ────────────────────────────────────────────────────

  const validateForm = (data: MemberFormData, requireService: boolean): boolean => {
    const errors: Partial<Record<keyof MemberFormData, string>> = {};
    if (!data.firstName.trim()) errors.firstName = t(locale, 'First name is required', 'ስም ያስፈልጋል');
    if (!data.lastName.trim()) errors.lastName = t(locale, 'Last name is required', 'የአባት ስም ያስፈልጋል');
    if (data.phone.trim() && !/^\+251\d{9}$/.test(data.phone.trim())) {
      errors.phone = t(locale, 'Phone must be in format +251XXXXXXXXX', 'ስልክ ቁጥር በ+251 መቅረብ አለበት');
    }
    if (data.emergencyContact.trim() && data.emergencyContact.trim().length < 2) {
      errors.emergencyContact = t(locale, 'Emergency contact name is too short', 'የአደጋ ጊዜ እውቂያ ስም በጣም አጭር ነው');
    }
    if (data.address.length > 256) {
      errors.address = t(locale, 'Address must be under 256 characters', 'አድራሻ ከ256 ቁምፊ መብለጥ የለበትም');
    }
    if (data.notes.length > 512) {
      errors.notes = t(locale, 'Notes must be under 512 characters', 'ማስታወሻ ከ512 ቁምፊ መብለጥ የለበትም');
    }
    if (data.weight && (isNaN(Number(data.weight)) || Number(data.weight) <= 0)) {
      errors.weight = t(locale, 'Weight must be a positive number', 'ክብደት አዎንታዊ ቁጥር መሆን አለበት');
    }
    if (data.height && (isNaN(Number(data.height)) || Number(data.height) <= 0)) {
      errors.height = t(locale, 'Height must be a positive number', 'ቁመት አዎንታዊ ቁጥር መሆን አለበት');
    }
    if (data.neck && (isNaN(Number(data.neck)) || Number(data.neck) <= 0)) {
      errors.neck = t(locale, 'Neck must be a positive number', 'አንገት አዎንታዊ ቁጥር መሆን አለበት');
    }
    if (data.waist && (isNaN(Number(data.waist)) || Number(data.waist) <= 0)) {
      errors.waist = t(locale, 'Waist must be a positive number', 'ወገብ አዎንታዊ ቁጥር መሆን አለበት');
    }
    if (data.hip && (isNaN(Number(data.hip)) || Number(data.hip) <= 0)) {
      errors.hip = t(locale, 'Hip must be a positive number', 'ዳሌ አዎንታዊ ቁጥር መሆን አለበት');
    }
    if (data.bloodType && !['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(data.bloodType)) {
      errors.bloodType = t(locale, 'Select a valid blood type', 'ትክክለኛ የደም አይነት ይምረጡ');
    }
    // The service selection is only required on the create-with-subscription flow.
    if (requireService && !newServiceId) {
      setSubscriptionErrors(t(locale, 'Please select a service', 'እባክዎ አገልግሎት ይምረጡ'));
    } else {
      setSubscriptionErrors(null);
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0 && (!requireService || !!newServiceId);
  };

  // ─── Submit Handlers ────────────────────────────────────────────────────

  const handleCreateMember = async () => {
    if (!validateForm(formData, true)) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phone: formData.phone.trim() || null,
        photo: formData.photo,
        photoThumb: formData.photoThumb,
        address: formData.address.trim() || null,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        height: formData.height ? parseFloat(formData.height) : null,
        bloodType: formData.bloodType || null,
        sex: (formData.sex as Sex) || null,
        neck: formData.neck ? parseFloat(formData.neck) : null,
        waist: formData.waist ? parseFloat(formData.waist) : null,
        hip: formData.hip ? parseFloat(formData.hip) : null,
        emergencyContact: formData.emergencyContact.trim() || null,
        notes: formData.notes.trim() || null,
      };
      if (newServiceId) {
        payload.serviceId = newServiceId;
        payload.paymentMethod = newPaymentMethod;
        if (newSubscriptionNotes) payload.subscriptionNotes = newSubscriptionNotes;
      }
      await membersApi.create(payload);
      toast.success(t(locale, 'Member created and subscribed successfully', 'አባል ተፈጥሯል እና ምዝገባ ተሰራ'));
      setAddDialogOpen(false);
      setFormData(emptyFormData);
      fetchMembers();
    } catch (err) {
      toast.error(sanitizeError(err, locale, 'Failed to create member', 'አባል መፍጠር አልተሳካም'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateMember = async () => {
    if (!selectedMember || !validateForm(formData, false)) return;
    setSubmitting(true);
    try {
      await membersApi.update(selectedMember.id, {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phone: formData.phone.trim() || null,
        photo: formData.photo,
        photoThumb: formData.photoThumb,
        address: formData.address.trim() || null,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        height: formData.height ? parseFloat(formData.height) : null,
        bloodType: formData.bloodType || null,
        sex: (formData.sex as Sex) || null,
        neck: formData.neck ? parseFloat(formData.neck) : null,
        waist: formData.waist ? parseFloat(formData.waist) : null,
        hip: formData.hip ? parseFloat(formData.hip) : null,
        emergencyContact: formData.emergencyContact.trim() || null,
        notes: formData.notes.trim() || null,
      });
      toast.success(t(locale, 'Member updated successfully', 'አባል በተሳካ ሁኔታ ዘምኗል'));
      setEditDialogOpen(false);
      fetchMembers();
    } catch (err) {
      toast.error(sanitizeError(err, locale, 'Failed to update member', 'አባል ማዘመን አልተሳካም'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedMember) return;
    try {
      await membersApi.delete(selectedMember.id);
      toast.success(t(locale, 'Member deleted successfully', 'አባል በተሳካ ሁኔታ ተሰርዟል'));
      setDeleteDialogOpen(false);
      // Step back a page when this was the last row on the current page.
      if (members.length === 1 && pagination.page > 1) {
        setPagination((prev) => ({ ...prev, page: prev.page - 1 }));
      } else {
        fetchMembers();
      }
    } catch (err) {
      toast.error(sanitizeError(err, locale, 'Failed to delete member', 'አባል መሰረዝ አልተሳካም'));
    }
  };

  const handleConfirmRestore = async () => {
    if (!selectedMember) return;
    try {
      await membersApi.restore(selectedMember.id);
      toast.success(t(locale, 'Member restored successfully', 'አባል በተሳካ ሁኔታ ተመልሷል'));
      setRestoreDialogOpen(false);
      fetchMembers();
    } catch (err) {
      toast.error(sanitizeError(err, locale, 'Failed to restore member', 'አባል መመለስ አልተሳካም'));
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
            {isManagerOrAbove && (
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
            <MemberCard key={member.id} member={member} isManagerOrAbove={isManagerOrAbove}
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
                  <TableRow key={member.id} className={member.isDeleted ? 'opacity-60 cursor-pointer' : 'cursor-pointer'} onClick={() => handleViewMember(member)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <MemberAvatar photo={member.photo} photoThumb={member.photoThumb} firstName={member.firstName} lastName={member.lastName} size="sm" />
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
                      <MemberActions member={member} isManagerOrAbove={isManagerOrAbove}
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

          {/* Initial subscription (required) */}
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="sub-service" className="text-sm font-medium">
                Initial Subscription *
              </Label>
            </div>
            <div className="space-y-3 border-l-2 border-muted pl-4">
              <div className="space-y-2">
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
                {subscriptionErrors && <p className="text-xs text-destructive">{subscriptionErrors}</p>}
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
      <Dialog
        open={viewDialogOpen}
        onOpenChange={(open) => {
          // Never dismiss the modal while its photo lightbox is showing — the
          // first close should always target the on-top lightbox.
          if (!open && photoPreviewOpen) return;
          setViewDialogOpen(open);
        }}
      >
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
              <div className="flex items-start gap-5">
                {memberDetail.photo ? (
                  <img
                    src={memberDetail.photo}
                    alt={formatMemberName(memberDetail)}
                    className="w-32 h-32 rounded-xl object-cover cursor-pointer shrink-0 border"
                    onClick={() => setPhotoPreviewOpen(true)}
                  />
                ) : (
                  <div className="w-32 h-32 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <span className="text-3xl font-bold">{getInitials(memberDetail.firstName, memberDetail.lastName)}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0 pt-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xl font-semibold">{formatMemberName(memberDetail)}</h3>
                    <StatusBadge status={memberDetail.status} size="sm" />
                    {memberDetail.isDeleted && <Badge variant="outline" className="text-xs text-destructive border-destructive">Deleted</Badge>}
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-2 text-sm text-muted-foreground">
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

              {(memberDetail.sex === 'male' || memberDetail.sex === 'female') && (
                <BodyFatCheck key={memberDetail.id} member={memberDetail} />
              )}

              {/* Subscriptions */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold">Subscriptions ({memberDetail.subscriptions?.length || 0})</h4>
                  {isManagerOrAbove && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-7 text-xs"
                      onClick={handleOpenSubscribe}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Subscribe
                    </Button>
                  )}
                </div>
                {!memberDetail.subscriptions?.length ? (
                  <p className="text-sm text-muted-foreground">No subscriptions yet</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {memberDetail.subscriptions.map((sub) => (
                      <div key={sub.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                        <div>
                          <div className="font-medium text-sm">{sub.service?.name ?? 'Unknown Service'}</div>
                          <div className="text-xs text-muted-foreground">{formatDate(sub.startDate)} — {formatDate(sub.endDate)}</div>
                          {(sub.hasVoidedPayment || sub.voidedPaymentNote) && (
                            <div className="text-[11px] text-amber-600 flex items-start gap-1 mt-0.5" title={sub.voidedPaymentNote || ''}>
                              <AlertTriangle className="h-3 w-3 shrink-0 mt-px" />
                              <span>{sub.voidedPaymentNote || 'A payment was voided on this subscription'}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{formatCurrency(sub.priceSnapshot)}</span>
                          <Badge variant={sub.status === 'active' ? 'default' : sub.status === 'expired' ? 'secondary' : 'outline'} className="text-xs">{sub.status}</Badge>
                          {isManagerOrAbove && (sub.status === 'expired' || sub.status === 'cancelled') && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-7 text-xs"
                              onClick={() => {
                                setSubscriptionToRenew(sub);
                                setRenewPaymentMethod('cash');
                                setRenewDialogOpen(true);
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
              {isManagerOrAbove && (
                <div>
                  <h4 className="font-semibold mb-3">Payments ({memberDetail.payments?.length || 0})</h4>
                  {!memberDetail.payments?.length ? (
                    <p className="text-sm text-muted-foreground">No payments yet</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {memberDetail.payments.map((p) => (
                        <div key={p.id} className={`flex items-center justify-between p-3 rounded-lg border bg-muted/30 ${p.isVoided ? 'opacity-50' : ''}`}>
                          <div>
                            <div className="font-medium text-sm">{p.receiptNumber}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatDate(p.paymentDate)}
                              {p.subscription?.service?.name ? ` — ${p.subscription.service.name}` : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{formatCurrency(p.amount)}</span>
                            <Badge variant={p.isVoided ? 'outline' : 'secondary'} className="text-xs">
                              {p.isVoided ? 'VOIDED' : p.method.replace('_', ' ')}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}


            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ─── Renew Subscription Confirmation Dialog ────────────────────── */}
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
                  Renewing <strong>{subscriptionToRenew.service?.name ?? 'Unknown Service'}</strong> for{' '}
                  <strong>{memberDetail ? formatMemberName(memberDetail) : ''}</strong>.
                </p>
                <div className="p-3 rounded-lg bg-muted/50 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Service:</span>
                    <span className="font-medium">{subscriptionToRenew.service?.name ?? 'Unknown Service'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price:</span>
                    <span className="font-bold text-emerald-600">{formatCurrency(subscriptionToRenew.priceSnapshot)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Status:</span>
                    <Badge variant={subscriptionToRenew.status === 'expired' ? 'secondary' : 'outline'} className="text-xs">{subscriptionToRenew.status}</Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="member-renew-payment-method">Payment Method</Label>
                  <Select value={renewPaymentMethod} onValueChange={setRenewPaymentMethod}>
                    <SelectTrigger className="w-full" id="member-renew-payment-method">
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

      {/* ─── New Subscription Dialog (existing member) ─────────────────── */}
      <Dialog open={subscribeDialogOpen} onOpenChange={setSubscribeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-emerald-600" />
              New Subscription
            </DialogTitle>
            <DialogDescription>
              Subscribe {memberDetail ? formatMemberName(memberDetail) : ''} to a service and record the payment in one step.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="member-sub-service">Service *</Label>
              <Select
                value={subscribeServiceId}
                onValueChange={(v) => { setSubscribeServiceId(v); setSubscribeError(null); }}
              >
                <SelectTrigger id="member-sub-service">
                  <SelectValue placeholder="Select a service" />
                </SelectTrigger>
                <SelectContent>
                  {subscribeServices.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} — {formatCurrency(s.price)} ({s.duration} days)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {subscribeError && <p className="text-xs text-destructive">{subscribeError}</p>}
            </div>
            {subscribeServiceId && (() => {
              const svc = subscribeServices.find((s) => s.id === subscribeServiceId);
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
              <Label htmlFor="member-sub-payment-method">Payment Method</Label>
              <Select value={subscribePaymentMethod} onValueChange={setSubscribePaymentMethod}>
                <SelectTrigger className="w-full" id="member-sub-payment-method">
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-sub-notes">Notes (Optional)</Label>
              <Textarea
                id="member-sub-notes"
                value={subscribeNotes}
                onChange={(e) => setSubscribeNotes(e.target.value)}
                placeholder="Subscription notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubscribeDialogOpen(false)} disabled={subscribing}>
              Cancel
            </Button>
            <Button
              onClick={handleSubscribeMember}
              disabled={subscribing}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {subscribing ? 'Subscribing...' : 'Subscribe & Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Photo Lightbox ─────────────────────────────────────────────────── */}
      {photoPreviewOpen && memberDetail?.photo && (
        <PhotoLightbox
          src={memberDetail.photo}
          alt={formatMemberName(memberDetail)}
          onClose={() => setPhotoPreviewOpen(false)}
        />
      )}

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

/** Body-fat check (U.S. Navy method): live re-measure + compare vs stored baseline. */
function BodyFatCheck({ member }: { member: MemberDetail }) {
  const sex = member.sex;
  const [neck, setNeck] = useState(member.neck?.toString() || '');
  const [waist, setWaist] = useState(member.waist?.toString() || '');
  const [hip, setHip] = useState(member.hip?.toString() || '');

  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  const current = calculateNavyBodyFatPercent({
    sex,
    heightCm: member.height,
    neckCm: num(neck),
    waistCm: num(waist),
    hipCm: num(hip),
  });

  const hasInput = neck.trim() !== '' || waist.trim() !== '' || hip.trim() !== '';
  const canCompute = hasNavyBodyFatData({
    sex,
    heightCm: member.height,
    neckCm: num(neck),
    waistCm: num(waist),
    hipCm: num(hip),
  });

  const baseline = member.bodyFatPercent;
  const baselineExists = baseline != null;

  let delta: number | null = null;
  if (current != null && baselineExists) delta = current - baseline;

  const reset = () => {
    setNeck(member.neck?.toString() || '');
    setWaist(member.waist?.toString() || '');
    setHip(member.hip?.toString() || '');
  };

  return (
    <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Heart className="h-4 w-4 text-emerald-600" />
          Body Composition (U.S. Navy)
        </h4>
        <span className="text-xs text-muted-foreground capitalize">{sex} · {member.height != null ? `${member.height} cm` : 'height not set'}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label htmlFor="bf-neck" className="text-xs">Neck (cm)</Label>
          <Input id="bf-neck" type="number" step="0.1" value={neck} onChange={(e) => setNeck(e.target.value)} placeholder="38" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="bf-waist" className="text-xs">Waist (cm)</Label>
          <Input id="bf-waist" type="number" step="0.1" value={waist} onChange={(e) => setWaist(e.target.value)} placeholder="84" />
        </div>
        {sex === 'female' && (
          <div className="space-y-1">
            <Label htmlFor="bf-hip" className="text-xs">Hip (cm)</Label>
            <Input id="bf-hip" type="number" step="0.1" value={hip} onChange={(e) => setHip(e.target.value)} placeholder="98" />
          </div>
        )}
      </div>

      {hasInput && !canCompute ? (
        <p className="text-xs text-amber-600">
          {sex === 'female' && waist !== '' && hip.trim() === ''
            ? 'Enter the hip measurement to compute body fat.'
            : waist !== '' && neck !== '' && Number(waist) <= Number(neck)
              ? 'Waist must be greater than neck to compute body fat.'
              : 'Enter valid measurements — waist must be greater than neck.'}
        </p>
      ) : (
        current != null && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Current:</span>
              <span className="font-bold text-emerald-700">{current.toFixed(1)}%</span>
            </div>
            {baselineExists ? (
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <span className="text-muted-foreground">Previous: {baseline!.toFixed(1)}%</span>
                {Math.abs(delta!) < 0.05 ? (
                  <span className="text-sm text-muted-foreground">· no change</span>
                ) : delta! < 0 ? (
                  <span className="flex items-center gap-0.5 text-emerald-700 font-medium">
                    <TrendingDown className="h-4 w-4" />
                    {delta!.toFixed(1)}%
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5 text-amber-600 font-medium">
                    <TrendingUp className="h-4 w-4" />
                    +{delta!.toFixed(1)}%
                  </span>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No previous measurement on record — add one via Edit Member to enable comparison.</p>
            )}
          </div>
        )
      )}

      {hasInput && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
        </div>
      )}
    </div>
  );
}

/** Member Card (mobile layout) */
function MemberCard({ member, isManagerOrAbove, onView, onEdit, onDelete, onRestore }: {
  member: Member; isManagerOrAbove: boolean;
  onView: (m: Member) => void; onEdit: (m: Member) => void; onDelete: (m: Member) => void; onRestore: (m: Member) => void;
}) {
  return (
    <Card className={member.isDeleted ? 'opacity-60 cursor-pointer' : 'cursor-pointer'} onClick={() => onView(member)}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <MemberAvatar photo={member.photo} photoThumb={member.photoThumb} firstName={member.firstName} lastName={member.lastName} size="md" />
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
              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onView(member); }}><Eye className="h-3.5 w-3.5" /></Button>
              {isManagerOrAbove && !member.isDeleted && <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onEdit(member); }}><Pencil className="h-3.5 w-3.5" /></Button>}
              {isManagerOrAbove && member.isDeleted && <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onRestore(member); }}><RotateCcw className="h-3.5 w-3.5" /></Button>}
              {isManagerOrAbove && !member.isDeleted && <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(member); }}><Trash2 className="h-3.5 w-3.5" /></Button>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Member Actions (desktop table) */
function MemberActions({ member, isManagerOrAbove, onView, onEdit, onDelete, onRestore }: {
  member: Member; isManagerOrAbove: boolean;
  onView: (m: Member) => void; onEdit: (m: Member) => void; onDelete: (m: Member) => void; onRestore: (m: Member) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="View member" onClick={(e) => { e.stopPropagation(); onView(member); }}><Eye className="h-4 w-4" /></Button>
      {isManagerOrAbove && !member.isDeleted && <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Edit member" onClick={(e) => { e.stopPropagation(); onEdit(member); }}><Pencil className="h-4 w-4" /></Button>}
      {isManagerOrAbove && member.isDeleted && <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Restore member" onClick={(e) => { e.stopPropagation(); onRestore(member); }}><RotateCcw className="h-4 w-4" /></Button>}
      {isManagerOrAbove && !member.isDeleted && <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" aria-label="Delete member" onClick={(e) => { e.stopPropagation(); onDelete(member); }}><Trash2 className="h-4 w-4" /></Button>}
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

  const handlePhoneInput = (value: string) => {
    const digits = value.replace(/\D/g, '').replace(/^251/, '').replace(/^0/, '').slice(0, 9);
    updateField('phone', digits ? `+251${digits}` : '');
  };

  return (
    <div className="space-y-5">
      {/* Photo Section */}
      <PhotoCapture
        value={formData.photo}
        onChange={(url) => updateField('photo', url)}
        onThumbChange={(thumbUrl) => updateField('photoThumb', thumbUrl)}
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
            <Input id="firstName" value={formData.firstName} onChange={(e) => updateField('firstName', e.target.value)} placeholder="First name" className={formErrors.firstName ? 'border-destructive' : ''} />
            {formErrors.firstName && <p className="text-xs text-destructive">{formErrors.firstName}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Last Name *</Label>
            <Input id="lastName" value={formData.lastName} onChange={(e) => updateField('lastName', e.target.value)} placeholder="Last name" className={formErrors.lastName ? 'border-destructive' : ''} />
            {formErrors.lastName && <p className="text-xs text-destructive">{formErrors.lastName}</p>}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={formData.phone} onChange={(e) => handlePhoneInput(e.target.value)} placeholder="+251 9XX XXX XXX" className={formErrors.phone ? 'border-destructive' : ''} />
          {formErrors.phone && <p className="text-xs text-destructive">{formErrors.phone}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="address">Address</Label>
          <Input id="address" value={formData.address} onChange={(e) => updateField('address', e.target.value)} placeholder="Street, City" className={formErrors.address ? 'border-destructive' : ''} />
          {formErrors.address && <p className="text-xs text-destructive">{formErrors.address}</p>}
        </div>
      </div>

      <Separator />

      {/* Physical Info */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground">Physical Information</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="weight">Weight (kg)</Label>
            <Input id="weight" type="number" step="0.1" value={formData.weight} onChange={(e) => updateField('weight', e.target.value)} placeholder="70" className={formErrors.weight ? 'border-destructive' : ''} />
            {formErrors.weight && <p className="text-xs text-destructive">{formErrors.weight}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="height">Height (cm)</Label>
            <Input id="height" type="number" step="0.1" value={formData.height} onChange={(e) => updateField('height', e.target.value)} placeholder="175" className={formErrors.height ? 'border-destructive' : ''} />
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
            {formErrors.bloodType && <p className="text-xs text-destructive">{formErrors.bloodType}</p>}
          </div>
        </div>

        {/* Body composition (U.S. Navy method, all in cm) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sex">Sex</Label>
            <Select value={formData.sex} onValueChange={(v) => updateField('sex', v)}>
              <SelectTrigger id="sex"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {sexOptions.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formErrors.sex && <p className="text-xs text-destructive">{formErrors.sex}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="neck">Neck (cm)</Label>
            <Input id="neck" type="number" step="0.1" value={formData.neck} onChange={(e) => updateField('neck', e.target.value)} placeholder="38" className={formErrors.neck ? 'border-destructive' : ''} />
            {formErrors.neck && <p className="text-xs text-destructive">{formErrors.neck}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="waist">Waist (cm)</Label>
            <Input id="waist" type="number" step="0.1" value={formData.waist} onChange={(e) => updateField('waist', e.target.value)} placeholder="84" className={formErrors.waist ? 'border-destructive' : ''} />
            {formErrors.waist && <p className="text-xs text-destructive">{formErrors.waist}</p>}
          </div>
          {formData.sex === 'female' && (
            <div className="space-y-1.5">
              <Label htmlFor="hip">Hip (cm)</Label>
              <Input id="hip" type="number" step="0.1" value={formData.hip} onChange={(e) => updateField('hip', e.target.value)} placeholder="98" className={formErrors.hip ? 'border-destructive' : ''} />
              {formErrors.hip && <p className="text-xs text-destructive">{formErrors.hip}</p>}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Waist: measured horizontally at the navel for men, or the narrowest point for women. Neck: just below the larynx. Measured with a flexible, non-stretch tape, not pulled tight.
        </p>
        {(() => {
          const sex = formData.sex === 'male' || formData.sex === 'female' ? formData.sex : null;
          const previewBodyFat = calculateNavyBodyFatPercent({
            sex,
            heightCm: formData.height ? Number(formData.height) : null,
            neckCm: formData.neck ? Number(formData.neck) : null,
            waistCm: formData.waist ? Number(formData.waist) : null,
            hipCm: formData.hip ? Number(formData.hip) : null,
          });
          if (previewBodyFat == null && !hasNavyBodyFatData({
            sex,
            heightCm: formData.height ? Number(formData.height) : null,
            neckCm: formData.neck ? Number(formData.neck) : null,
            waistCm: formData.waist ? Number(formData.waist) : null,
            hipCm: formData.hip ? Number(formData.hip) : null,
          })) return null;
          return (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm">
              <Heart className="h-4 w-4" />
              {previewBodyFat != null ? (
                <span>Body Fat (U.S. Navy): {previewBodyFat.toFixed(1)}%</span>
              ) : (
                <span>
                  {sex === 'female'
                    ? 'Waist + hip must be greater than neck to calculate body fat'
                    : 'Waist must be greater than neck to calculate body fat'}
                </span>
              )}
            </div>
          );
        })()}
      </div>

      <Separator />

      {/* Additional Info */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground">Additional Information</h4>
        <div className="space-y-1.5">
          <Label htmlFor="emergencyContact">Emergency Contact</Label>
          <Input id="emergencyContact" value={formData.emergencyContact} onChange={(e) => updateField('emergencyContact', e.target.value)} placeholder="Name and phone number" className={formErrors.emergencyContact ? 'border-destructive' : ''} />
          {formErrors.emergencyContact && <p className="text-xs text-destructive">{formErrors.emergencyContact}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" value={formData.notes} onChange={(e) => updateField('notes', e.target.value)} placeholder="Any additional notes..." rows={2} className={formErrors.notes ? 'border-destructive' : ''} />
          {formErrors.notes && <p className="text-xs text-destructive">{formErrors.notes}</p>}
        </div>
      </div>
    </div>
  );
}
