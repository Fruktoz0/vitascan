const MEAL_ORDER = ['BREAKFAST', 'TIZORAI', 'LUNCH', 'UZSONNA', 'DINNER', 'SNACK'] as const;

export type MealTypeKey = (typeof MEAL_ORDER)[number];

export type AnalysisMealStatus = 'evaluated';

export type StructuredDailyAnalysis = {
  meals: Array<{
    mealType: MealTypeKey;
    status: AnalysisMealStatus;
    positives: string[];
    negatives: string[];
  }>;
  summary: { positives: string[]; negatives: string[] };
  suggestions: string[];
};

const SYSTEM_PROMPT_HU = `Te a VitaScan tapasztalt táplálkozási szakértője vagy.
Feladat: rövid, szakszerű ÉRTÉKELÉS JSON-ben — nem elbeszélés, NEM regény.

Bemenet: kitöltött étkezések (filledMeals + meals + mealTotals), napi célok (kcal + makrók), totals, deltas, opcionális fitness (workouts, steps, workoutEnergyKcal), dayProgress (csak háttérinfo).

Kimeneti szabályok:
- CSAK érvényes JSON a sémával. Semmi más szöveg.
- Magyar, rövid bullet-mondatok (max ~15 szó / tétel). TILOS hosszú bekezdés, történet, motivációs beszéd.
- TILOS: aktuális idő, óra, „este van”, „a nap még tart”.
- meals: CSAK a kitöltött étkezések (filledMeals), mealType sorrendben. Minden sor status: "evaluated". Ne értékelj üres étkezést.
- Étkezésenként: positives (max 2), negatives (max 2) a célokhoz és a tételekhez képest.
- Ha totals ellentmond mealTotals/tételeknek → mealTotals és tételek.
- Ne inventálj ételt/számot. Nincs orvosi diagnózis.
- Értékeld a napot a profile.goal szerint (LOSE / MAINTAIN / GAIN) a totals vs goals és deltas alapján.
- Ha van workouts vagy steps: legalább 1 summary vagy suggestion kapcsolódjon az aktivitás ↔ bevitel viszonyhoz (ha releváns).
- summary: max 3 positives, max 3 negatives (napi összkép vs cél + aktivitás).
- suggestions: max 3 KONKRÉT javaslat:
  • számokkal a makró/kcal hiányra/többletre (pl. „~+25 g fehérje”, „~−150 kcal”), deltas alapján;
  • edzésnapon: fehérje / szénhidrát timing tipp röviden;
  • minőségi figyelmeztetés cukros snacknél; rövid, kivitelezhető tippek.`;

const SYSTEM_PROMPT_EN = `You are VitaScan's experienced nutrition expert.
Task: short, professional EVALUATION as JSON — not a narrative, NOT a novel.

Input: filled meals (filledMeals + meals + mealTotals), daily goals (kcal + macros), totals, deltas, optional fitness (workouts, steps, workoutEnergyKcal), dayProgress (context only).

Output rules:
- ONLY valid JSON matching the schema. No other text.
- English, short bullet phrases (max ~15 words each). FORBIDDEN: long paragraphs, storytelling, motivational speeches.
- FORBIDDEN: current time, clock hour, "evening", "day still ongoing".
- meals: ONLY filled meals (filledMeals), in mealType order. Every row status: "evaluated". Do not evaluate empty meals.
- Per meal: positives (max 2), negatives (max 2) vs goals and items.
- If totals contradict mealTotals/items → trust mealTotals and items.
- Do not invent foods/numbers. No medical diagnoses.
- Evaluate the day vs profile.goal (LOSE / MAINTAIN / GAIN) using totals vs goals and deltas.
- If workouts or steps exist: at least 1 summary or suggestion should relate activity ↔ intake when relevant.
- summary: max 3 positives, max 3 negatives (day vs goals + activity).
- suggestions: max 3 CONCRETE tips:
  • numeric macro/kcal gaps/surplus (e.g. "~+25 g protein", "~−150 kcal") from deltas;
  • workout day: brief protein/carb timing tip;
  • quality warning for sugary snacks; short actionable tips.`;

