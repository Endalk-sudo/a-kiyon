'use client';

import { useAppStore, type PageId } from '@/lib/store';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  House,
  Users,
  Dumbbell,
  Calendar,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  MoreHorizontal,
  Sun,
  Moon,
  Globe,
  HardDrive,
} from 'lucide-react';
import { toast } from 'sonner';
import { useCallback, useEffect } from 'react';

const navItems: { id: PageId; label: string; labelAm: string; icon: React.ElementType; roles?: string[] }[] = [
  { id: 'dashboard', label: 'Home', labelAm: 'ቤት', icon: House },
  { id: 'members', label: 'Members', labelAm: 'አባላት', icon: Users },
  { id: 'services', label: 'Services', labelAm: 'አገልግሎቶች', icon: Dumbbell, roles: ['owner'] },
  { id: 'subscriptions', label: 'Subscriptions', labelAm: 'ደንበኝነት', icon: Calendar },
  { id: 'payments', label: 'Payments', labelAm: 'ክፍያዎች', icon: CreditCard },
  { id: 'reports', label: 'Reports', labelAm: 'ሪፖርቶች', icon: BarChart3, roles: ['owner'] },
  { id: 'storage', label: 'Storage', labelAm: 'ማከማቻ', icon: HardDrive, roles: ['owner'] },
  { id: 'settings', label: 'Settings', labelAm: 'ቅንብሮች', icon: Settings, roles: ['owner'] },
];

/** Pages that get their own bottom-tab slot on mobile. */
const primaryTabs: PageId[] = ['dashboard', 'members', 'subscriptions', 'payments'];

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const session = useAppStore((s) => s.session);
  const currentPage = useAppStore((s) => s.currentPage);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const resetAppState = useAppStore((s) => s.resetAppState);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'en' ? 'am' : 'en');
  }, [locale, setLocale]);

  const handleLogout = useCallback(async () => {
    try {
      await authClient.signOut();
    } catch {
      // ignore
    }
    resetAppState();
    toast.success('Logged out');
  }, [resetAppState]);

  useEffect(() => {
    document.documentElement.lang = locale === 'am' ? 'am' : 'en';
  }, [locale]);

  const filteredNavItems = navItems.filter(
    (item) => !item.roles || (session && item.roles.includes(session.role))
  );
  const primaryItems = filteredNavItems.filter((item) => primaryTabs.includes(item.id));
  const moreItems = filteredNavItems.filter((item) => !primaryTabs.includes(item.id));

  const navigate = useCallback(
    (id: PageId) => {
      setCurrentPage(id);
      setSidebarOpen(false);
    },
    [setCurrentPage, setSidebarOpen]
  );

  const navButtonClass = (isActive: boolean) =>
    `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
    }`;

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 border-r bg-card flex-col">
        <div className="flex flex-col h-full">
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
              <Dumbbell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-lg leading-none">A-kiyon</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {locale === 'en' ? 'Fitness Center' : 'የአካል ብቃት ማዕከል'}
              </p>
            </div>
          </div>
          <Separator />
          <ScrollArea className="flex-1 py-2">
            <nav className="px-2 space-y-1" aria-label="Main navigation">
              {filteredNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={navButtonClass(isActive)}
                  >
                    <Icon className="h-4 w-4" />
                    {locale === 'en' ? item.label : item.labelAm}
                  </button>
                );
              })}
            </nav>
          </ScrollArea>
          <Separator />
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-9 w-9" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={toggleLocale} className="h-9 w-9" aria-label="Switch language">
                <Globe className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="ml-auto text-destructive hover:text-destructive">
                <LogOut className="h-4 w-4 mr-1" />
                {locale === 'en' ? 'Logout' : 'ውጣ'}
              </Button>
            </div>
            {session && (
              <div className="text-xs text-muted-foreground px-2">
                {session.name} ({session.role})
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile "More" Drawer (secondary pages + preferences) */}
      <div className="md:hidden">
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-64 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation Menu</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col h-full">
              <div className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
                  <Dumbbell className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-lg leading-none">A-kiyon</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {locale === 'en' ? 'Fitness Center' : 'የአካል ብቃት ማዕከል'}
                  </p>
                </div>
              </div>
              <Separator />
              <ScrollArea className="flex-1 py-2">
                <nav className="px-2 space-y-1" aria-label="More navigation">
                  {moreItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => navigate(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={navButtonClass(isActive)}
                      >
                        <Icon className="h-4 w-4" />
                        {locale === 'en' ? item.label : item.labelAm}
                      </button>
                    );
                  })}
                </nav>
              </ScrollArea>
              <Separator />
              <div className="p-3 space-y-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-9 w-9" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
                    {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={toggleLocale} className="h-9 w-9" aria-label="Switch language">
                    <Globe className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleLogout} className="ml-auto text-destructive hover:text-destructive">
                    <LogOut className="h-4 w-4 mr-1" />
                    {locale === 'en' ? 'Logout' : 'ውጣ'}
                  </Button>
                </div>
                {session && (
                  <div className="text-xs text-muted-foreground px-2">
                    {session.name} ({session.role})
                  </div>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="min-h-14 border-b bg-card flex items-center px-4 gap-3 pt-[env(safe-area-inset-top)]">
          <h1 className="text-lg font-semibold truncate">
            {locale === 'en'
              ? filteredNavItems.find((i) => i.id === currentPage)?.label
              : filteredNavItems.find((i) => i.id === currentPage)?.labelAm}
          </h1>
          <div className="ml-auto flex items-center gap-1 md:hidden">
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-9 w-9" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleLocale} className="h-9 w-9" aria-label="Switch language">
              <Globe className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="h-9 w-9 text-destructive hover:text-destructive" aria-label="Logout">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-4 pb-24 md:pb-6 md:p-6">
          {children}
        </main>

        {/* Mobile Bottom Tab Bar */}
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)]"
          aria-label="Primary navigation"
        >
          <div className="flex">
            {primaryItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-accent-foreground'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {locale === 'en' ? item.label : item.labelAm}
                </button>
              );
            })}
            {moreItems.length > 0 && (
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label={locale === 'en' ? 'More options' : 'ተጨማሪ አማራጮች'}
                aria-current={moreItems.some((i) => i.id === currentPage) ? 'page' : undefined}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                  moreItems.some((i) => i.id === currentPage)
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-accent-foreground'
                }`}
              >
                <MoreHorizontal className="h-5 w-5" />
                {locale === 'en' ? 'More' : 'ተጨማሪ'}
              </button>
            )}
          </div>
        </nav>
      </div>
    </div>
  );
}
