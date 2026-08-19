import { create } from 'zustand';
import { sharesApi } from '../services/api';

type ShareInboxState = {
  pendingIncomingCount: number;
  refresh: () => Promise<void>;
};

export const useShareInbox = create<ShareInboxState>((set) => ({
  pendingIncomingCount: 0,
  refresh: async () => {
    try {
      const data = await sharesApi.list();
      set({ pendingIncomingCount: data.pendingIncomingCount });
    } catch {
      /* offline / unauthenticated */
    }
  },
}));