const FITNESS_COACH_PROMPT_HU = `Te a VitaScan profi edzője és fitness szakértője vagy.
Feladat: a NAP egésze edzői értékelése JSON-ben — energiaegyensúly, edzésminőség, regeneráció, célilleszkedés.

Bemenet: teljes napi étkezés (meals/totals/deltas) CSAK kontextusként, célok, profile + body (súly, körfogatok), fitness.workouts (időtartam, kcal, pulzus ha van), steps.

Kimeneti szabályok:
- CSAK érvényes JSON a sémával. Semmi más szöveg.
- Magyar, rövid bullet-mondatok (max ~18 szó). TILOS regény, motivációs lózung.
- TILOS: aktuális óra / „este van”.
- meals: MINDIG üres tömb ([]). TILOS étkezésenkénti értékelés, positives/negatives étkezésenként. Az étkezéseket csak átnézed, és az összképbe (summary) építed.
- summary: max 4 positives, max 4 negatives — nap edzői összképe (edzés + napi bevitel összesen + cél + súly/méret kontextus). Ne bontsd étkezésekre.
- suggestions: max 3 tipp CSAK edzés/regeneráció/terhelés/intenzitás/lépés témában. TILOS étkezési javaslat, recept, élelmiszer-ajánlás, „egyél X-et” (arra külön menü van).
- Használd a pulzust (avg/max HR) ha van; ha nincs edzés, értékeld a lépéseket és a célt.
- Ne inventálj számot. Nincs orvosi diagnózis.`;

const FITNESS_COACH_PROMPT_EN = `You are VitaScan's professional coach and fitness expert.
Task: evaluate the WHOLE DAY as a coach in JSON — energy balance, workout quality, recovery, goal fit.

Input: full-day meals (meals/totals/deltas) as CONTEXT ONLY, goals, profile + body (weight, girths), fitness.workouts (duration, kcal, HR if present), steps.

Output rules:
- ONLY valid JSON matching the schema. No other text.
- English, short bullets (max ~18 words). FORBIDDEN: novels, hype speeches.
- FORBIDDEN: current clock / "it's evening".
- meals: ALWAYS an empty array ([]). FORBIDDEN: per-meal evaluation or per-meal positives/negatives. Review meals only to inform the overall picture in summary.
- summary: max 4 positives, max 4 negatives — coach overview (training + day intake totals + goals + weight/measurements). Do not break down by meal.
- suggestions: max 3 tips ONLY about training/recovery/load/intensity/steps. FORBIDDEN: meal advice, recipes, food recommendations, "eat X" (separate menu covers that).
- Use HR (avg/max) when present; if no workouts, judge steps vs goals.
- Do not invent numbers. No medical diagnoses.`;

const WEEKLY_NUTRITION_PROMPT_HU = `Te a VitaScan tapasztalt táplálkozási szakértője vagy.
Feladat: a HETI (7 napos) kalória/makró mintázat értékelése JSON-ben a felhasználó terve (célok) alapján.

Bemenet: days[] (napi kcal/makró/logCount), summary (átlag, delta a célhoz, naplózott napok, célban töltött napok, highest/lowest), goals, profile.goal (LOSE/MAINTAIN/GAIN), opcionális weightDeltaKg.

Kimeneti szabályok:
- CSAK érvényes JSON a sémával. Semmi más szöveg.
- Magyar, rövid bullet-mondatok (max ~18 szó). TILOS regény, motivációs lózung.
- meals: MINDIG üres tömb ([]). Nincs étkezésenkénti bontás.
- summary: max 4 positives, max 4 negatives — heti összkép vs terv (kcal átlag, deficit/surplus, következetesség, makrók).
- suggestions: max 3 KONKRÉT, kivitelezhető tipp számokkal (pl. „~−150 kcal/nap”, „+15 g fehérje átlag”).
- Ne ismételd szó szerint a „legtöbb/legkevesebb nap” címkéket — értelmezd a tervhez viszonyítva.
- Ne inventálj számot. Nincs orvosi diagnózis.`;

