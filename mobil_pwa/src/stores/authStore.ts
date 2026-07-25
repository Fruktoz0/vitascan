import { create } from 'zustand';
import * as Storage from '../services/storage';
import {
  authApi,
  profileApi,
  refreshAccessTokenFromStorage,
  setAccessToken,
} from '../services/api';

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

const REFRESH_TOKEN_KEY = 'refreshToken';
const CACHED_USER_KEY = 'cachedUser';

async function clearStoredAuth() {
  setAccessToken(null);
  await Promise.all([
    Storage.deleteItem(REFRESH_TOKEN_KEY).catch(() => {}),
    Storage.deleteItem(CACHED_USER_KEY).catch(() => {}),
  ]);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (email, password) => {
    const { accessToken, refreshToken, user } = await authApi.login(email, password);
    setAccessToken(accessToken);
    await Storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    await Storage.setItem(CACHED_USER_KEY, JSON.stringify(user));
    set({ user, isAuthenticated: true });
  },

  register: async (username, email, password) => {
    await authApi.register({ username, email, password, acceptedTerms: true });
    await get().login(email, password);
  },

  logout: async () => {
    try {
      const refreshToken = await Storage.getItem(REFRESH_TOKEN_KEY);
      if (refreshToken) await authApi.logout(refreshToken);
    } catch {}
    await clearStoredAuth();
    set({ user: null, isAuthenticated: false });
  },

  restoreSession: async () => {
    set({ isLoading: true });
    try {
      const refreshToken = await Storage.getItem(REFRESH_TOKEN_KEY);
      if (!refreshToken) {
        set({ isLoading: false });
        return;
      }

      const refreshed = await refreshAccessTokenFromStorage();
      if (!refreshed) {
        await clearStoredAuth();
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      let user: User | null = null;
      try {
        const profile = await profileApi.getMe();
        user = {
          id: profile.id,
          username: profile.username,
          email: profile.email,
          role: profile.role,
        };
      } catch {
        const cached = await Storage.getItem(CACHED_USER_KEY);
        if (cached) {
          set({
            user: JSON.parse(cached) as User,
            isAuthenticated: true,
            isLoading: false,
          });
          return;
        }
        set({ isLoading: false });
        return;
      }

      await Storage.setItem(CACHED_USER_KEY, JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      await clearStoredAuth();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
