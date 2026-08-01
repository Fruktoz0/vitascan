/**
 * Gemini: étel / étkezés felismerés fotóból vagy szövegből.
 * A képet NEM tároljuk — csak a requestben megy a Geminihez.
 */

export type RecognizedIngredient = {
  name: string;
  amountG: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  brand?: string;
  barcode?: string;
  /** Default logging unit: g | db | adag | ek */
  servingUnit?: string;
  /** Grams equal to 1 servingUnit */
  servingSize?: number;
};

export type FoodRecognizeResult = {
  dishName: string;
  ingredients: RecognizedIngredient[];
};

export type FoodRecognizeInput = {
  locale: 'hu' | 'en';
  mode: 'photo' | 'text';
  text?: string;
  imageBase64?: string;
  mimeType?: string;
};

const MAX_INGREDIENTS = 20;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    dishName: { type: 'STRING' },
    ingredients: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          amountG: { type: 'NUMBER' },
          kcal: { type: 'NUMBER' },
          protein: { type: 'NUMBER' },
          carbs: { type: 'NUMBER' },
          fat: { type: 'NUMBER' },
          fiber: { type: 'NUMBER' },
          sugar: { type: 'NUMBER' },
          brand: { type: 'STRING' },
          barcode: { type: 'STRING' },
          servingUnit: { type: 'STRING' },
          servingSize: { type: 'NUMBER' },
        },
        required: ['name', 'amountG', 'kcal', 'protein', 'carbs', 'fat', 'servingUnit', 'servingSize'],
      },
    },
  },
  required: ['dishName', 'ingredients'],
};

function buildGenerationConfig(model: string): Record<string, unknown> {
  const isGemini3 = /gemini-3/i.test(model);
  const base: Record<string, unknown> = {
    temperature: 0.2,
    maxOutputTokens: 4096,
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

function cleanOptionalLabel(raw: unknown, maxLen: number): string | undefined {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  const lower = s.toLowerCase();
  if (
    lower === 'unknown' ||
    lower === 'n/a' ||
    lower === 'na' ||
    lower === 'none' ||
    lower === 'null' ||
    lower === 'undefined' ||
    lower === 'ismeretlen' ||
    lower === 'nincs'
  ) {
    return undefined;
  }
  return s.slice(0, maxLen);
}

function systemPrompt(locale: 'hu' | 'en') {
  if (locale === 'en') {
    return `You are VitaScan's nutrition estimator.
Identify foods / meal ingredients from a photo or text description.
Return ONLY JSON matching the schema.
Rules:
- Split into realistic ingredients (not one vague "meal" row) when possible.
- amountG = estimated grams for that ingredient portion shown/described.
- kcal, protein, carbs, fat are TOTAL for that amount (not per 100g).
- fiber and sugar optional totals for that amount.
- brand and barcode are optional per ingredient. Fill them ONLY when clearly visible on packaging / stated in the text. If not clearly identifiable, leave brand and barcode as empty strings — NEVER guess or invent them.
- servingUnit: one of "g", "db" (piece), "adag" (serving), "ek" (tablespoon), "szelet" (slice) — the most natural default unit for logging this food later.
- servingSize: grams equal to ONE unit of servingUnit (precise typical edible weight). If servingUnit is "g", set servingSize to a sensible default portion in grams (often same as amountG or 100).
- Example: banana → servingUnit "db", servingSize ~118; egg → "db" ~55; oil → "ek" ~14; bread → "szelet" ~30–40; yogurt cup → "adag" or "g".
- For macros: if uncertain, still give a best estimate with reasonable portions.
- Max ${MAX_INGREDIENTS} ingredients.
- dishName: short meal title.`;
  }
  return `Te a VitaScan tápanyag-becslője vagy.
Azonosítsd az ételeket / hozzávalókat fotóból vagy szöveges leírásból.
Csak a sémának megfelelő JSON-t adj vissza.
Szabályok:
- Ha lehet, bontsd realisztikus hozzávalókra (ne egy vagus „étel” sor).
- amountG = becsült gramm az adott hozzávaló látható/leírt adagjára.
- kcal, protein, carbs, fat = ÖSSZESEN erre a mennyiségre (nem 100g-ra).
- fiber és sugar opcionális összesen ugyanarra a mennyiségre.
- brand és barcode opcionális. Csak ha egyértelműen látszik / szerepel. Ha nem, üres string — SOHA ne találj ki.
- servingUnit: "g", "db", "adag", "ek" vagy "szelet" — a legtermészetesebb alap egység későbbi naplózáshoz.
- servingSize: EGY servingUnit gramm-egyenértéke (precíz tipikus ehető súly). Ha servingUnit "g", a servingSize legyen ésszerű alap adag grammban (gyakran amountG vagy 100).
- Példa: banán → servingUnit "db", servingSize ~118; tojás → "db" ~55; olaj → "ek" ~14; kenyér → "szelet" ~30–40; joghurt → "adag" vagy "g".
- Makróknál bizonytalanság esetén is adj legjobb becslést.
- Max ${MAX_INGREDIENTS} hozzávaló.
- dishName: rövid ételcím.`;
}

function parseResult(raw: unknown): FoodRecognizeResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const dishName = String(o.dishName ?? '').trim();
  if (!dishName || !Array.isArray(o.ingredients)) return null;

  const ingredients: RecognizedIngredient[] = [];
  for (const item of o.ingredients.slice(0, MAX_INGREDIENTS)) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const name = String(r.name ?? '').trim();
    const amountG = Number(r.amountG);
    const kcal = Number(r.kcal);
    const protein = Number(r.protein);
    const carbs = Number(r.carbs);
    const fat = Number(r.fat);
    if (!name || name.length < 1) continue;
    if (![amountG, kcal, protein, carbs, fat].every((n) => Number.isFinite(n) && n >= 0)) continue;
    const fiber = r.fiber != null ? Number(r.fiber) : undefined;
    const sugar = r.sugar != null ? Number(r.sugar) : undefined;
    const brand = cleanOptionalLabel(r.brand, 80);
    const barcode = cleanOptionalLabel(r.barcode, 30);
    const unitRaw = String(r.servingUnit ?? 'g').trim().toLowerCase();
    const servingUnit = ['g', 'db', 'adag', 'ek', 'szelet'].includes(unitRaw) ? unitRaw : 'g';
    let servingSize = Number(r.servingSize);
    if (!Number.isFinite(servingSize) || servingSize <= 0) {
      servingSize = servingUnit === 'g' ? amountG : amountG;
    }
    ingredients.push({
      name: name.slice(0, 120),
      amountG: round1(clamp(amountG, 1, 5000)),
      kcal: round1(clamp(kcal, 0, 10000)),
      protein: round1(clamp(protein, 0, 1000)),
      carbs: round1(clamp(carbs, 0, 1000)),
      fat: round1(clamp(fat, 0, 1000)),
      ...(Number.isFinite(fiber) && (fiber as number) >= 0
        ? { fiber: round1(clamp(fiber as number, 0, 1000)) }
        : {}),
      ...(Number.isFinite(sugar) && (sugar as number) >= 0
        ? { sugar: round1(clamp(sugar as number, 0, 1000)) }
        : {}),
      ...(brand ? { brand } : {}),
      ...(barcode ? { barcode } : {}),
      servingUnit,
      servingSize: round1(clamp(servingSize, 0.1, 2000)),
    });
  }

  if (!ingredients.length) return null;
  return { dishName: dishName.slice(0, 120), ingredients };
}