const WEEKLY_NUTRITION_PROMPT_EN = `You are VitaScan's experienced nutrition expert.
Task: evaluate the WEEKLY (7-day) calorie/macro pattern in JSON against the user's plan (goals).

Input: days[] (daily kcal/macros/logCount), summary (averages, delta vs goal, logged days, days on target, highest/lowest), goals, profile.goal (LOSE/MAINTAIN/GAIN), optional weightDeltaKg.

Output rules:
- ONLY valid JSON matching the schema. No other text.
- English, short bullets (max ~18 words). FORBIDDEN: novels, hype speeches.
- meals: ALWAYS an empty array ([]). No per-meal breakdown.
- summary: max 4 positives, max 4 negatives — week overview vs plan (avg kcal, deficit/surplus, consistency, macros).
- suggestions: max 3 CONCRETE actionable tips with numbers (e.g. "~−150 kcal/day", "+15 g protein avg").
- Do not literally restate "highest/lowest day" labels — interpret vs the plan.
- Do not invent numbers. No medical diagnoses.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    meals: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          mealType: {
            type: 'STRING',
            enum: [...MEAL_ORDER],
          },
          status: {
            type: 'STRING',
            enum: ['evaluated'],
          },
          positives: { type: 'ARRAY', items: { type: 'STRING' } },
          negatives: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['mealType', 'status', 'positives', 'negatives'],
      },
    },
    summary: {
      type: 'OBJECT',
      properties: {
        positives: { type: 'ARRAY', items: { type: 'STRING' } },
        negatives: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['positives', 'negatives'],
    },
    suggestions: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['meals', 'summary', 'suggestions'],
};

/** Fitness coach: overview only — meals must be empty. */
const FITNESS_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    meals: {
      type: 'ARRAY',
      description: 'Must always be an empty array. No per-meal evaluation.',
      items: {
        type: 'OBJECT',
        properties: {
          mealType: { type: 'STRING', enum: [...MEAL_ORDER] },
          status: { type: 'STRING', enum: ['evaluated'] },
          positives: { type: 'ARRAY', items: { type: 'STRING' } },
          negatives: { type: 'ARRAY', items: { type: 'STRING' } },
        },
      },
    },
    summary: {
      type: 'OBJECT',
      properties: {
        positives: { type: 'ARRAY', items: { type: 'STRING' } },
        negatives: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['positives', 'negatives'],
    },
    suggestions: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['meals', 'summary', 'suggestions'],
};

export type GeminiUserPayload = {
  locale: 'hu' | 'en';
  analysisKind?: 'nutrition' | 'fitness';
  profile: {
    gender?: string | null;
    birthYear?: number | null;
    heightCm?: number | null;
    weightKg?: number | null;
    activityLevel?: string | null;
    goal?: string | null;
  };
  body?: {
    weightKg: number | null;
    weightLoggedDate: string | null;
    measurements: Array<{ bodyPart: string; valueCm: number; loggedDate: string }>;
  };
  goals: {
    dailyKcalGoal: number;
    dailyProteinGoal: number | null;
    dailyCarbsGoal: number | null;
    dailyFatGoal: number | null;
  };
  deltas: {
    kcal: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
  };
  fitness: {
    steps: number | null;
    workoutEnergyKcal: number;
    workouts: Array<{
      activityType: string;
      title?: string | null;
      durationMin: number;
      activeEnergyKcal: number | null;
      distanceKm?: number | null;
      avgHeartrate?: number | null;
      maxHeartrate?: number | null;
      minHeartrate?: number | null;
    }>;
  };
  date: string;
  /** For model decisions only — must NOT appear in output text */
  queryLocalTime: string;
  queryLocalHour: number;
  dayProgress: 'ongoing' | 'complete_or_past';
  expectedMeals: readonly string[];
  filledMeals: string[];
  emptyMeals: string[];
  totals: { kcal: number; protein: number; carbs: number; fat: number; sugar: number; fiber: number };
  mealTotals: Record<string, {
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    sugar: number;
    fiber: number;
    itemCount: number;
  }>;
  meals: Record<string, Array<{
    foodName: string;
    amount: number;
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    sugar: number | null;
    fiber: number | null;
  }>>;
};

export { MEAL_ORDER };

type GenConfig = Record<string, unknown>;

function buildGenerationConfig(
  model: string,
  withJsonSchema: boolean,
  kind: 'nutrition' | 'fitness' = 'nutrition',
): GenConfig {
  const isGemini3 = /gemini-3/i.test(model);
  const base: GenConfig = {
    temperature: 0.35,
    maxOutputTokens: 8192,
    responseMimeType: 'application/json',
  };
  if (withJsonSchema) {
    base.responseSchema = kind === 'fitness' ? FITNESS_RESPONSE_SCHEMA : RESPONSE_SCHEMA;
  }
  if (isGemini3) {
    return { ...base, thinkingConfig: { thinkingLevel: 'low' } };
  }
  if (/gemini-2\.5-flash/i.test(model) && !/pro/i.test(model)) {
    return { ...base, thinkingConfig: { thinkingBudget: 0 } };
  }
  return base;
}

function asStringArray(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((s) => s.trim())
    .slice(0, max);
}

function isRateLimitError(status: number, message: string): boolean {
  if (status === 429) return true;
  return /rate limit|quota|resource exhausted|RESOURCE_EXHAUSTED|too many requests/i.test(message);
}

function isRetryableConfigError(message: string): boolean {
  return /invalid argument|thinking|Unknown name|INVALID_ARGUMENT|schema|responseMimeType/i.test(message);
}

export function normalizeStructuredAnalysis(
  raw: unknown,
  filledMeals?: string[],
  opts?: { overviewOnly?: boolean },
): StructuredDailyAnalysis {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid analysis JSON');
  }
  const obj = raw as Record<string, unknown>;
  const overviewOnly = opts?.overviewOnly === true;

  // Fitness coach: never keep per-meal evaluations
  if (overviewOnly) {
    const summaryRaw = (obj.summary && typeof obj.summary === 'object'
      ? (obj.summary as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    return {
      meals: [],
      summary: {
        positives: asStringArray(summaryRaw.positives, 4),
        negatives: asStringArray(summaryRaw.negatives, 4),
      },
      suggestions: asStringArray(obj.suggestions, 3),
    };
  }

  const mealList = Array.isArray(obj.meals) ? obj.meals : [];
  const filledSet = filledMeals?.length
    ? new Set(filledMeals)
    : null;

  const meals: StructuredDailyAnalysis['meals'] = [];
  const seen = new Set<string>();

  for (const item of mealList) {
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    const mealType = String(m.mealType || '');
    if (!MEAL_ORDER.includes(mealType as MealTypeKey)) continue;
    if (filledSet && !filledSet.has(mealType)) continue;
    if (seen.has(mealType)) continue;
    seen.add(mealType);
    meals.push({
      mealType: mealType as MealTypeKey,
      status: 'evaluated',
      positives: asStringArray(m.positives, 2),
      negatives: asStringArray(m.negatives, 2),
    });
  }

  // Ensure filled meals appear even if model omitted them
  if (filledSet) {
    for (const mealType of MEAL_ORDER) {
      if (!filledSet.has(mealType) || seen.has(mealType)) continue;
      meals.push({
        mealType,
        status: 'evaluated',
        positives: [],
        negatives: [],
      });
    }
  }

  // Sort by MEAL_ORDER
  meals.sort(
    (a, b) => MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType),
  );

  const summaryRaw = (obj.summary && typeof obj.summary === 'object'
    ? (obj.summary as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  return {
    meals,
    summary: {
      positives: asStringArray(summaryRaw.positives, 3),
      negatives: asStringArray(summaryRaw.negatives, 3),
    },
    suggestions: asStringArray(obj.suggestions, 3),
  };
}

export function parseStructuredAnalysisJson(
  text: string,
  filledMeals?: string[],
  opts?: { overviewOnly?: boolean },
): StructuredDailyAnalysis {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  const parsed = JSON.parse(cleaned);
  return normalizeStructuredAnalysis(parsed, filledMeals, opts);
}

async function callGeminiModel(
  model: string,
  apiKey: string,
  system: string,
  userText: string,
  locale: 'hu' | 'en',
  filledMeals: string[],
  kind: 'nutrition' | 'fitness' = 'nutrition',
): Promise<{ ok: true; content: string } | { ok: false; rateLimited: boolean; error: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const overviewOnly = kind === 'fitness';

  const attempts: GenConfig[] = [
    buildGenerationConfig(model, true, kind),
    buildGenerationConfig(model, false, kind),
    { temperature: 0.35, maxOutputTokens: 8192, responseMimeType: 'application/json' },
    { temperature: 0.35, maxOutputTokens: 4096 },
  ];

  let lastError = locale === 'en' ? 'Gemini request failed.' : 'A Gemini kérés sikertelen.';

  for (const generationConfig of attempts) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      lastError =
        body?.error?.message ||
        (locale === 'en' ? 'Gemini request failed.' : 'A Gemini kérés sikertelen.');
      if (isRateLimitError(res.status, String(lastError))) {
        return { ok: false, rateLimited: true, error: lastError };
      }
      if (isRetryableConfigError(String(lastError))) {
        continue;
      }
      return { ok: false, rateLimited: false, error: lastError };
    }

    try {
      const text = extractText(body, locale);
      const structured = parseStructuredAnalysisJson(
        text,
        overviewOnly ? [] : filledMeals,
        { overviewOnly },
      );
      return { ok: true, content: JSON.stringify(structured) };
    } catch (err: any) {
      lastError = err?.message || lastError;
      continue;
    }
  }

  return { ok: false, rateLimited: false, error: lastError };
}

export type CoachNudgePayload = {
  locale: 'hu' | 'en';
  date: string;
  totals: { kcal: number; protein: number; carbs: number; fat: number };
  goals: {
    dailyKcalGoal: number;
    dailyProteinGoal: number | null;
    dailyCarbsGoal: number | null;
    dailyFatGoal: number | null;
  };
  deltas: { kcal: number };
  filledMeals: string[];
  emptyMainMeals: string[];
  nearestMealHint?: string;
};

export type CoachNudgeResult = {
  line: string;
  mood: 'curious' | 'calm' | 'warn' | 'celebrate';
};

function parseCoachNudgeJson(text: string): CoachNudgeResult {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  const parsed = JSON.parse(cleaned) as Partial<CoachNudgeResult>;
  const moods = new Set(['curious', 'calm', 'warn', 'celebrate']);
  const line = typeof parsed.line === 'string' ? parsed.line.trim() : '';
  if (!line) throw new Error('Missing coach line');
  const mood =
    typeof parsed.mood === 'string' && moods.has(parsed.mood)
      ? (parsed.mood as CoachNudgeResult['mood'])
      : 'calm';
  return { line: line.slice(0, 160), mood };
}

/** Short one-line home coach nudge — not a full daily analysis. */
export async function generateCoachNudge(payload: CoachNudgePayload): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw Object.assign(new Error('Gemini API kulcs nincs beállítva.'), { statusCode: 503 });
  }

  const primary = process.env.GEMINI_MODEL?.trim() || 'gemini-3.6-flash';
  const fallback =
    process.env.GEMINI_FALLBACK_MODEL?.trim() || 'gemini-3.5-flash-lite';

  const system =
    payload.locale === 'en'
      ? `You are VitaScan's friendly nutrition coach on the home screen.
