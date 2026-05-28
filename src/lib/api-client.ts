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

  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
  });

  if (response.status === 401) {
    // Silently return empty data instead of throwing — the login form will show
    return { data: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 0 } } as unknown as T;
  }
  
  if (response.status === 403) {
    throw new Error('Forbidden');
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  // For CSV downloads
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('text/csv')) {
    return response.text() as unknown as T;
  }

  return response.json();
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Members
export const membersApi = {
  list: (params?: Record<string, unknown>) =>
    apiFetch<PaginatedResponse<unknown>>('/members', { params: params as Record<string, string | number | boolean | undefined> }),
  get: (id: string) =>
    apiFetch<unknown>(`/members/${id}`),
  create: (data: unknown) =>
    apiFetch<unknown>('/members', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    apiFetch<unknown>(`/members/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiFetch<unknown>(`/members/${id}`, { method: 'DELETE' }),
  restore: (id: string) =>
    apiFetch<unknown>(`/members/${id}/restore`, { method: 'POST' }),
};

// Services
export const servicesApi = {
  list: (params?: Record<string, unknown>) =>
    apiFetch<{ data: unknown[] }>('/services', { params: params as Record<string, string | number | boolean | undefined> }),
  create: (data: unknown) =>
    apiFetch<unknown>('/services', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    apiFetch<unknown>(`/services/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiFetch<unknown>(`/services/${id}`, { method: 'DELETE' }),
};

// Subscriptions
export const subscriptionsApi = {
  list: (params?: Record<string, unknown>) =>
    apiFetch<PaginatedResponse<unknown>>('/subscriptions', { params: params as Record<string, string | number | boolean | undefined> }),
  get: (id: string) =>
    apiFetch<unknown>(`/subscriptions/${id}`),
  create: (data: unknown) =>
    apiFetch<unknown>('/subscriptions', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    apiFetch<unknown>(`/subscriptions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  renew: (id: string) =>
    apiFetch<unknown>(`/subscriptions/${id}/renew`, { method: 'POST' }),
};

// Invoices
export const invoicesApi = {
  list: (params?: Record<string, unknown>) =>
    apiFetch<PaginatedResponse<unknown>>('/invoices', { params: params as Record<string, string | number | boolean | undefined> }),
  get: (id: string) =>
    apiFetch<unknown>(`/invoices/${id}`),
  update: (id: string, data: unknown) =>
    apiFetch<unknown>(`/invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

// Payments
export const paymentsApi = {
  list: (params?: Record<string, unknown>) =>
    apiFetch<PaginatedResponse<unknown>>('/payments', { params: params as Record<string, string | number | boolean | undefined> }),
  get: (id: string) =>
    apiFetch<unknown>(`/payments/${id}`),
  create: (data: unknown) =>
    apiFetch<unknown>('/payments', { method: 'POST', body: JSON.stringify(data) }),
  void: (id: string) =>
    apiFetch<unknown>(`/payments/${id}/void`, { method: 'POST' }),
};

// Dashboard
export const dashboardApi = {
  get: () =>
    apiFetch<unknown>('/dashboard'),
};

// Audit Logs
export const auditLogsApi = {
  list: (params?: Record<string, unknown>) =>
    apiFetch<PaginatedResponse<unknown>>('/audit-logs', { params: params as Record<string, string | number | boolean | undefined> }),
};

// Users
export const usersApi = {
  list: () =>
    apiFetch<{ data: unknown[] }>('/users'),
  create: (data: unknown) =>
    apiFetch<unknown>('/users', { method: 'POST', body: JSON.stringify(data) }),
};

// Export
export const exportApi = {
  members: (params?: Record<string, unknown>) =>
    apiFetch<string>('/export/members', { params: params as Record<string, string | number | boolean | undefined> }),
  payments: (params?: Record<string, unknown>) =>
    apiFetch<string>('/export/payments', { params: params as Record<string, string | number | boolean | undefined> }),
};
