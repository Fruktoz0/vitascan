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

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3005';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  onboardingCompleted: false,

  login: async (email, password) => {
    const { accessToken, refreshToken, user } = await authApi.login(email, password);

    setAccessToken(accessToken);
    await SecureStore.setItemAsync('refreshToken', refreshToken);

    let onboardingCompleted = false;
    try {
      const status = await onboardingApi.getStatus();
      onboardingCompleted = status.completed;
    } catch {}

    set({ user, isAuthenticated: true, onboardingCompleted });
  },

  register: async (username, email, password) => {
    await authApi.register({ username, email, password, acceptedTerms: true });
    await get().login(email, password);
  },

  logout: async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync('refreshToken');
      if (refreshToken) await authApi.logout(refreshToken);
    } catch {}

    setAccessToken(null);
    await SecureStore.deleteItemAsync('refreshToken');
    set({ user: null, isAuthenticated: false, onboardingCompleted: false });
  },

  restoreSession: async () => {
    set({ isLoading: true });
    try {
      const refreshToken = await SecureStore.getItemAsync('refreshToken');
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
        await SecureStore.deleteItemAsync('refreshToken');
        set({ isLoading: false });
        return;
      }

      const { accessToken, refreshToken: newRefresh } = await res.json();
      setAccessToken(accessToken);
      await SecureStore.setItemAsync('refreshToken', newRefresh);

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
        // Ha a profile lekérés sikertelen, kijelentkeztetjük
        await SecureStore.deleteItemAsync('refreshToken');
        setAccessToken(null);
        set({ isLoading: false });
        return;
      }

      // Onboarding státusz
      let onboardingCompleted = false;
      try {
        const status = await onboardingApi.getStatus();
        onboardingCompleted = status.completed;
      } catch {}

      set({ user, isAuthenticated: true, onboardingCompleted, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  setOnboardingCompleted: (value) => set({ onboardingCompleted: value }),
}));
