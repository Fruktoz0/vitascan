import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { authApi, onboardingApi, setAccessToken } from '../services/api';

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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  onboardingCompleted: false,

  login: async (email, password) => {
    const { accessToken, refreshToken, user } = await authApi.login(email, password);

    setAccessToken(accessToken);
    await SecureStore.setItemAsync('refreshToken', refreshToken);

    // Onboarding státusz lekérése
    let onboardingCompleted = false;
    try {
      const status = await onboardingApi.getStatus();
      onboardingCompleted = status.completed;
    } catch {}

    set({ user, isAuthenticated: true, onboardingCompleted });
  },

  register: async (username, email, password) => {
    await authApi.register({ username, email, password, acceptedTerms: true });
    // Regisztráció után automatikus login
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
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3005'}/auth/refresh`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        }
      );

      if (!res.ok) {
        await SecureStore.deleteItemAsync('refreshToken');
        set({ isLoading: false });
        return;
      }

      const { accessToken, refreshToken: newRefresh, user } = await res.json();
      // FONTOS: a refresh endpointnak vissza kell adni a user-t is
      // Ha nem adja vissza, profile/me-t kell hívni
      setAccessToken(accessToken);
      await SecureStore.setItemAsync('refreshToken', newRefresh);

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
