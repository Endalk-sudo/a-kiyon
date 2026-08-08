export interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationInfo;
}

export interface MemberInfo {
  id: string;
  firstName: string;
  lastName: string;
  /** Render-ready URL (presigned when B2 is configured). */
  photo: string | null;
  photoThumb?: string | null;
  /** Canonical stored values — safe to persist back on edit. */
  photoPath?: string | null;
  photoThumbPath?: string | null;
}

export interface MemberResponse extends MemberInfo {
  phone: string | null;
  address: string | null;
  weight: number | null;
  height: number | null;
  bloodType: string | null;
  sex: 'male' | 'female' | null;
  neck: number | null;
  waist: number | null;
  hip: number | null;
  bodyFatPercent: number | null;
  emergencyContact: string | null;
  notes: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  status: 'active' | 'expiring_soon' | 'expired' | 'no_subscription';
  subscriptionEndDate: string | null;
}

export interface PaymentMemberInfo {
  id: string;
  firstName: string;
  lastName: string;
  photo?: string | null;
  photoThumb?: string | null;
}

export interface PaymentRecord {
  id: string;
  subscriptionId: string;
  memberId: string;
  amount: number;
  paymentDate: string;
  method: string;
  receiptNumber: string;
  isVoided: boolean;
  voidedAt: string | null;
  voidedBy: string | null;
  notes: string | null;
  member: PaymentMemberInfo;
  subscription: {
    id: string;
    startDate: string;
    endDate: string;
    status: string;
    priceSnapshot: number;
    service: { name: string };
  };
  user?: { id: string; name: string; email: string };
}

export interface SubscriptionMemberInfo {
  id: string;
  firstName: string;
  lastName: string;
  photo: string | null;
  photoThumb?: string | null;
  phone?: string;
}

export interface SubscriptionRecord {
  id: string;
  memberId: string;
  serviceId: string;
  startDate: string;
  endDate: string;
  status: string;
  priceSnapshot: number;
  hasVoidedPayment?: boolean;
  voidedPaymentNote?: string | null;
  notes?: string | null;
  member: SubscriptionMemberInfo;
  service: { id: string; name: string; nameAm: string | null; price: number; duration: number };
  payments?: PaymentRecord[];
}

export interface ServiceRecord {
  id: string;
  name: string;
  nameAm: string | null;
  description: string | null;
  descriptionAm: string | null;
  price: number;
  duration: number;
  isActive: boolean;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateUserBody {
  phone: string;
  name: string;
  password: string;
  role: string;
}

export interface UpdateUserBody {
  name?: string;
  role?: string;
  phone?: string | null;
  password?: string;
  isActive?: boolean;
}

export interface DashboardData {
  totalMembers: number;
  activeSubscriptions: number;
  expiringSoonCount: number;
  expiredCount: number;
  totalRevenue: number;
  revenueThisMonth: number;
  expiringSoonMembers: Array<{
    memberId: string;
    firstName: string;
    lastName: string;
    photo?: string | null;
    photoThumb?: string | null;
    subscriptionId: string;
    serviceName: string;
    serviceNameAm: string | null;
    endDate: string;
    priceSnapshot: number;
  }>;
  recentlyExpiredMembers: Array<{
    memberId: string;
    firstName: string;
    lastName: string;
    photo?: string | null;
    photoThumb?: string | null;
    subscriptionId: string;
    endDate: string;
  }>;
  recentPayments: Array<{
    id: string;
    amount: number;
    paymentDate: string;
    method: string;
    receiptNumber: string;
    memberName: string;
    memberId: string;
  }>;
  monthlyRevenue: Array<{
    monthNameEN: string;
    monthNameAM: string;
    ecYear: number;
    revenue: number;
  }>;
}