Return ONLY JSON: {"line": string, "mood": "curious"|"calm"|"warn"|"celebrate"}.
Rules: one short sentence (max ~20 words). Actionable tip for what to eat or watch next. No medical claims. No clock/time narration. mood must match the tip tone.`
      : `Te a VitaScan barátságos táplálkozási coach-a vagy a főképernyőn.
CSAK JSON: {"line": string, "mood": "curious"|"calm"|"warn"|"celebrate"}.
Szabályok: egy rövid mondat (max ~20 szó). Konkrét tipp mit egyen / mire figyeljen. Nincs orvosi diagnózis. Ne említs órát. A mood illeszkedjen a hangulathoz.`;

  const userText = [
    payload.locale === 'en' ? 'Context (JSON):' : 'Kontextus (JSON):',
    JSON.stringify(payload),
    payload.locale === 'en'
      ? 'Return ONLY the coach nudge JSON.'
      : 'Csak a coach nudge JSON.',
  ].join('\n');

  const models = [primary, fallback].filter((m, i, arr) => m && arr.indexOf(m) === i);
  let lastError = payload.locale === 'en' ? 'Gemini request failed.' : 'A Gemini kérés sikertelen.';

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 256,
          responseMimeType: 'application/json',
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      lastError = body?.error?.message || lastError;
      continue;
    }
    try {
      const text = extractText(body, payload.locale);
      const nudge = parseCoachNudgeJson(text);
      return JSON.stringify(nudge);
    } catch (err: any) {
      lastError = err?.message || lastError;
    }
  }

  throw Object.assign(new Error(lastError), { statusCode: 502 });
}

export type MealSuggestIdea = {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  note?: string;
};

export type MealSuggestSlot = {
  mealType: MealTypeKey;
  title: string;
  ideas: MealSuggestIdea[];
};

export type MealSuggestPayload = {
  locale: 'hu' | 'en';
  date: string;
  queryLocalHour: number;
  remaining: { kcal: number; protein: number; carbs: number; fat: number };
  goals: {
    dailyKcalGoal: number;
    dailyProteinGoal: number | null;
    dailyCarbsGoal: number | null;
    dailyFatGoal: number | null;
  };
  totals: { kcal: number; protein: number; carbs: number; fat: number };
  emptyMeals: MealTypeKey[];
  filledMeals: MealTypeKey[];
  /** Per-slot kcal/macro budget hint (share of remaining) */
  slotBudgets: Array<{
    mealType: MealTypeKey;
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
  }>;
  /** If set, only regenerate this one meal */
  targetMeal?: MealTypeKey;
};

function parseMealSuggestJson(text: string, allowed: Set<string>): MealSuggestSlot[] {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  const parsed = JSON.parse(cleaned) as { suggestions?: unknown };
  const raw = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  const out: MealSuggestSlot[] = [];

  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const mealType = String((row as any).mealType ?? '');
    if (!allowed.has(mealType)) continue;
    const title = typeof (row as any).title === 'string' ? (row as any).title.trim() : '';
    const ideasRaw = Array.isArray((row as any).ideas) ? (row as any).ideas : [];
    const ideas: MealSuggestIdea[] = [];
    for (const idea of ideasRaw.slice(0, 2)) {
      if (!idea || typeof idea !== 'object') continue;
      const name = typeof idea.name === 'string' ? idea.name.trim() : '';
      if (!name) continue;
      const n = (v: unknown) => {
        const x = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(x) ? Math.max(0, Math.round(x * 10) / 10) : 0;
      };
      ideas.push({
        name: name.slice(0, 80),
        kcal: Math.round(n(idea.kcal)),
        protein: n(idea.protein),
        carbs: n(idea.carbs),
        fat: n(idea.fat),
        ...(typeof idea.note === 'string' && idea.note.trim()
          ? { note: idea.note.trim().slice(0, 100) }
          : {}),
      });
    }
    if (ideas.length === 0) continue;
    out.push({
      mealType: mealType as MealTypeKey,
      title: (title || mealType).slice(0, 60),
      ideas,
    });
  }

  return out.slice(0, 4);
}

/** Food ideas for remaining empty meal slots — stored as DailyAnalysis kind=mealSuggest. */
export async function generateMealSuggestions(payload: MealSuggestPayload): Promise<MealSuggestSlot[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw Object.assign(new Error('Gemini API kulcs nincs beállítva.'), { statusCode: 503 });
  }

  const primary = process.env.GEMINI_MODEL?.trim() || 'gemini-3.6-flash';
  const fallback =
    process.env.GEMINI_FALLBACK_MODEL?.trim() || 'gemini-3.5-flash-lite';

  const targetSet = new Set(
    payload.targetMeal
      ? [payload.targetMeal]
      : payload.slotBudgets.map((s) => s.mealType),
  );

  const system =
    payload.locale === 'en'
      ? `You are VitaScan's meal suggestion helper.
