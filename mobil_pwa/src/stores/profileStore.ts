import { create } from 'zustand';
import { resolveAvatarKey } from '../design/avatars';
import { profileApi } from '../services/api';

type HomeCardKey = 'showHomeWaterCard' | 'showHomeStreakCard' | 'showHomeFastingCard' | 'showHomeMealPlanCard';

interface ProfileState {
  avatarKey: string | null;
  loaded: boolean;
  showHomeWaterCard: boolean;
  showHomeStreakCard: boolean;
  showHomeFastingCard: boolean;
  showHomeMealPlanCard: boolean;
  kcalGoalFollowsWeight: boolean;
  load: () => Promise<void>;
  setAvatarKey: (key: string) => Promise<void>;
  setHomeCard: (key: HomeCardKey, value: boolean) => Promise<void>;
  setKcalGoalFollowsWeight: (value: boolean) => Promise<void>;
}

function flagsFromProfile(profile: any) {
  return {
    showHomeWaterCard: profile?.showHomeWaterCard !== false,
    showHomeStreakCard: profile?.showHomeStreakCard !== false,
    showHomeFastingCard: profile?.showHomeFastingCard === true,
    showHomeMealPlanCard: profile?.showHomeMealPlanCard === true,
    kcalGoalFollowsWeight: profile?.kcalGoalFollowsWeight !== false,
  };
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  avatarKey: null,
  loaded: false,
  showHomeWaterCard: true,
  showHomeStreakCard: true,
  showHomeFastingCard: false,
  showHomeMealPlanCard: false,
  kcalGoalFollowsWeight: true,

  load: async () => {
    try {
      const me = await profileApi.getMe();
      set({
        avatarKey: resolveAvatarKey(me.profile?.avatarKey),
        loaded: true,
        ...flagsFromProfile(me.profile),
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

  setHomeCard: async (key, value) => {
    const prev = get()[key];
    set({ [key]: value } as Pick<ProfileState, HomeCardKey>);
    try {
      await profileApi.update({ [key]: value });
    } catch {
      set({ [key]: prev } as Pick<ProfileState, HomeCardKey>);
      throw new Error('Mentés sikertelen.');
    }
  },

  setKcalGoalFollowsWeight: async (value) => {
    const prev = get().kcalGoalFollowsWeight;
    set({ kcalGoalFollowsWeight: value });
    try {
      await profileApi.update({ kcalGoalFollowsWeight: value });
    } catch {
      set({ kcalGoalFollowsWeight: prev });
      throw new Error('Mentés sikertelen.');
    }
  },
}));
