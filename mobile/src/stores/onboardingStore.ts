import { create } from 'zustand';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type Goal = 'LOSE' | 'MAINTAIN' | 'GAIN';
export type ActivityLevel = 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE';

interface OnboardingState {
  // Step 2 - Személyesítés
  gender: Gender | null;
  birthYear: number | null;
  heightCm: number | null;
  weightKg: number | null;

  // Step 3 - Cél
  goal: Goal | null;

  // Step 4 - Aktivitás
  activityLevel: ActivityLevel | null;

  // Step 5 - Kalória cél (kiszámított vagy felülírt)
  calculatedKcalGoal: number | null;
  dailyKcalGoal: number | null;
  dailyWaterGoalMl: number | null;

  // Navigation
  currentStep: number;

  // Actions
  setGender: (gender: Gender) => void;
  setBirthYear: (year: number) => void;
  setHeightCm: (height: number) => void;
  setWeightKg: (weight: number) => void;
  setGoal: (goal: Goal) => void;
  setActivityLevel: (level: ActivityLevel) => void;
  setKcalGoal: (kcal: number) => void;
  setCalculatedGoals: (kcal: number, water: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  gender: null,
  birthYear: null,
  heightCm: null,
  weightKg: null,
  goal: null,
  activityLevel: null,
  calculatedKcalGoal: null,
  dailyKcalGoal: null,
  dailyWaterGoalMl: null,
  currentStep: 1,

  setGender: (gender) => set({ gender }),
  setBirthYear: (birthYear) => set({ birthYear }),
  setHeightCm: (heightCm) => set({ heightCm }),
  setWeightKg: (weightKg) => set({ weightKg }),
  setGoal: (goal) => set({ goal }),
  setActivityLevel: (activityLevel) => set({ activityLevel }),
  setKcalGoal: (dailyKcalGoal) => set({ dailyKcalGoal }),
  setCalculatedGoals: (kcal, water) =>
    set({ calculatedKcalGoal: kcal, dailyKcalGoal: kcal, dailyWaterGoalMl: water }),
  nextStep: () => set((s) => ({ currentStep: Math.min(s.currentStep + 1, 7) })),
  prevStep: () => set((s) => ({ currentStep: Math.max(s.currentStep - 1, 1) })),
  reset: () =>
    set({
      gender: null,
      birthYear: null,
      heightCm: null,
      weightKg: null,
      goal: null,
      activityLevel: null,
      calculatedKcalGoal: null,
      dailyKcalGoal: null,
      dailyWaterGoalMl: null,
      currentStep: 1,
    }),
}));
