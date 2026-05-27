'use client';

import { useEffect, useState, useCallback } from 'react';
import { dashboardApi } from '@/lib/api-client';
import { StatusBadge } from '@/components/status-badge';
import { MemberAvatar } from '@/components/member-avatar';
import { formatCurrency, formatDate, formatMemberName, formatPaymentMethod } from '@/lib/format';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  Calendar,
  AlertTriangle,
  CreditCard,
  TrendingUp,
  ArrowRight,
  AlertCircle,
  Clock,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// Types matching the API response
interface ExpiringSoonMember {
  memberId: string;
  firstName: string;
  lastName: string;
  photo?: string | null;
  subscriptionId: string;
  serviceName: string;
  endDate: string;
  priceSnapshot: number;
}

interface RecentlyExpiredMember {
  memberId: string;
  firstName: string;
  lastName: string;
  photo?: string | null;
  subscriptionId: string;
  endDate: string;
}

interface RecentPayment {
  id: string;
  amount: number;
  paymentDate: string;
  method: string;
  receiptNumber: string;
  memberName: string;
  memberId: string;
}

interface MonthlyRevenue {
  month: string;
  revenue: number;
}

interface DashboardData {
  totalMembers: number;
  activeSubscriptions: number;
  expiringSoonCount: number;
  expiredCount: number;
  totalRevenue: number;
  revenueThisMonth: number;
  pendingInvoices: number;
  expiringSoonMembers: ExpiringSoonMember[];
  recentlyExpiredMembers: RecentlyExpiredMember[];
  recentPayments: RecentPayment[];
  monthlyRevenue: MonthlyRevenue[];
}

// Custom Tooltip for the chart
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-md">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground">
          {formatCurrency(payload[0].value)}
        </p>
      </div>
    );
  }
  return null;
}

// Loading skeleton for stats cards
function StatsCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16 mb-1" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  );
}

// Loading skeleton for alert lists
function AlertListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

