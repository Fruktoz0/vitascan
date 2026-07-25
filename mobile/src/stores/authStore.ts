import { create } from 'zustand';
import * as Storage from '../services/storage';
import {
  authApi,
  onboardingApi,
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
  onboardingCompleted: boolean;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  setOnboardingCompleted: (value: boolean) => void;
}

const REFRESH_TOKEN_KEY = 'refreshToken';
const CACHED_USER_KEY = 'cachedUser';
const ONBOARDING_COMPLETED_KEY = 'onboardingCompleted';

async function restoreCachedAuthState() {
  const [cachedUser, cachedOnboarding] = await Promise.all([
    Storage.getItem(CACHED_USER_KEY),
    Storage.getItem(ONBOARDING_COMPLETED_KEY),
  ]);

  if (!cachedUser) return null;

  return {
    user: JSON.parse(cachedUser) as User,
    onboardingCompleted: cachedOnboarding === 'true',
  };
}

async function clearStoredAuth() {
  setAccessToken(null);
  await Promise.all([
    Storage.deleteItem(REFRESH_TOKEN_KEY).catch(() => {}),
    Storage.deleteItem(CACHED_USER_KEY).catch(() => {}),
    Storage.deleteItem(ONBOARDING_COMPLETED_KEY).catch(() => {}),
  ]);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  onboardingCompleted: false,

  login: async (email, password) => {
    const { accessToken, refreshToken, user } = await authApi.login(email, password);

    setAccessToken(accessToken);
    await Storage.setItem(REFRESH_TOKEN_KEY, refreshToken);

    let onboardingCompleted = false;
    try {
      const status = await onboardingApi.getStatus();
      onboardingCompleted = status.completed;
    } catch {}

    await Promise.all([
      Storage.setItem(CACHED_USER_KEY, JSON.stringify(user)),
      Storage.setItem(ONBOARDING_COMPLETED_KEY, String(onboardingCompleted)),
    ]);

    set({ user, isAuthenticated: true, onboardingCompleted });
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

    setAccessToken(null);
    await Promise.all([
      Storage.deleteItem(REFRESH_TOKEN_KEY),
      Storage.deleteItem(CACHED_USER_KEY),
      Storage.deleteItem(ONBOARDING_COMPLETED_KEY),
    ]);
    set({ user: null, isAuthenticated: false, onboardingCompleted: false });
  },

  restoreSession: async () => {
    set({ isLoading: true });
    try {
      const refreshToken = await Storage.getItem(REFRESH_TOKEN_KEY);
      if (!refreshToken) {
        set({ isLoading: false });
        return;
      }

      // Ugyanaz a single-flight refresh mint az api.request 401-nél — két párhuzamos refresh ugyanazzal a tokennel a szerveren 401-et okoz (rotáció).
      const refreshed = await refreshAccessTokenFromStorage();
      if (!refreshed) {
        await clearStoredAuth();
        set({
          user: null,
          isAuthenticated: false,
          onboardingCompleted: false,
          isLoading: false,
        });
        return;
      }

      // /auth/refresh nem ad vissza user objektumot, ezért külön lekérjük
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
        const cached = await restoreCachedAuthState();
        if (cached) {
          set({
            user: cached.user,
            isAuthenticated: true,
            onboardingCompleted: cached.onboardingCompleted,
            isLoading: false,
          });
          return;
        }
        set({ isLoading: false });
        return;
      }

      // Onboarding státusz
      let onboardingCompleted = false;
      try {
        const status = await onboardingApi.getStatus();
        onboardingCompleted = status.completed;
      } catch {}

      await Promise.all([
        Storage.setItem(CACHED_USER_KEY, JSON.stringify(user)),
        Storage.setItem(ONBOARDING_COMPLETED_KEY, String(onboardingCompleted)),
      ]);

      set({ user, isAuthenticated: true, onboardingCompleted, isLoading: false });
    } catch {
      await clearStoredAuth();
      set({
        user: null,
        isAuthenticated: false,
        onboardingCompleted: false,
        isLoading: false,
      });
    }
  },

  setOnboardingCompleted: (value) => {
    Storage.setItem(ONBOARDING_COMPLETED_KEY, String(value)).catch(() => {});
    set({ onboardingCompleted: value });
  },
}));
