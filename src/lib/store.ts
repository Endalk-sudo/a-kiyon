import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';

export type PageId = 
  | 'dashboard' 
  | 'members' 
  | 'services' 
  | 'subscriptions' 
  | 'payments' 
  | 'reports' 
  | 'settings'
  | 'storage';

interface Session {
  userId: string;
  email: string;
  name: string;
  role: string;
}

export type Theme = 'light' | 'dark';

interface AppState {
  currentPage: PageId;
  setCurrentPage: (_page: PageId) => void;

  session: Session | null;
  setSession: (_session: Session | null) => void;

  locale: 'en' | 'am';
  setLocale: (_locale: 'en' | 'am') => void;

  sidebarOpen: boolean;
  setSidebarOpen: (_open: boolean) => void;

  theme: Theme;
  setTheme: (_theme: Theme) => void;

  resetAppState: () => void;
}

type PersistedState = {
  locale: 'en' | 'am';
  theme: Theme;
};

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        currentPage: 'dashboard',
        setCurrentPage: (page) => set({ currentPage: page }),

        session: null,
        setSession: (session) => set({ session }),

        locale: 'en',
        setLocale: (locale) => set({ locale }),

        sidebarOpen: false,
        setSidebarOpen: (open) => set({ sidebarOpen: open }),

        theme: 'light',
        setTheme: (theme) => {
          applyTheme(theme);
          set({ theme });
        },

        resetAppState: () => {
          const prevTheme = useAppStore.getState().theme;
          const prevLocale = useAppStore.getState().locale;
          set({
            currentPage: 'dashboard',
            session: null,
            locale: prevLocale,
            sidebarOpen: false,
            theme: prevTheme,
          });
        },
      }),
      {
        name: 'fcms-store',
        storage: createJSONStorage(() => {
          if (typeof window !== 'undefined') return window.localStorage;
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }),
        partialize: (state): PersistedState => ({
          locale: state.locale,
          theme: state.theme,
        }),
        onRehydrateStorage: () => (state) => {
          if (state) applyTheme(state.theme);
        },
      }
    ),
    { name: 'AppStore' }
  )
);
