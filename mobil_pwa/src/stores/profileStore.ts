import { create } from 'zustand';
import { resolveAvatarKey } from '../design/avatars';
import { profileApi } from '../services/api';

interface ProfileState {
  avatarKey: string | null;
  loaded: boolean;
  load: () => Promise<void>;
  setAvatarKey: (key: string) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  avatarKey: null,
  loaded: false,

  load: async () => {
    try {
      const me = await profileApi.getMe();
      set({
        avatarKey: resolveAvatarKey(me.profile?.avatarKey),
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  setAvatarKey: async (key: string) => {
    const prev = get().avatarKey;
    set({ avatarKey: key });
    try {
      await profileApi.update({ avatarKey: key });
    } catch {
      set({ avatarKey: prev });
      throw new Error('Avatar mentése sikertelen.');
    }
  },
}));
