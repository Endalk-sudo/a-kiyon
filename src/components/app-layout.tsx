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
  ClipboardList,
  Settings,
  LogOut,
  Menu,
  Sun,
  Moon,
  Globe,
} from 'lucide-react';
import { toast } from 'sonner';
import { useCallback, useState } from 'react';

const navItems: { id: PageId; label: string; labelAm: string; icon: React.ElementType; roles?: string[] }[] = [
  { id: 'dashboard', label: 'Home', labelAm: 'ቤት', icon: House },
  { id: 'members', label: 'Members', labelAm: 'አባላት', icon: Users },
  { id: 'services', label: 'Services', labelAm: 'አገልግሎቶች', icon: Dumbbell, roles: ['owner'] },
  { id: 'subscriptions', label: 'Subscriptions', labelAm: 'ደንበኝነት', icon: Calendar },
  { id: 'payments', label: 'Payments', labelAm: 'ክፍያዎች', icon: CreditCard },
  { id: 'reports', label: 'Reports', labelAm: 'ሪፖርቶች', icon: BarChart3, roles: ['owner'] },
  { id: 'audit-logs', label: 'Audit Log', labelAm: 'የስራ ማስመዝ', icon: ClipboardList, roles: ['owner'] },
  { id: 'settings', label: 'Settings', labelAm: 'ቅንብሮች', icon: Settings, roles: ['owner'] },
];

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { session, currentPage, setCurrentPage, locale, setLocale, setSession, sidebarOpen, setSidebarOpen } = useAppStore();
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('fcms-theme');
      if (saved === 'dark') {
        document.documentElement.classList.add('dark');
        return true;
      }
    }
    return false;
  });

  const toggleTheme = useCallback(() => {
    setDarkMode((prev) => {
      const newDark = !prev;
      document.documentElement.classList.toggle('dark', newDark);
      localStorage.setItem('fcms-theme', newDark ? 'dark' : 'light');
      return newDark;
    });
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'en' ? 'am' : 'en');
  }, [locale, setLocale]);

  const handleLogout = useCallback(async () => {
    try {
      await authClient.signOut();
    } catch {
      // ignore
    }
    setSession(null);
    toast.success('Logged out');
  }, [setSession]);

  const filteredNavItems = navItems.filter(
    (item) => !item.roles || (session && item.roles.includes(session.role))
  );

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
            <nav className="px-2 space-y-1">
              {filteredNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentPage(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    }`}
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
              <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-9 w-9">
                {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={toggleLocale} className="h-9 w-9">
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

      {/* Mobile Sidebar */}
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
              <nav className="px-2 space-y-1">
                {filteredNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setCurrentPage(item.id);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      }`}
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
                <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-9 w-9">
                  {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={toggleLocale} className="h-9 w-9">
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 border-b bg-card flex items-center px-4 gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold truncate">
            {locale === 'en'
              ? navItems.find((i) => i.id === currentPage)?.label
              : navItems.find((i) => i.id === currentPage)?.labelAm}
          </h1>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
