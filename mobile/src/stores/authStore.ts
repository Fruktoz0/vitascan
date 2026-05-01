import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { authApi, onboardingApi, profileApi, setAccessToken } from '../services/api';

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

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://newhomeproject.ddns.net:3005';
const REFRESH_TOKEN_KEY = 'refreshToken';
const CACHED_USER_KEY = 'cachedUser';
const ONBOARDING_COMPLETED_KEY = 'onboardingCompleted';

async function restoreCachedAuthState() {
  const [cachedUser, cachedOnboarding] = await Promise.all([
    SecureStore.getItemAsync(CACHED_USER_KEY),
    SecureStore.getItemAsync(ONBOARDING_COMPLETED_KEY),
  ]);

  if (!cachedUser) return null;

  return {
    user: JSON.parse(cachedUser) as User,
    onboardingCompleted: cachedOnboarding === 'true',
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  onboardingCompleted: false,

  login: async (email, password) => {
    const { accessToken, refreshToken, user } = await authApi.login(email, password);

    setAccessToken(accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);

    let onboardingCompleted = false;
    try {
      const status = await onboardingApi.getStatus();
      onboardingCompleted = status.completed;
    } catch {}

    await Promise.all([
      SecureStore.setItemAsync(CACHED_USER_KEY, JSON.stringify(user)),
      SecureStore.setItemAsync(ONBOARDING_COMPLETED_KEY, String(onboardingCompleted)),
    ]);

    set({ user, isAuthenticated: true, onboardingCompleted });
  },

  register: async (username, email, password) => {
    await authApi.register({ username, email, password, acceptedTerms: true });
    await get().login(email, password);
  },

  logout: async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      if (refreshToken) await authApi.logout(refreshToken);
    } catch {}

    setAccessToken(null);
    await Promise.all([
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.deleteItemAsync(CACHED_USER_KEY),
      SecureStore.deleteItemAsync(ONBOARDING_COMPLETED_KEY),
    ]);
    set({ user: null, isAuthenticated: false, onboardingCompleted: false });
  },

  restoreSession: async () => {
    set({ isLoading: true });
    try {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      if (!refreshToken) {
        set({ isLoading: false });
        return;
      }

      // Token frissítése
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
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

      const { accessToken, refreshToken: newRefresh } = await res.json();
      setAccessToken(accessToken);
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, newRefresh);

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
        SecureStore.setItemAsync(CACHED_USER_KEY, JSON.stringify(user)),
        SecureStore.setItemAsync(ONBOARDING_COMPLETED_KEY, String(onboardingCompleted)),
      ]);

      set({ user, isAuthenticated: true, onboardingCompleted, isLoading: false });
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
    }
  },

  setOnboardingCompleted: (value) => {
    SecureStore.setItemAsync(ONBOARDING_COMPLETED_KEY, String(value)).catch(() => {});
    set({ onboardingCompleted: value });
  },
}));
