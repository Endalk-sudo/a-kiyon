import type {
  PaginatedResponse,
  MemberResponse,
  ServiceRecord,
  SubscriptionRecord,
  PaymentRecord,
  AuditLogRecord,
  UserRecord,
  CreateUserBody,
  DashboardData,
} from './api-types';
import { getCurrentToken } from './auth-client';

const API_BASE = '/api';

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { params, ...fetchOptions } = options;

  let url = `${API_BASE}${path}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value));
      }
    });
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const token = getCurrentToken();

  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...fetchOptions.headers,
    },
  });

  if (response.status === 401) {
    return { data: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 0 } } as T;
  }

  if (response.status === 403) {
    throw new Error('Forbidden');
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('text/csv')) {
    return response.text() as T;
  }

  return response.json();
}

// Members
export const membersApi = {
  list: (params?: Record<string, string | number | boolean | undefined>) =>
    apiFetch<PaginatedResponse<MemberResponse>>('/members', { params }),
  get: (id: string) =>
    apiFetch<MemberResponse>(`/members/${id}`),
  create: (data: Partial<MemberResponse>) =>
    apiFetch<MemberResponse>('/members', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<MemberResponse>) =>
    apiFetch<MemberResponse>(`/members/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiFetch<{ message: string }>(`/members/${id}`, { method: 'DELETE' }),
  restore: (id: string) =>
    apiFetch<MemberResponse>(`/members/${id}/restore`, { method: 'POST' }),
};

// Services
export const servicesApi = {
  list: (params?: Record<string, string | number | boolean | undefined>) =>
    apiFetch<{ data: ServiceRecord[] }>('/services', { params }),
  create: (data: Partial<ServiceRecord>) =>
    apiFetch<ServiceRecord>('/services', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<ServiceRecord>) =>
    apiFetch<ServiceRecord>(`/services/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiFetch<{ message: string }>(`/services/${id}`, { method: 'DELETE' }),
};

// Subscriptions
export const subscriptionsApi = {
  list: (params?: Record<string, string | number | boolean | undefined>) =>
    apiFetch<PaginatedResponse<SubscriptionRecord>>('/subscriptions', { params }),
  get: (id: string) =>
    apiFetch<SubscriptionRecord>(`/subscriptions/${id}`),
  create: (data: Partial<SubscriptionRecord>) =>
    apiFetch<SubscriptionRecord>('/subscriptions', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<SubscriptionRecord>) =>
    apiFetch<SubscriptionRecord>(`/subscriptions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  renew: (id: string, data?: { paymentMethod: string }) =>
    apiFetch<{ subscription: SubscriptionRecord; payment: { id: string; amount: number; receiptNumber: string } }>(`/subscriptions/${id}/renew`, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
};

// Payments
export const paymentsApi = {
  list: (params?: Record<string, string | number | boolean | undefined>) =>
    apiFetch<PaginatedResponse<PaymentRecord>>('/payments', { params }),
  get: (id: string) =>
    apiFetch<PaymentRecord>(`/payments/${id}`),
  create: (data: Partial<PaymentRecord>) =>
    apiFetch<PaymentRecord>('/payments', { method: 'POST', body: JSON.stringify(data) }),
  void: (id: string) =>
    apiFetch<PaymentRecord>(`/payments/${id}/void`, { method: 'POST' }),
};

// Dashboard
export const dashboardApi = {
  get: () =>
    apiFetch<DashboardData>('/dashboard'),
};

// Audit Logs
export const auditLogsApi = {
  list: (params?: Record<string, string | number | boolean | undefined>) =>
    apiFetch<PaginatedResponse<AuditLogRecord>>('/audit-logs', { params }),
};

// Users
export const usersApi = {
  list: () =>
    apiFetch<{ data: UserRecord[] }>('/users'),
  get: (id: string) =>
    apiFetch<UserRecord>(`/users/${id}`),
  create: (data: CreateUserBody) =>
    apiFetch<UserRecord>('/users', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<UserRecord>) =>
    apiFetch<UserRecord>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deactivate: (id: string) =>
    apiFetch<{ message: string }>(`/users/${id}`, { method: 'DELETE' }),
};

// Export
export const exportApi = {
  members: (params?: Record<string, string | number | boolean | undefined>) =>
    apiFetch<string>('/export/members', { params }),
  payments: (params?: Record<string, string | number | boolean | undefined>) =>
    apiFetch<string>('/export/payments', { params }),
};
