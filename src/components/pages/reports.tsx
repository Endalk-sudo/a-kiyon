'use client';

import { useState, useEffect, useCallback } from 'react';
import { exportApi, dashboardApi } from '@/lib/api-client';
import { formatCurrency } from '@/lib/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useAppStore } from '@/lib/store';
import { t } from '@/lib/messages';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Download, DollarSign, TrendingUp } from 'lucide-react';
import { EthiopianDateInput } from '@/components/ethiopian-date-input';

interface DashboardData {
  totalRevenue: number;
  revenueThisMonth: number;
  monthlyRevenue: { month: string; revenue: number }[];
}

export function ReportsPage() {
  const locale = useAppStore((s) => s.locale);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'members' | 'payments' | null>(null);

  // Export date range (Ethiopian calendar)
  const [dateFrom, setDateFrom] = useState('');
  const [dateFromIso, setDateFromIso] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState('');
  const [dateToIso, setDateToIso] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = (await dashboardApi.get()) as DashboardData;
        setDashboardData(data);
      } catch {
        toast.error(t(locale, 'Failed to load report data', 'የሪፖርት መረጃዎችን መጫን አልተሳካም'));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [locale]);

  const downloadCSV = useCallback(async (type: 'members' | 'payments') => {
    setExporting(type);
    try {
      const params = {
        ...(dateFromIso ? { startDate: dateFromIso } : {}),
        ...(dateToIso ? { endDate: dateToIso } : {}),
      };
      const result = await exportApi[type](params);
      const blob = new Blob([result], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}_export_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t(locale, `${type === 'members' ? 'Members' : 'Payments'} CSV exported successfully`, `${type === 'members' ? 'የአባላት' : 'የክፍያ'} ሪፖርት በተሳካ ሁኔታ ወርዷል`));
    } catch {
      toast.error(t(locale, `Failed to export ${type === 'members' ? 'members' : 'payments'} CSV`, `${type === 'members' ? 'የአባላት' : 'የክፍያ'} ሪፖርት ማውረድ አልተሳካም`));
    } finally {
      setExporting(null);
    }
  }, [dateFromIso, dateToIso, locale]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const revenueChartData = (dashboardData?.monthlyRevenue || []).map((item) => ({
    ...item,
    revenue: Number(item.revenue),
  }));

  return (
    <div className="space-y-6">
      {/* Revenue Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(dashboardData?.totalRevenue || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              All-time non-voided payments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(dashboardData?.revenueThisMonth || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Current month collections
            </p>
          </CardContent>
        </Card>

      </div>

      {/* Revenue Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Revenue</CardTitle>
          <CardDescription>Revenue over the last 6 months</CardDescription>
        </CardHeader>
        <CardContent>
          {revenueChartData.length > 0 ? (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueChartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar
                    dataKey="revenue"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={60}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No revenue data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export Section */}
      <Card>
        <CardHeader>
          <CardTitle>Export Data</CardTitle>
          <CardDescription>
            Download all member or payment data as CSV files.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Date Range Filter */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <EthiopianDateInput
              value={dateFrom}
              onChange={(val, iso) => { setDateFrom(val); setDateFromIso(iso); }}
              label="From (EC)"
            />
            <EthiopianDateInput
              value={dateTo}
              onChange={(val, iso) => { setDateTo(val); setDateToIso(iso); }}
              label="To (EC)"
            />
          </div>

          {/* Export Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={() => downloadCSV('members')}
              disabled={exporting !== null}
              className="flex-1"
            >
              {exporting === 'members' ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export Members CSV
                </>
              )}
            </Button>
            <Button
              onClick={() => downloadCSV('payments')}
              disabled={exporting !== null}
              variant="outline"
              className="flex-1"
            >
              {exporting === 'payments' ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export Payments CSV
                </>
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            The date range filters members by created date and payments by payment date.
            Leave both fields empty to export all data.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
