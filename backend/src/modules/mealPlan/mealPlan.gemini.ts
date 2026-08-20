import { MealType } from '@prisma/client';
import { geminiModelChain } from '../../utils/geminiModels';

export type DietTag = 'GLUTEN_FREE' | 'DAIRY_FREE' | 'VEGAN' | 'SUGAR_FREE';

export type CatalogItem = {
  id: string;
  source: 'RECIPE' | 'TEMPLATE';
  title: string;
  minutes: number;
  leftoverDays: number;
  pantryScore: number;
  kcal: number | null;
  meals: Array<'BREAKFAST' | 'LUNCH' | 'DINNER'>;
};

export type GenerateSlotPick = {
  date: string;
  mealType: MealType;
  source: 'RECIPE' | 'TEMPLATE';
  id: string;
};

type GeneratePayload = {
  locale: 'hu' | 'en';
  weekStart: string;
  dates: string[];
  meals: Array<'BREAKFAST' | 'LUNCH' | 'DINNER'>;
  slotCaps: Array<{ date: string; mealType: string; maxMinutes: number; kcalHint: number | null }>;
  catalog: CatalogItem[];
  matchKcal?: boolean;
};

function extractText(body: unknown, locale: 'hu' | 'en'): string {
  const parts: Array<{ text?: string; thought?: boolean }> =
    (body as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> })
      ?.candidates?.[0]?.content?.parts || [];
  const text = parts
    .filter((p) => !p.thought)
    .map((p) => p.text || '')
    .join('')
    .trim();
  if (!text) {
    throw Object.assign(new Error(locale === 'en' ? 'Empty AI response.' : 'Üres AI válasz.'), {
      statusCode: 502,
    });
  }
  return text;
}

function parseSlots(text: string, validIds: Set<string>, meals: Set<string>): GenerateSlotPick[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return [];
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return [];
    }
  }
  const root = parsed as { slots?: unknown };
  if (!Array.isArray(root.slots)) return [];
  const out: GenerateSlotPick[] = [];
  const seen = new Set<string>();
  for (const raw of root.slots) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const date = String(row.date ?? '');
    const mealType = String(row.mealType ?? '') as MealType;
    const source = String(row.source ?? 'RECIPE').toUpperCase();
    const id = String(row.id ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!meals.has(mealType)) continue;
    if (source !== 'RECIPE' && source !== 'TEMPLATE') continue;
    if (!validIds.has(`${source}:${id}`)) continue;
    const key = `${date}:${mealType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ date, mealType, source, id });
  }
  return out;
}

export async function assignMealPlanIds(payload: GeneratePayload): Promise<GenerateSlotPick[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw Object.assign(new Error('Gemini API kulcs nincs beállítva.'), { statusCode: 503 });
  }

  const validIds = new Set(payload.catalog.map((c) => `${c.source}:${c.id}`));
  const meals = new Set(payload.meals);

  const kcalRuleEn = payload.matchKcal
    ? '- IMPORTANT: keep each slot as close to kcalHint as possible; do not exceed it by more than ~15%.'
    : '- Aim near kcalHint when present.';
  const kcalRuleHu = payload.matchKcal
    ? '- FONTOS: minden slot a kcalHint-hez a lehető legközelebb legyen; ne lépd túl ~15%-nál jobban.'
    : '- kcalHint közelébe célozz, ha van.';

  const system =
    payload.locale === 'en'
      ? `You assign VitaScan meal-plan slots.
Return ONLY JSON: {"slots":[{"date":"YYYY-MM-DD","mealType":"BREAKFAST|LUNCH|DINNER","source":"RECIPE|TEMPLATE","id":"uuid"}]}.
Rules:
- Use ONLY ids from the catalog. Never invent titles, foods, or ids.
- Fill every empty slot listed in slotCaps (one assignment per date+mealType).
- Respect maxMinutes. Prefer catalog items whose meals include the slot.
- Prefer higher pantryScore. Avoid repeating the same id more than twice (except leftoverDays copies).
- If leftoverDays > 0 on a dinner, reuse that same id on the next leftoverDays dinners.
${kcalRuleEn}
- The catalog is already filtered to the requested diet; just assign from it. No medical claims.`
      : `Te a VitaScan étkezésterv-kiosztója vagy.
CSAK JSON: {"slots":[{"date":"YYYY-MM-DD","mealType":"BREAKFAST|LUNCH|DINNER","source":"RECIPE|TEMPLATE","id":"uuid"}]}.
Szabályok:
- CSAK a katalógus id-jait használd. Ne találj ki címet, ételt vagy azonosítót.
- Töltsd ki a slotCaps összes üres slotját (egy kiosztás date+mealType-onként).
- Tartsd a maxMinutes korlátot. Részesítsd előnyben a slot meal-jéhez illő tételeket.
- Magasabb pantryScore jobb. Ugyanazt az id-t max kétszer (kivéve leftoverDays másolat).
- Ha leftoverDays > 0 vacsorán, a következő leftoverDays vacsorán ugyanazt az id-t tedd.
${kcalRuleHu}
- A katalógus már a kért diétára van szűrve; csak ossz ki belőle. Nincs orvosi állítás.`;

  const userText = [
    payload.locale === 'en' ? 'Context (JSON):' : 'Kontextus (JSON):',
    JSON.stringify({
      weekStart: payload.weekStart,
      dates: payload.dates,
      meals: payload.meals,
      slotCaps: payload.slotCaps,
      catalog: payload.catalog.map((c) => ({
        id: c.id,
        source: c.source,
        title: c.title,
        minutes: c.minutes,
        leftoverDays: c.leftoverDays,
        pantryScore: Math.round(c.pantryScore * 100) / 100,
        kcal: c.kcal,
        meals: c.meals,
      })),
    }),
    payload.locale === 'en'
      ? 'Return ONLY the slots JSON using catalog ids.'
      : 'Csak a slot JSON, katalógus id-kkal.',
  ].join('\n');

  const models = geminiModelChain();
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
          temperature: 0.4,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      lastError = (body as { error?: { message?: string } })?.error?.message || lastError;
      continue;
    }
    try {
      const text = extractText(body, payload.locale);
      return parseSlots(text, validIds, meals);
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
    }
  }

  throw Object.assign(new Error(lastError), { statusCode: 502 });
}