// Loading skeleton for the payments table
function PaymentsTableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { setCurrentPage } = useAppStore();

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await dashboardApi.get() as DashboardData;
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Stats cards configuration
  const statsCards = data
    ? [
        {
          title: 'Total Members',
          value: data.totalMembers,
          icon: Users,
          color: 'text-primary',
          bgColor: 'bg-primary/10',
          description: 'All registered members',
        },
        {
          title: 'Active Subscriptions',
          value: data.activeSubscriptions,
          icon: Calendar,
          color: 'text-emerald-600',
          bgColor: 'bg-emerald-50',
          description: 'Currently active',
        },
        {
          title: 'Expiring Soon',
          value: data.expiringSoonCount,
          icon: AlertTriangle,
          color: 'text-amber-600',
          bgColor: 'bg-amber-50',
          description: 'Within 7 days',
        },
        {
          title: 'Expired',
          value: data.expiredCount,
          icon: AlertCircle,
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          description: 'Needs renewal',
        },
      ]
    : [];

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your fitness center</p>
        </div>
        <Card className="border-destructive/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h3 className="text-lg font-semibold mb-1">Failed to load dashboard</h3>
            <p className="text-muted-foreground text-sm mb-4">{error}</p>
            <Button onClick={fetchDashboard} variant="outline">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your fitness center</p>
        </div>
        {data && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            <span>
              {formatCurrency(data.revenueThisMonth)} this month
            </span>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatsCardSkeleton key={i} />)
        ) : (
          statsCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title} className="relative overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardDescription className="text-xs font-medium">
                    {card.title}
                  </CardDescription>
                  <div className={`${card.bgColor} rounded-md p-2`}>
                    <Icon className={`h-4 w-4 ${card.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{card.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {card.description}
                  </p>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Alert Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expiring Soon */}
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-amber-100 rounded-md p-1.5">
                  <Clock className="h-4 w-4 text-amber-600" />
                </div>
                <CardTitle className="text-base">Expiring Soon</CardTitle>
              </div>
              {data && data.expiringSoonMembers.length > 0 && (
                <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                  {data.expiringSoonMembers.length} member{data.expiringSoonMembers.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs">
              Members whose subscriptions expire within 7 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <AlertListSkeleton />
            ) : !data?.expiringSoonMembers.length ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Calendar className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No subscriptions expiring soon
                </p>
              </div>
            ) : (
              <div className="space-y-1 max-h-80 overflow-y-auto custom-scrollbar">
                {data.expiringSoonMembers.map((member) => (
                  <div
                    key={member.subscriptionId}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-amber-100/50 transition-colors"
                  >
                    <MemberAvatar
                      photo={member.photo}
                      firstName={member.firstName}
                      lastName={member.lastName}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {formatMemberName(member)}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{member.serviceName}</span>
                        <span className="text-amber-600 font-medium">
                          Ends {formatDate(member.endDate)}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-primary hover:text-primary/80 shrink-0 h-8 text-xs"
                      onClick={() => setCurrentPage('payments')}
                    >
                      Record Payment
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recently Expired */}
        <Card className="border-red-200 bg-red-50/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-red-100 rounded-md p-1.5">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                </div>
                <CardTitle className="text-base">Recently Expired</CardTitle>
              </div>
              {data && data.recentlyExpiredMembers.length > 0 && (
                <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-xs">
                  {data.recentlyExpiredMembers.length} member{data.recentlyExpiredMembers.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs">
              Members whose subscriptions have expired
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <AlertListSkeleton />
            ) : !data?.recentlyExpiredMembers.length ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Calendar className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No recently expired subscriptions
                </p>
              </div>
            ) : (
              <div className="space-y-1 max-h-80 overflow-y-auto custom-scrollbar">
                {data.recentlyExpiredMembers.map((member) => (
                  <div
                    key={member.subscriptionId}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-red-100/50 transition-colors"
                  >
                    <MemberAvatar
                      photo={member.photo}
                      firstName={member.firstName}
                      lastName={member.lastName}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {formatMemberName(member)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Expired {formatDate(member.endDate)}
                      </p>
                    </div>
                    <StatusBadge status="expired" size="sm" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Payments & Monthly Revenue Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Payments */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-primary/10 rounded-md p-1.5">
                  <CreditCard className="h-4 w-4 text-primary" />
                </div>
                <CardTitle className="text-base">Recent Payments</CardTitle>
              </div>
              {data && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-foreground h-8"
                  onClick={() => setCurrentPage('payments')}
                >
                  View All
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              )}
            </div>
            <CardDescription className="text-xs">
              Last 10 recorded payments
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <PaymentsTableSkeleton />
            ) : !data?.recentPayments.length ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CreditCard className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No recent payments
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6 px-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Member</TableHead>
                      <TableHead className="text-xs">Amount</TableHead>
                      <TableHead className="text-xs">Method</TableHead>
                      <TableHead className="text-xs">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentPayments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="text-sm font-medium py-2">
                          {payment.memberName}
                        </TableCell>
                        <TableCell className="text-sm py-2">
                          <span className="font-medium text-emerald-600">
                            {formatCurrency(payment.amount)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm py-2">
                          <Badge variant="secondary" className="text-xs font-normal">
                            {formatPaymentMethod(payment.method)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground py-2">
                          {formatDate(payment.paymentDate)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Revenue Chart */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="bg-emerald-50 rounded-md p-1.5">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-base">Monthly Revenue</CardTitle>
                <CardDescription className="text-xs">
                  Last 6 months revenue trend
                </CardDescription>
              </div>
            </div>
            {data && (
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-bold text-emerald-600">
                  {formatCurrency(data.totalRevenue)}
                </span>
                <span className="text-xs text-muted-foreground">total</span>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <Skeleton className="h-full w-full" />
              </div>
            ) : !data?.monthlyRevenue.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <TrendingUp className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No revenue data available
                </p>
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.monthlyRevenue}
                    margin={{ top: 5, right: 5, left: -15, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="hsl(var(--border))"
                      opacity={0.5}
                    />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value) => {
                        if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
                        return value;
                      }}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar
                      dataKey="revenue"
                      fill="hsl(152, 69%, 31%)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={48}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
