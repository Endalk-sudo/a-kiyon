'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { authApi } from '@/lib/api-client';
import { LoginForm } from '@/components/login-form';
import { AppLayout } from '@/components/app-layout';
import { DashboardPage } from '@/components/pages/dashboard';
import { MembersPage } from '@/components/pages/members';
import { ServicesPage } from '@/components/pages/services';
import { SubscriptionsPage } from '@/components/pages/subscriptions';
import { InvoicesPage } from '@/components/pages/invoices';
import { PaymentsPage } from '@/components/pages/payments';
import { ReportsPage } from '@/components/pages/reports';
import { AuditLogsPage } from '@/components/pages/audit-logs';
import { SettingsPage } from '@/components/pages/settings';
import { Loader2 } from 'lucide-react';

const pageComponents: Record<string, React.ComponentType> = {
  dashboard: DashboardPage,
  members: MembersPage,
  services: ServicesPage,
  subscriptions: SubscriptionsPage,
  invoices: InvoicesPage,
  payments: PaymentsPage,
  reports: ReportsPage,
  'audit-logs': AuditLogsPage,
  settings: SettingsPage,
};

export default function Home() {
  const { session, setSession, currentPage, isAuthenticated } = useAppStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const result = await authApi.getSession();
        const sessionData = result as unknown as {
          userId: string;
          email: string;
          name: string;
          role: 'owner' | 'manager';
        };
        setSession(sessionData);
      } catch {
        setSession(null);
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, [setSession]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !session) {
    return <LoginForm />;
  }

  const PageComponent = pageComponents[currentPage] || DashboardPage;

  return (
    <AppLayout>
      <PageComponent />
    </AppLayout>
  );
}
