import { create } from 'zustand';

export type PageId = 
  | 'dashboard' 
  | 'members' 
  | 'services' 
  | 'subscriptions' 
  | 'invoices' 
  | 'payments' 
  | 'reports' 
  | 'audit-logs' 
  | 'settings';

interface Session {
  userId: string;
  email: string;
  name: string;
  role: 'owner' | 'manager';
}

interface AppState {
  // Navigation
  currentPage: PageId;
  setCurrentPage: (page: PageId) => void;
  
  // Auth
  session: Session | null;
  setSession: (session: Session | null) => void;
  isAuthenticated: boolean;
  
  // Language
  locale: 'en' | 'am';
  setLocale: (locale: 'en' | 'am') => void;
  
  // Sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'dashboard',
  setCurrentPage: (page) => set({ currentPage: page }),
  
  session: null,
  setSession: (session) => set({ session, isAuthenticated: !!session }),
  isAuthenticated: false,
  
  locale: 'en',
  setLocale: (locale) => set({ locale }),
  
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
