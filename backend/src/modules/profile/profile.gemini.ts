/**
 * Gemini: napi kalória + makró célok számítása személyes adatokból.
 */
import { geminiModelChain } from '../../utils/geminiModels';

export type MacroGoalsResult = {
  dailyKcalGoal: number;
  dailyProteinGoal: number;
  dailyCarbsGoal: number;
  dailyFatGoal: number;
  dailyWaterGoalMl: number;
};

export type MacroGoalsInput = {
  locale: 'hu' | 'en';
  weightKg: number;
  heightCm: number;
  birthYear: number;
  gender: string;
  activityLevel: string;
  goal: 'LOSE' | 'MAINTAIN' | 'GAIN';
  /** Cél testsúly — ha megvan, a deficit/surplus ehhez igazodik */
  targetWeightKg?: number | null;
  /** Hány hét alatt szeretné elérni; null/undefined = átlagos tempó */
  goalWeeks?: number | null;
  /** Ütem horgonya: (cél − start) / hetek. TDEE/fehérje/víz továbbra is weightKg. */
  startWeightKg?: number | null;
};

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    dailyKcalGoal: { type: 'NUMBER' },
    dailyProteinGoal: { type: 'NUMBER' },
    dailyCarbsGoal: { type: 'NUMBER' },
    dailyFatGoal: { type: 'NUMBER' },
    dailyWaterGoalMl: { type: 'NUMBER' },
  },
  required: [
    'dailyKcalGoal',
    'dailyProteinGoal',
    'dailyCarbsGoal',
    'dailyFatGoal',
    'dailyWaterGoalMl',
  ],
};

function buildGenerationConfig(model: string): Record<string, unknown> {
  const isGemini3 = /gemini-3/i.test(model);
  const base: Record<string, unknown> = {
    temperature: 0.2,
    maxOutputTokens: 1024,
    responseMimeType: 'application/json',
    responseSchema: RESPONSE_SCHEMA,
  };
  if (isGemini3) {
    return { ...base, thinkingConfig: { thinkingLevel: 'low' } };
  }
  if (/gemini-2\.5-flash/i.test(model) && !/pro/i.test(model)) {
    return { ...base, thinkingConfig: { thinkingBudget: 0 } };
  }
  return base;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function maintenanceKcal(input: MacroGoalsInput): number {
  const age = new Date().getFullYear() - input.birthYear;
  const bmr =
    input.gender === 'MALE'
      ? 10 * input.weightKg + 6.25 * input.heightCm - 5 * age + 5
      : 10 * input.weightKg + 6.25 * input.heightCm - 5 * age - 161;

  const mult: Record<string, number> = {
    SEDENTARY: 1.2,
    LIGHT: 1.375,
    MODERATE: 1.55,
    ACTIVE: 1.725,
    VERY_ACTIVE: 1.9,
  };
  return bmr * (mult[input.activityLevel] ?? 1.55);
}

export function isWeightTargetReached(opts: {
  trendKg: number;
  targetKg?: number | null;
  goal: 'LOSE' | 'MAINTAIN' | 'GAIN';
}): boolean {
  const target = opts.targetKg;
  if (target == null || !Number.isFinite(target)) return false;
  if (Math.abs(opts.trendKg - target) <= 0.5) return true;
  if (opts.goal === 'LOSE' && opts.trendKg <= target) return true;
  if (opts.goal === 'GAIN' && opts.trendKg >= target) return true;
  return false;
}

/** ~7700 kcal ≈ 1 kg testtömeg */
function dailyKcalFromTarget(input: MacroGoalsInput, tdee: number): number {
  const target = input.targetWeightKg;
  const weeks = input.goalWeeks;
  const paceWeight =
    input.startWeightKg != null && Number.isFinite(input.startWeightKg)
      ? input.startWeightKg
      : input.weightKg;

  if (target != null && Number.isFinite(target) && weeks != null && weeks > 0) {
    const deltaKg = target - paceWeight;
    const kgPerWeek = deltaKg / weeks;
    // Max ~1 kg/hét veszteség, ~0.5 kg/hét növekedés biztonságosan
    const safeKgPerWeek = clamp(kgPerWeek, -1.0, 0.5);
    const dailyAdjust = (safeKgPerWeek * 7700) / 7;
    return clamp(Math.round(tdee + dailyAdjust), 1200, 5000);
  }

  // Nincs időtáv: átlagos deficit / surplus a cél típusa szerint
  let kcal = tdee;
  if (input.goal === 'LOSE') kcal -= 500;
  else if (input.goal === 'GAIN') kcal += 300;
  return clamp(Math.round(kcal), 1200, 5000);
}

/** Helyi fallback ha nincs Gemini / hiba */
export function localMacroGoals(input: MacroGoalsInput): MacroGoalsResult {
  const tdee = maintenanceKcal(input);
  const kcal = dailyKcalFromTarget(input, tdee);

  const proteinPerKg = input.goal === 'GAIN' ? 2.0 : input.goal === 'LOSE' ? 2.2 : 1.6;
  const protein = round1(clamp(input.weightKg * proteinPerKg, 40, 250));
  const fat = round1(clamp((kcal * 0.28) / 9, 30, 150));
  const carbs = round1(clamp((kcal - protein * 4 - fat * 9) / 4, 50, 500));
  const water = clamp(Math.round(input.weightKg * 30), 1500, 4000);

  return {
    dailyKcalGoal: kcal,
    dailyProteinGoal: protein,
    dailyCarbsGoal: carbs,
    dailyFatGoal: fat,
    dailyWaterGoalMl: water,
  };
}

function parseResult(raw: unknown): MacroGoalsResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const kcal = Number(o.dailyKcalGoal);
  const protein = Number(o.dailyProteinGoal);
  const carbs = Number(o.dailyCarbsGoal);
  const fat = Number(o.dailyFatGoal);
  const water = Number(o.dailyWaterGoalMl);
  if (![kcal, protein, carbs, fat, water].every((n) => Number.isFinite(n) && n > 0)) return null;
  return {
    dailyKcalGoal: clamp(Math.round(kcal), 1200, 5000),
    dailyProteinGoal: round1(clamp(protein, 40, 250)),
    dailyCarbsGoal: round1(clamp(carbs, 50, 500)),
    dailyFatGoal: round1(clamp(fat, 30, 150)),
    dailyWaterGoalMl: clamp(Math.round(water), 1500, 4000),
  };
}

