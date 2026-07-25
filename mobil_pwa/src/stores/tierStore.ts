import { create } from 'zustand';
import { getAccessToken } from '../services/api';

export interface TierLimitDetail {
  limit: number | null;
  used: number;
}

export interface TierStatus {
  tier: 'FREE' | 'PREMIUM';
  limits: {
    dailyLogs: TierLimitDetail;
    dailyScans: TierLimitDetail;
    exportEnabled: boolean;
    monthlyStatsEnabled: boolean;
    premiumFoodsVisible: boolean;
    profileCustomization: boolean;
  };
}

interface TierState {
  status: TierStatus | null;
  isLoading: boolean;
  fetch: () => Promise<void>;
  isPremium: () => boolean;
  logsRemaining: () => number;
  scansRemaining: () => number;
}

const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) || '/api').replace(/\/$/, '');

export const useTierStore = create<TierState>((set, get) => ({
  status: null,
  isLoading: false,

  fetch: async () => {
    set({ isLoading: true });
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/premium/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data: TierStatus = await res.json();
      set({ status: data });
    } catch {
    } finally {
      set({ isLoading: false });
    }
  },

  isPremium: () => get().status?.tier === 'PREMIUM',

  logsRemaining: () => {
    const s = get().status;
    if (!s) return 10;
    const { limit, used } = s.limits.dailyLogs;
    if (limit === null) return Infinity;
    return Math.max(limit - used, 0);
  },

  scansRemaining: () => {
    const s = get().status;
    if (!s) return 5;
    const { limit, used } = s.limits.dailyScans;
    if (limit === null) return Infinity;
    return Math.max(limit - used, 0);
  },
}));
