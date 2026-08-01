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
      durationMin: number;
      activeEnergyKcal: number | null;
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
): StructuredDailyAnalysis {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid analysis JSON');
  }
  const obj = raw as Record<string, unknown>;
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
): StructuredDailyAnalysis {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  const parsed = JSON.parse(cleaned);
  return normalizeStructuredAnalysis(parsed, filledMeals);
}

async function callGeminiModel(
  model: string,
  apiKey: string,
  system: string,
  userText: string,
  locale: 'hu' | 'en',
  filledMeals: string[],
): Promise<{ ok: true; content: string } | { ok: false; rateLimited: boolean; error: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const attempts: GenConfig[] = [
    buildGenerationConfig(model, true),
    buildGenerationConfig(model, false),
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
      const structured = parseStructuredAnalysisJson(text, filledMeals);
      return { ok: true, content: JSON.stringify(structured) };
    } catch (err: any) {
      lastError = err?.message || lastError;
      continue;
    }
  }

  return { ok: false, rateLimited: false, error: lastError };
}

/** Returns canonical JSON string to store in DB */
export async function generateNutritionAnalysis(payload: GeminiUserPayload): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw Object.assign(new Error('Gemini API kulcs nincs beállítva.'), { statusCode: 503 });
  }

  const primary = process.env.GEMINI_MODEL?.trim() || 'gemini-3.6-flash';
  const fallback =
    process.env.GEMINI_FALLBACK_MODEL?.trim() || 'gemini-3.5-flash-lite';

  const system = payload.locale === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_HU;
  const userText = [
    payload.locale === 'en' ? 'Daily context (JSON):' : 'Napi kontextus (JSON):',
    JSON.stringify(payload, null, 2),
    payload.locale === 'en'
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
    );
    if (fallbackResult.ok) return fallbackResult.content;
    throw Object.assign(new Error(fallbackResult.error), { statusCode: 502 });
  }

  throw Object.assign(new Error(primaryResult.error), { statusCode: 502 });
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
