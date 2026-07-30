'use client';

import { Component, useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { authClient, initAuth, onAuthChange } from '@/lib/auth-client';
import { auth } from '@/lib/firebase-client';
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
import { StoragePage } from '@/components/pages/storage';
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
  storage: StoragePage,
};

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <h2 className="text-xl font-bold text-destructive mb-2">Something went wrong</h2>
          <p className="text-muted-foreground mb-4">An unexpected error occurred. Try refreshing the page.</p>
          <button
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
            onClick={() => this.setState({ hasError: false })}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Home() {
  const session = useAppStore((s) => s.session);
  const setSession = useAppStore((s) => s.setSession);
  const currentPage = useAppStore((s) => s.currentPage);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initAuth();

    const unsub = onAuthChange(async (user) => {
      if (user) {
        const token = await user.getIdToken();
        const decoded = JSON.parse(atob(token.split('.')[1]));
        setSession({
          userId: user.uid,
          email: user.email || '',
          name: (decoded.name as string) || user.displayName || '',
          role: (decoded.role as string) || 'reader',
        });
      } else {
        setSession(null);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [setSession]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return <LandingPage />;
  }

  const PageComponent = pageComponents[currentPage] || DashboardPage;

  return (
    <AppLayout>
      <ErrorBoundary>
        <PageComponent />
      </ErrorBoundary>
    </AppLayout>
  );
}
