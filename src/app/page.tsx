'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { authClient } from '@/lib/auth-client';
import { AppLayout } from '@/components/app-layout';
import { LandingPage } from '@/components/pages/landing';
import { DashboardPage } from '@/components/pages/dashboard';
import { MembersPage } from '@/components/pages/members';
import { ServicesPage } from '@/components/pages/services';
import { SubscriptionsPage } from '@/components/pages/subscriptions';
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
        const { data } = await authClient.getSession();
        if (data?.user) {
          const u = data.user as { id: string; email: string; name: string | null; role?: string };
          setSession({
            userId: u.id,
            email: u.email,
            name: u.name || '',
            role: u.role || 'manager',
          });
        } else {
          setSession(null);
        }
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
    return <LandingPage />;
  }

  const PageComponent = pageComponents[currentPage] || DashboardPage;

  return (
    <AppLayout>
      <PageComponent />
    </AppLayout>
  );
}
