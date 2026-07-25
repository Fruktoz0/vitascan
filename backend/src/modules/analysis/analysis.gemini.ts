const MEAL_ORDER = ['BREAKFAST', 'TIZORAI', 'LUNCH', 'UZSONNA', 'DINNER', 'SNACK'] as const;

export type MealTypeKey = (typeof MEAL_ORDER)[number];

export type AnalysisMealStatus = 'evaluated' | 'empty_ok' | 'empty_missed';

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
Feladat: rövid, szakszerű ÉRTÉKELÉS JSON-ben — nem elbeszélés, nem regény.

Bemenet: napló tételek, étkezésenkénti összesítők, napi célok, dayProgress (csak döntéshez).
dayProgress = ongoing → az üres étkezések valószínűleg még szándékosan üresek → status: empty_ok, üres positives/negatives.
dayProgress = complete_or_past → üres étkezés lehet hiány → status: empty_missed, max 1 rövid negative.

Kimeneti szabályok:
- CSAK érvényes JSON a megadott sémával. Semmi más szöveg.
- Magyar nyelvű, rövid bullet-szerű mondatok (max ~12 szó / tétel).
- TILOS: aktuális idő, óra, „este van”, „a nap még tart”, „lekérdezés időpontja”, felhasználó tájékoztatása arról, amit már tud.
- Értékeld a KITÖLTÖTT étkezéseket a célokhoz (napi kcal cél, makrók) képest: positives (max 2) / negatives (max 2).
- Ha a totals ellentmond a mealTotals / tételeknek, a mealTotals és a tételek számadatait használd.
- Ne inventálj ételt/számot. Nincs orvosi diagnózis.
- summary: max 3 positives, max 3 negatives (napi összkép).
- suggestions: max 3 konkrét, kivitelezhető javaslat.
- Minden expectedMeals étkezés szerepeljen a meals tömbben, mealType sorrendben.`;

const SYSTEM_PROMPT_EN = `You are VitaScan's experienced nutrition expert.
Task: short, professional EVALUATION as JSON — not a narrative essay.

Input: food logs, per-meal totals, daily goals, dayProgress (for decisions only).
dayProgress = ongoing → empty meals are likely intentional → status: empty_ok, empty positives/negatives.
dayProgress = complete_or_past → empty meal may be a miss → status: empty_missed, at most 1 short negative.

Output rules:
- ONLY valid JSON matching the schema. No other text.
- English, short bullet-like phrases (max ~12 words each).
- FORBIDDEN: current time, clock hour, "evening", "day is still ongoing", telling the user what they already know about the clock.
- Evaluate FILLED meals vs goals (daily kcal, macros): positives (max 2) / negatives (max 2).
- If totals contradict mealTotals/items, trust mealTotals and items.
- Do not invent foods/numbers. No medical diagnoses.
- summary: max 3 positives, max 3 negatives (day overview).
- suggestions: max 3 concrete actionable tips.
- Include every expectedMeals entry in meals, in mealType order.`;

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
            enum: ['evaluated', 'empty_ok', 'empty_missed'],
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

export type GeminiUserPayload = {
  locale: 'hu' | 'en';
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
  };
  date: string;
  /** For model decisions only — must NOT appear in output text */
  queryLocalTime: string;
  queryLocalHour: number;
  dayProgress: 'ongoing' | 'complete_or_past';
  expectedMeals: readonly string[];
  filledMeals: string[];
  emptyMeals: string[];
  /** Prefer mealTotals when totals look inconsistent */
  totals: { kcal: number; protein: number; carbs: number; fat: number };
  mealTotals: Record<string, { kcal: number; protein: number; carbs: number; fat: number; itemCount: number }>;
  meals: Record<string, Array<{
    foodName: string;
    amount: number;
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
  }>>;
};

export { MEAL_ORDER };

type GenConfig = Record<string, unknown>;

function buildGenerationConfig(model: string, withJsonSchema: boolean): GenConfig {
  const isGemini3 = /gemini-3/i.test(model);
  const base: GenConfig = {
    temperature: 0.35,
    maxOutputTokens: 8192,
    responseMimeType: 'application/json',
  };
  if (withJsonSchema) {
    base.responseSchema = RESPONSE_SCHEMA;
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

export function normalizeStructuredAnalysis(raw: unknown): StructuredDailyAnalysis {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid analysis JSON');
  }
  const obj = raw as Record<string, unknown>;
  const mealList = Array.isArray(obj.meals) ? obj.meals : [];
  const byType = new Map<string, StructuredDailyAnalysis['meals'][number]>();

  for (const item of mealList) {
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    const mealType = String(m.mealType || '');
    if (!MEAL_ORDER.includes(mealType as MealTypeKey)) continue;
    const statusRaw = String(m.status || 'evaluated');
    const status: AnalysisMealStatus =
      statusRaw === 'empty_ok' || statusRaw === 'empty_missed' || statusRaw === 'evaluated'
        ? statusRaw
        : 'evaluated';
    byType.set(mealType, {
      mealType: mealType as MealTypeKey,
      status,
      positives: asStringArray(m.positives, 2),
      negatives: asStringArray(m.negatives, 2),
    });
  }

  const meals = MEAL_ORDER.map((mealType) => {
    const existing = byType.get(mealType);
    if (existing) return existing;
    return { mealType, status: 'empty_ok' as const, positives: [], negatives: [] };
  });

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

export function parseStructuredAnalysisJson(text: string): StructuredDailyAnalysis {
  let cleaned = text.trim();
  // Strip accidental markdown fences
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  const parsed = JSON.parse(cleaned);
  return normalizeStructuredAnalysis(parsed);
}

/** Returns canonical JSON string to store in DB */
export async function generateNutritionAnalysis(payload: GeminiUserPayload): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw Object.assign(new Error('Gemini API kulcs nincs beállítva.'), { statusCode: 503 });
  }

  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.6-flash';
  const system = payload.locale === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_HU;
  const userText = [
    payload.locale === 'en' ? 'Daily context (JSON):' : 'Napi kontextus (JSON):',
    JSON.stringify(payload, null, 2),
    payload.locale === 'en'
      ? 'Return ONLY the evaluation JSON. No time/clock narration.'
      : 'Csak az értékelő JSON-t add vissza. Ne említs időt/órát.',
  ].join('\n');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const attempts: GenConfig[] = [
    buildGenerationConfig(model, true),
    buildGenerationConfig(model, false),
    { temperature: 0.35, maxOutputTokens: 8192, responseMimeType: 'application/json' },
    { temperature: 0.35, maxOutputTokens: 4096 },
  ];

  let lastError = payload.locale === 'en' ? 'Gemini request failed.' : 'A Gemini kérés sikertelen.';

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
        (payload.locale === 'en' ? 'Gemini request failed.' : 'A Gemini kérés sikertelen.');
      if (/invalid argument|thinking|Unknown name|INVALID_ARGUMENT|schema|responseMimeType/i.test(String(lastError))) {
        continue;
      }
      throw Object.assign(new Error(lastError), { statusCode: 502 });
    }

    try {
      const text = extractText(body, payload.locale);
      const structured = parseStructuredAnalysisJson(text);
      return JSON.stringify(structured);
    } catch (err: any) {
      lastError = err?.message || lastError;
      continue;
    }
  }

  throw Object.assign(new Error(lastError), { statusCode: 502 });
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