async function callGemini(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<MacroGoalsResult | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: buildGenerationConfig(model),
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  try {
    return parseResult(JSON.parse(text));
  } catch {
    return null;
  }
}

export async function calculateMacroGoalsWithGemini(
  input: MacroGoalsInput,
): Promise<MacroGoalsResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const fallback = localMacroGoals(input);
  if (!apiKey) return fallback;

  const hasTarget = input.targetWeightKg != null && Number.isFinite(input.targetWeightKg);
  const hasWeeks = input.goalWeeks != null && input.goalWeeks > 0;

  const system =
    input.locale === 'en'
      ? `You are VitaScan's nutrition expert. Given body metrics and goal (LOSE/MAINTAIN/GAIN), return daily targets as JSON only.
Rules: Mifflin-St Jeor based maintenance kcal, then adjust for goal.
${hasTarget ? 'A targetWeightKg is provided — plan calorie intake to move from current weightKg toward targetWeightKg.' : ''}
${hasWeeks ? 'goalWeeks is set — distribute the weight change over that many weeks (safe rate: max ~1 kg/week loss, ~0.5 kg/week gain). Use ~7700 kcal ≈ 1 kg.' : 'No timeline is set — use an average sustainable pace (about −500 kcal/day for LOSE, +300 for GAIN).'}
Protein ~1.6–2.2 g/kg (higher for LOSE/GAIN); fat ~25–30% of kcal; carbs fill remaining; water ~30 ml/kg (1500–4000). Realistic adult values.`
      : `Te a VitaScan táplálkozási szakértője vagy. Testadatok és cél (LOSE/MAINTAIN/GAIN) alapján napi célokat adsz vissza CSAK JSON-ben.
Szabályok: Mifflin–St Jeor fenntartó kcal, majd a célhoz igazítás.
${hasTarget ? 'Van targetWeightKg — a jelenlegi weightKg-ról a cél testsúly felé tervezd a kalóriabevitelt.' : ''}
${hasWeeks ? 'A goalWeeks meg van adva — a súlyt ennyi hét alatt oszd el (biztonságos: max ~1 kg/hét fogyás, ~0,5 kg/hét növekedés). ~7700 kcal ≈ 1 kg.' : 'Nincs időtáv — átlagos, fenntartható tempó (fogyásnál kb. −500 kcal/nap, tömegelésnél +300).'}
Fehérje ~1,6–2,2 g/kg (fogyás/tömegelésnél magasabb); zsír ~kcal 25–30%-a; szénhidrát a maradék; víz ~30 ml/kg (1500–4000). Realisztikus felnőtt értékek.`;

  const userPayload: Record<string, unknown> = {
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    birthYear: input.birthYear,
    age: new Date().getFullYear() - input.birthYear,
    gender: input.gender,
    activityLevel: input.activityLevel,
    goal: input.goal,
  };
  if (hasTarget) userPayload.targetWeightKg = input.targetWeightKg;
  if (hasWeeks) userPayload.goalWeeks = input.goalWeeks;
  if (hasTarget && hasWeeks && input.targetWeightKg != null && input.goalWeeks != null) {
    const paceWeight =
      input.startWeightKg != null && Number.isFinite(input.startWeightKg)
        ? input.startWeightKg
        : input.weightKg;
    userPayload.startWeightKg = round1(paceWeight);
    userPayload.kgDelta = round1(input.targetWeightKg - paceWeight);
    userPayload.kgPerWeek = round1((input.targetWeightKg - paceWeight) / input.goalWeeks);
  }

  const user = JSON.stringify(userPayload);

  const models = geminiModelChain();

  try {
    for (const model of models) {
      const r = await callGemini(apiKey, model, system, user);
      if (r) return r;
    }
  } catch {
    /* fallback */
  }
  return fallback;
}
