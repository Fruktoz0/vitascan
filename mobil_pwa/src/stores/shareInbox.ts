import { create } from 'zustand';
import { sharesApi } from '../services/api';

type ShareInboxState = {
  pendingIncomingCount: number;
  outgoingCartPartners: string[];
  refresh: () => Promise<void>;
};

export const useShareInbox = create<ShareInboxState>((set) => ({
  pendingIncomingCount: 0,
  outgoingCartPartners: [],
  refresh: async () => {
    try {
      const data = await sharesApi.list();
      const outgoingCartPartners = [
        ...new Set(
          data.shares
            .filter(
              (share) =>
                share.direction === 'outgoing' &&
                share.status !== 'REVOKED' &&
                share.categories.includes('CART'),
            )
            .map((share) => share.partner.username)
            .filter(Boolean),
        ),
      ];
      set({ pendingIncomingCount: data.pendingIncomingCount, outgoingCartPartners });
    } catch {
      /* offline / unauthenticated */
    }
  },
}));
