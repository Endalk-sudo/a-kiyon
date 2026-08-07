'use client';

import { Component, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAppStore } from '@/lib/store';
import { initAuth, onAuthChange, decodeTokenPayload, authClient } from '@/lib/auth-client';
import { onSessionExpired } from '@/lib/api-client';
import { AppLayout } from '@/components/app-layout';
import { LandingPage } from '@/components/pages/landing';
import { Loader2 } from 'lucide-react';

// Pages are code-split so the initial bundle only contains the landing page,
// auth plumbing, and the layout — not every feature page (members.tsx alone
// is ~1600 lines) plus recharts on the dashboard. Each chunk is fetched on
// first navigation to that page.
const DashboardPage = dynamic(() => import('@/components/pages/dashboard').then((m) => m.DashboardPage), {
  ssr: false,
  loading: () => <PageLoading />,
});
const MembersPage = dynamic(() => import('@/components/pages/members').then((m) => m.MembersPage), {
  ssr: false,
  loading: () => <PageLoading />,
});
const ServicesPage = dynamic(() => import('@/components/pages/services').then((m) => m.ServicesPage), {
  ssr: false,
  loading: () => <PageLoading />,
});
const SubscriptionsPage = dynamic(() => import('@/components/pages/subscriptions').then((m) => m.SubscriptionsPage), {
  ssr: false,
  loading: () => <PageLoading />,
});
const PaymentsPage = dynamic(() => import('@/components/pages/payments').then((m) => m.PaymentsPage), {
  ssr: false,
  loading: () => <PageLoading />,
});
const ReportsPage = dynamic(() => import('@/components/pages/reports').then((m) => m.ReportsPage), {
  ssr: false,
  loading: () => <PageLoading />,
});
const SettingsPage = dynamic(() => import('@/components/pages/settings').then((m) => m.SettingsPage), {
  ssr: false,
  loading: () => <PageLoading />,
});
const StoragePage = dynamic(() => import('@/components/pages/storage').then((m) => m.StoragePage), {
  ssr: false,
  loading: () => <PageLoading />,
});

function PageLoading() {
  return (
    <div className="flex items-center justify-center h-full py-24">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

const pageComponents: Record<string, React.ComponentType> = {
  dashboard: DashboardPage,
  members: MembersPage,
  services: ServicesPage,
  subscriptions: SubscriptionsPage,
  payments: PaymentsPage,
  reports: ReportsPage,
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

    const unsubAuth = onAuthChange(async (user) => {
      try {
        if (user) {
          const token = await user.getIdToken();
          // Base64url-safe decode (plain atob throws on `-`/`_` chars).
          const decoded = decodeTokenPayload(token);
          setSession({
            userId: user.uid,
            email: user.email || '',
            name: (decoded.name as string) || user.displayName || '',
            role: (decoded.role as string) || 'reader',
          });
        } else {
          setSession(null);
        }
      } catch (err) {
        console.error('Failed to resolve auth session:', err);
        setSession(null);
      } finally {
        setLoading(false);
      }
    });

    // Token expired or revoked server-side: tear the session down instead of
    // leaving the user with a dead session and per-page Unauthorized toasts.
    const unsubExpired = onSessionExpired(async () => {
      await authClient.signOut().catch(() => {});
      setSession(null);
      setLoading(false);
    });

    return () => {
      unsubAuth();
      unsubExpired();
    };
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
