import { MealType } from '@prisma/client';
import { geminiModelChain } from '../../utils/geminiModels';

export type DietTag = 'GLUTEN_FREE' | 'DAIRY_FREE' | 'VEGAN' | 'SUGAR_FREE';

export type InventedIngredient = {
  name: string;
  amount: number | null;
  unit: string | null;
};

export type InventedSlot = {
  date: string;
  mealType: MealType;
  title: string;
  description: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  kcal: number | null;
  dietTags: Array<'GLUTEN_FREE' | 'DAIRY_FREE' | 'VEGAN'>;
  ingredients: InventedIngredient[];
  instructions: string[];
};

type InventPayload = {
  locale: 'hu' | 'en';
  weekStart: string;
  dates: string[];
  meals: Array<'BREAKFAST' | 'LUNCH' | 'DINNER'>;
  slotCaps: Array<{ date: string; mealType: string; maxMinutes: number; kcalHint: number | null }>;
  diet: DietTag[];
  matchKcal: boolean;
  seasonal: boolean;
  month: number;
  pantry: Array<{ name: string; quantity: number; unit: string }>;
  usePantry: boolean;
  dailyKcalGoal: number | null;
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

function asNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : null;
}

function parseInvented(text: string, meals: Set<string>, dates: Set<string>): InventedSlot[] {
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

  const out: InventedSlot[] = [];
  const seen = new Set<string>();

  for (const raw of root.slots) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const date = String(row.date ?? '');
    const mealType = String(row.mealType ?? '') as MealType;
    const title = String(row.title ?? '').trim();
    if (!dates.has(date) || !meals.has(mealType) || title.length < 2) continue;
    const key = `${date}:${mealType}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const dietTags = Array.isArray(row.dietTags)
      ? row.dietTags
          .map((t) => String(t).toUpperCase())
          .filter((t): t is 'GLUTEN_FREE' | 'DAIRY_FREE' | 'VEGAN' =>
            t === 'GLUTEN_FREE' || t === 'DAIRY_FREE' || t === 'VEGAN',
          )
      : [];

    const ingredientsRaw = Array.isArray(row.ingredients) ? row.ingredients : [];
    const ingredients: InventedIngredient[] = [];
    for (const ing of ingredientsRaw.slice(0, 24)) {
      if (!ing || typeof ing !== 'object') continue;
      const item = ing as Record<string, unknown>;
      const name = String(item.name ?? '').trim();
      if (!name) continue;
      ingredients.push({
        name: name.slice(0, 120),
        amount: asNumber(item.amount),
        unit: item.unit != null ? String(item.unit).trim().slice(0, 24) || null : null,
      });
    }
    if (ingredients.length === 0) continue;

    const instructions = Array.isArray(row.instructions)
      ? row.instructions.map((s) => String(s).trim()).filter(Boolean).slice(0, 12)
      : [];

    const servings = Math.max(1, Math.min(8, Math.round(asNumber(row.servings) ?? 2)));
    const prepMinutes = Math.max(0, Math.min(180, Math.round(asNumber(row.prepMinutes) ?? 10)));
    const cookMinutes = Math.max(0, Math.min(240, Math.round(asNumber(row.cookMinutes) ?? 15)));

    out.push({
      date,
      mealType,
      title: title.slice(0, 160),
      description: String(row.description ?? '').trim().slice(0, 500),
      servings,
      prepMinutes,
      cookMinutes,
      kcal: asNumber(row.kcal),
      dietTags,
      ingredients,
      instructions:
        instructions.length > 0
          ? instructions
          : ['Készítsd el a hozzávalókból a megnevezett ételt.'],
    });
  }
  return out;
}

export async function inventMealPlanSlots(payload: InventPayload): Promise<InventedSlot[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw Object.assign(new Error('Gemini API kulcs nincs beállítva.'), { statusCode: 503 });
  }

  const meals = new Set(payload.meals);
  const dates = new Set(payload.dates);
  const dietRecipeTags = payload.diet.filter((d) => d !== 'SUGAR_FREE');
  const sugarFree = payload.diet.includes('SUGAR_FREE');

  const kcalRuleEn = payload.matchKcal
    ? '- IMPORTANT: each meal kcal must stay within ~15% of kcalHint when present.'
    : '- Aim near kcalHint when present.';
  const kcalRuleHu = payload.matchKcal
    ? '- FONTOS: minden étkezés kcal-ja a kcalHint ±15%-án belül legyen, ha van.'
    : '- kcalHint közelébe célozz, ha van.';

  const pantryRuleEn = payload.usePantry && payload.pantry.length
    ? '- Prefer inventing meals that use pantry items when realistic; you may still add missing staples.'
    : '- Invent realistic everyday meals; pantry preference is off.';
  const pantryRuleHu = payload.usePantry && payload.pantry.length
    ? '- Részesítsd előnyben a kamrában lévő hozzávalókat, ha reális; hiányzó alapanyagot hozzáadhatsz.'
    : '- Találj ki reális, hétköznapi ételeket; a kamra preferencia ki van kapcsolva.';

  const dietRuleEn = [
    dietRecipeTags.length
      ? `- EVERY invented meal MUST be suitable for: ${dietRecipeTags.join(', ')}. Reflect those tags in dietTags.`
      : '- dietTags only when clearly true for the finished dish.',
    sugarFree
      ? '- SUGAR_FREE: avoid sugar, honey, syrups, sweet desserts, sugary drinks; keep added sugar near zero.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  const dietRuleHu = [
    dietRecipeTags.length
      ? `- MINDEN kitalált étel feleljen meg: ${dietRecipeTags.join(', ')}. Ezeket tedd a dietTags-be.`
      : '- dietTags csak ha egyértelműen igaz a kész ételre.',
    sugarFree
      ? '- CUKORMENTES: kerüld a cukrot, mézet, szirupot, édességet, cukros italt; hozzáadott cukor közel 0.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const seasonalEn = payload.seasonal
    ? `- Prefer seasonal produce for month ${payload.month} (Northern Hemisphere / Central Europe).`
    : '';
  const seasonalHu = payload.seasonal
    ? `- Részesítsd előnyben a(z) ${payload.month}. hónap idényzöldségeit/gyümölcseit (Közép-Európa).`
    : '';

  const system =
    payload.locale === 'en'
      ? `You are VitaScan's meal-plan chef.
Invent COMPLETE, realistic recipes for empty meal-plan slots. Do NOT pick from a user catalog — invent suitable dishes from common world cuisine.
Return ONLY JSON:
{"slots":[{"date":"YYYY-MM-DD","mealType":"BREAKFAST|LUNCH|DINNER","title":string,"description":string,"servings":number,"prepMinutes":number,"cookMinutes":number,"kcal":number,"dietTags":["GLUTEN_FREE"|"DAIRY_FREE"|"VEGAN"],"ingredients":[{"name":string,"amount":number,"unit":string}],"instructions":[string]}]}
Rules:
- Fill EVERY empty slot in slotCaps exactly once (one object per date+mealType).
- title: short dish name. ingredients: concrete amounts (g/ml/db/ek/tk). instructions: 3–8 short steps.
- prepMinutes+cookMinutes MUST be <= maxMinutes for that slot (+5 ok).
- Vary dishes across the week; leftovers ok for consecutive dinners if noted in description.
${kcalRuleEn}
${pantryRuleEn}
${dietRuleEn}
${seasonalEn}
- No medical claims. Prefer the response language: English.`
      : `Te a VitaScan étkezésterv-séfje vagy.
TALÁLJ KI teljes, reális recepteket az üres slotokra. NE a felhasználó saját receptjeiből válassz — a világ hétköznapi konyhája alapján inventálj.
CSAK JSON:
{"slots":[{"date":"YYYY-MM-DD","mealType":"BREAKFAST|LUNCH|DINNER","title":string,"description":string,"servings":number,"prepMinutes":number,"cookMinutes":number,"kcal":number,"dietTags":["GLUTEN_FREE"|"DAIRY_FREE"|"VEGAN"],"ingredients":[{"name":string,"amount":number,"unit":string}],"instructions":[string]}]}
Szabályok:
- Töltsd ki a slotCaps MINDEN üres slotját pontosan egyszer (egy objektum date+mealType-onként).
- title: rövid ételnév. ingredients: konkrét mennyiségek (g/ml/db/ek/tk). instructions: 3–8 rövid lépés.
- prepMinutes+cookMinutes <= maxMinutes (+5 ok).
- Variáld a hetet; maradék vacsora egymás utáni napokon oké, ha a descriptionben jelzed.
${kcalRuleHu}
${pantryRuleHu}
${dietRuleHu}
${seasonalHu}
- Nincs orvosi állítás. A válasz nyelve: magyar.`;

  const userText = [
    payload.locale === 'en' ? 'Context (JSON):' : 'Kontextus (JSON):',
    JSON.stringify({
      weekStart: payload.weekStart,
      dates: payload.dates,
      meals: payload.meals,
      slotCaps: payload.slotCaps,
      diet: payload.diet,
      matchKcal: payload.matchKcal,
      seasonal: payload.seasonal,
      month: payload.month,
      dailyKcalGoal: payload.dailyKcalGoal,
      usePantry: payload.usePantry,
      pantry: payload.usePantry ? payload.pantry.slice(0, 40) : [],
    }),
    payload.locale === 'en'
      ? 'Invent recipes for all empty slots. Return ONLY the slots JSON.'
      : 'Találj ki receptet minden üres slotra. Csak a slots JSON.',
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
          temperature: 0.7,
          maxOutputTokens: 8192,
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
      const slots = parseInvented(text, meals, dates);
      if (slots.length > 0) return slots;
      lastError = payload.locale === 'en' ? 'AI returned no usable recipes.' : 'Az AI nem adott használható receptet.';
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
    }
  }

  throw Object.assign(new Error(lastError), { statusCode: 502 });
}
