type Gender = 'MALE' | 'FEMALE' | 'OTHER';
type ActivityLevel = 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE';
type Goal = 'LOSE' | 'MAINTAIN' | 'GAIN';

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  ACTIVE: 1.725,
  VERY_ACTIVE: 1.9,
};

interface TDEEInput {
  weightKg: number;
  heightCm: number;
  birthYear: number;
  gender: Gender;
  activityLevel: ActivityLevel;
  goal: Goal;
}

export function calculateTDEE(input: TDEEInput): number {
  const age = new Date().getFullYear() - input.birthYear;

  const BMR =
    input.gender === 'MALE'
      ? 10 * input.weightKg + 6.25 * input.heightCm - 5 * age + 5
      : 10 * input.weightKg + 6.25 * input.heightCm - 5 * age - 161;
  // For 'OTHER' gender we use the female formula as a safe middle ground

  const TDEE = BMR * ACTIVITY_MULTIPLIERS[input.activityLevel];

  const dailyGoal =
    input.goal === 'LOSE'
      ? TDEE - 500
      : input.goal === 'GAIN'
      ? TDEE + 300
      : TDEE;

  return Math.round(dailyGoal);
}

export function calculateWaterGoal(weightKg: number): number {
  // ~30ml / kg body weight, minimum 1500ml, maximum 4000ml
  return Math.min(4000, Math.max(1500, Math.round(weightKg * 30)));
}