Return ONLY JSON: {"suggestions":[{"mealType":string,"title":string,"ideas":[{"name":string,"kcal":number,"protein":number,"carbs":number,"fat":number,"note":string}]}]}.
Rules:
- Suggest ONLY for the given empty meal slots (mealType enum). Max 4 suggestions.
- Each suggestion: 1–2 realistic food ideas that fit the slot budget (kcal/macros) approximately.
- Simple everyday foods or easy combos. No medical claims. No recipes longer than a name + optional short note.
- Prefer variety; do not repeat the same idea across slots.
- If remaining kcal is very low, suggest light options under the budget.
- Do NOT invent mealTypes outside slotBudgets. Respect queryLocalHour: only upcoming meals for that time of day.`
      : `Te a VitaScan étkezés-javasló segédje vagy.
CSAK JSON: {"suggestions":[{"mealType":string,"title":string,"ideas":[{"name":string,"kcal":number,"protein":number,"carbs":number,"fat":number,"note":string}]}]}.
Szabályok:
- CSAK a megadott üres étkezés-slotokra javasolj (mealType enum). Max 4 javaslat.
- Slotonként 1–2 reális ételötlet, ami kb. belefér a slot kcal/makró keretébe.
- Egyszerű, hétköznapi ételek / könnyű kombinációk. Nincs orvosi diagnózis. Nincs hosszú recept — név + opcionális rövid note.
- Variáld az ötleteket; ne ismételd ugyanazt több sloton.
- Ha kevés a fennmaradó kcal, könnyű, alacsony kcal tippeket adj.
- Ne találj ki mealType-ot a slotBudgets-en kívül. Figyeld a queryLocalHour-t: csak a napszakhoz még illő étkezések.`;

  const userText = [
    payload.locale === 'en' ? 'Context (JSON):' : 'Kontextus (JSON):',
    JSON.stringify(payload),
    payload.locale === 'en'
      ? 'Return ONLY the meal suggestions JSON for the requested slots.'
      : 'Csak a kért slotokra vonatkozó ételjavaslat JSON.',
  ].join('\n');

  const models = [primary, fallback].filter((m, i, arr) => m && arr.indexOf(m) === i);
  let lastError = payload.locale === 'en' ? 'Gemini request failed.' : 'A Gemini kérés sikertelen.';

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      lastError = body?.error?.message || lastError;
      continue;
    }
    try {
      const text = extractText(body, payload.locale);
      const slots = parseMealSuggestJson(text, targetSet);
      if (slots.length === 0) {
        throw new Error(payload.locale === 'en' ? 'No suggestions.' : 'Nincs javaslat.');
      }
      return slots;
    } catch (err: any) {
      lastError = err?.message || lastError;
    }
  }

  throw Object.assign(new Error(lastError), { statusCode: 502 });
}

/** Returns canonical JSON string to store in DB */
export async function generateDailyAnalysis(payload: GeminiUserPayload): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw Object.assign(new Error('Gemini API kulcs nincs beállítva.'), { statusCode: 503 });
  }

  const primary = process.env.GEMINI_MODEL?.trim() || 'gemini-3.6-flash';
  const fallback =
    process.env.GEMINI_FALLBACK_MODEL?.trim() || 'gemini-3.5-flash-lite';

  const isFitness = payload.analysisKind === 'fitness';
  const kind = isFitness ? 'fitness' : 'nutrition';
  const system = isFitness
    ? payload.locale === 'en'
      ? FITNESS_COACH_PROMPT_EN
      : FITNESS_COACH_PROMPT_HU
    : payload.locale === 'en'
      ? SYSTEM_PROMPT_EN
      : SYSTEM_PROMPT_HU;

  const userText = [
    payload.locale === 'en' ? 'Daily context (JSON):' : 'Napi kontextus (JSON):',
    JSON.stringify(payload, null, 2),
    isFitness
      ? payload.locale === 'en'
        ? 'Return ONLY coach overview JSON. meals MUST be []. Put all evaluation in summary + training suggestions. No per-meal opinions. No meal recommendations.'
        : 'Csak edzői összkép JSON. meals MINDIG []. Minden értékelés a summary-ban + edzésjavaslatok. TILOS étkezésenkénti vélemény. TILOS étkezési javaslat.'
      : payload.locale === 'en'
        ? 'Return ONLY short evaluation JSON. Use goals, deltas, meals, and fitness (workouts/steps) when present. No novels. No time narration.'
        : 'Csak rövid értékelő JSON. Használd a célokat, deltas-t, étkezéseket és a fitness (edzés/lépés) adatot, ha van. Nincs regény. Ne említs időt.',
  ].join('\n');

  const primaryResult = await callGeminiModel(
    primary,
    apiKey,
    system,
    userText,
    payload.locale,
    payload.filledMeals,
    kind,
  );
  if (primaryResult.ok) return primaryResult.content;

  if (primaryResult.rateLimited && fallback && fallback !== primary) {
    const fallbackResult = await callGeminiModel(
      fallback,
      apiKey,
      system,
      userText,
      payload.locale,
      payload.filledMeals,
      kind,
    );
    if (fallbackResult.ok) return fallbackResult.content;
    throw Object.assign(new Error(fallbackResult.error), { statusCode: 502 });
  }

  throw Object.assign(new Error(primaryResult.error), { statusCode: 502 });
}

export type WeeklyNutritionGeminiPayload = {
  locale: 'hu' | 'en';
  from: string;
  to: string;
  profile: {
    gender?: string | null;
    birthYear?: number | null;
    heightCm?: number | null;
    weightKg?: number | null;
    activityLevel?: string | null;
    goal?: string | null;
  };
  goals: {
    dailyKcalGoal: number;
    dailyProteinGoal: number | null;
    dailyCarbsGoal: number | null;
    dailyFatGoal: number | null;
  };
  days: Array<{
    date: string;
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    logCount: number;
  }>;
  summary: {
    avgKcal: number;
    avgProtein: number;
    avgCarbs: number;
    avgFat: number;
    totalKcal: number;
    loggedDays: number;
    daysOnTarget: number;
    avgDeltaVsGoal: number;
    highestDay: { date: string; kcal: number } | null;
    lowestDay: { date: string; kcal: number } | null;
    kcalRange: number | null;
  };
  weightDeltaKg: number | null;
};

/** Returns canonical JSON string to store in DB (overview-only schema). */
export async function generateWeeklyNutritionAnalysis(
  payload: WeeklyNutritionGeminiPayload,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw Object.assign(new Error('Gemini API kulcs nincs beállítva.'), { statusCode: 503 });
  }

  const primary = process.env.GEMINI_MODEL?.trim() || 'gemini-3.6-flash';
  const fallback =
    process.env.GEMINI_FALLBACK_MODEL?.trim() || 'gemini-3.5-flash-lite';

  const system =
    payload.locale === 'en' ? WEEKLY_NUTRITION_PROMPT_EN : WEEKLY_NUTRITION_PROMPT_HU;

  const userText = [
    payload.locale === 'en' ? 'Weekly context (JSON):' : 'Heti kontextus (JSON):',
    JSON.stringify(payload, null, 2),
    payload.locale === 'en'
      ? 'Return ONLY overview JSON. meals MUST be []. Put all evaluation in summary + suggestions vs the plan.'
      : 'Csak heti összkép JSON. meals MINDIG []. Minden értékelés a summary-ban + javaslatok a tervhez képest.',
  ].join('\n');

  const primaryResult = await callGeminiModel(
    primary,
    apiKey,
    system,
    userText,
    payload.locale,
    [],
    'fitness',
  );
  if (primaryResult.ok) return primaryResult.content;

  if (primaryResult.rateLimited && fallback && fallback !== primary) {
    const fallbackResult = await callGeminiModel(
      fallback,
      apiKey,
      system,
      userText,
      payload.locale,
      [],
      'fitness',
    );
    if (fallbackResult.ok) return fallbackResult.content;
    throw Object.assign(new Error(fallbackResult.error), { statusCode: 502 });
  }

  throw Object.assign(new Error(primaryResult.error), { statusCode: 502 });
}

/** @deprecated use generateDailyAnalysis */
export async function generateNutritionAnalysis(payload: GeminiUserPayload): Promise<string> {
  return generateDailyAnalysis({ ...payload, analysisKind: payload.analysisKind ?? 'nutrition' });
}

function extractText(body: any, locale: 'hu' | 'en'): string {
  const parts: Array<{ text?: string; thought?: boolean }> =
    body?.candidates?.[0]?.content?.parts || [];

  const text = parts
    .filter((p) => !p.thought)
    .map((p) => p.text || '')
    .join('')
    .trim();

  if (!text) {
    throw Object.assign(
      new Error(locale === 'en' ? 'Empty AI response.' : 'Üres AI válasz.'),
      { statusCode: 502 },
    );
  }

  return text;
}