function extractJsonText(body: any): string {
  const parts: Array<{ text?: string; thought?: boolean }> =
    body?.candidates?.[0]?.content?.parts || [];
  let text = parts
    .filter((p) => !p.thought)
    .map((p) => p.text || '')
    .join('')
    .trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  return text;
}

async function callGemini(
  apiKey: string,
  model: string,
  input: FoodRecognizeInput,
): Promise<FoodRecognizeResult | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const userParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  if (input.mode === 'photo' && input.imageBase64) {
    const mime = (input.mimeType || 'image/jpeg').split(';')[0].trim() || 'image/jpeg';
    const data = input.imageBase64.replace(/^data:[^;]+;base64,/, '');
    userParts.push({ inlineData: { mimeType: mime, data } });
    userParts.push({
      text:
        input.locale === 'en'
          ? 'Estimate ingredients and macros for this meal photo. Include brand/barcode only if clearly readable. Return JSON only.'
          : 'Becslés: hozzávalók és makrók erről az ételfotóról. Brand/vonalkód csak ha egyértelműen olvasható. Csak JSON.',
    });
  } else {
    userParts.push({
      text:
        (input.locale === 'en'
          ? 'Estimate ingredients and macros for this meal description. Include brand/barcode only if explicitly stated:\n'
          : 'Becslés: hozzávalók és makrók ehhez a leíráshoz. Brand/vonalkód csak ha egyértelműen szerepel:\n') +
        (input.text || ''),
    });
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(input.locale) }] },
      contents: [{ role: 'user', parts: userParts }],
      generationConfig: buildGenerationConfig(model),
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  if (!body) return null;

  try {
    const text = extractJsonText(body);
    return parseResult(JSON.parse(text));
  } catch {
    return null;
  }
}

export async function recognizeFoodWithGemini(
  input: FoodRecognizeInput,
): Promise<FoodRecognizeResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw Object.assign(new Error('Gemini API kulcs nincs beállítva.'), { statusCode: 503 });
  }

  if (input.mode === 'text' && !String(input.text || '').trim()) {
    throw Object.assign(new Error('Adj meg egy szöveges leírást.'), { statusCode: 400 });
  }
  if (input.mode === 'photo' && !input.imageBase64) {
    throw Object.assign(new Error('Hiányzik a kép.'), { statusCode: 400 });
  }

  const primary = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
  const fallback = process.env.GEMINI_FALLBACK_MODEL?.trim() || 'gemini-2.0-flash';

  let result = await callGemini(apiKey, primary, input);
  if (!result && fallback && fallback !== primary) {
    result = await callGemini(apiKey, fallback, input);
  }

  if (!result) {
    throw Object.assign(
      new Error(
        input.locale === 'en'
          ? 'Could not recognize the food. Try another photo or a clearer description.'
          : 'Nem sikerült felismerni az ételt. Próbálj másik képet vagy pontosabb leírást.',
      ),
      { statusCode: 502 },
    );
  }

  return result;
}
