/**
 * Gemini: tipikus 1 egység (db/adag/ek) gramm-súlyának precíz becslése
 * a megadott /100g makrók alapján (manuális termékfelvitel).
 */

import { geminiModelChain } from '../../utils/geminiModels';

export const SERVING_UNITS = ['g', 'db', 'adag', 'ek', 'szelet'] as const;
export type ServingUnit = (typeof SERVING_UNITS)[number];

export type ServingEstimateInput = {
  locale: 'hu' | 'en';
  name: string;
  brand?: string;
  unit: ServingUnit;
  /** Macros per 100g — required for manual-add estimate */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
};

export type ServingEstimateResult = {
  gramsPerUnit: number;
};

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    gramsPerUnit: { type: 'NUMBER' },
  },
  required: ['gramsPerUnit'],
};

function buildGenerationConfig(model: string): Record<string, unknown> {
  const isGemini3 = /gemini-3/i.test(model);
  const base: Record<string, unknown> = {
    temperature: 0.1,
    maxOutputTokens: 256,
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

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function unitLabel(unit: ServingUnit, locale: 'hu' | 'en') {
  if (locale === 'en') {
    if (unit === 'db') return 'piece (pc)';
    if (unit === 'adag') return 'serving';
    if (unit === 'ek') return 'tablespoon';
    if (unit === 'szelet') return 'slice';
    return 'gram';
  }
  if (unit === 'db') return 'darab (db)';
  if (unit === 'adag') return 'adag';
  if (unit === 'ek') return 'evőkanál (ek)';
  if (unit === 'szelet') return 'szelet';
  return 'gramm';
}

function systemPrompt(locale: 'hu' | 'en') {
  if (locale === 'en') {
    return `You are VitaScan's food portion weight expert for MANUAL food entry.
Estimate the edible / ready-to-eat weight in grams of ONE unit of a food.
Return ONLY JSON: { "gramsPerUnit": number }.

Critical: nutrition values provided are PER 100g. Use them as the primary signal together with the food name.
- Infer a realistic gramsPerUnit for 1 unit that fits this food identity AND is consistent with the given per-100g macros (energy density, protein/fat richness, etc.).
- Example checks: very high fat+kcal/100g → dense item (oil tbsp ~13–14g); egg-like macros → ~50–58g/pc; banana-like → ~110–120g peeled.
- Prefer edible / prepared weight when that is how people eat it.
- Consider brand or variety when provided.
- Avoid lazy round defaults like exactly 100g when macros+name imply a better value.
- If uncertain, pick the most probable typical value — no extreme outliers.
- gramsPerUnit must be > 0 and usually between 1 and 2000.`;
  }
  return `Te a VitaScan étel-adag súly szakértője vagy MANUÁLIS termékfelvitelnél.
Becslés: EGY egység ehető / fogyasztásra kész súlya grammban.
Csak JSON: { "gramsPerUnit": number }.

Fontos: a megadott tápanyagok 100 g-ra vonatkoznak. Elsődlegesen ezekből + a névből dolgozz.
- Olyan gramsPerUnit-ot adj 1 egységre, ami illik az ételhez ÉS összhangban van a /100g makrókkal (energiasűrűség, fehérje/zsír stb.).
- Példa: nagyon magas zsír+kcal/100g → sűrű (olaj ek ~13–14 g); tojásszerű → ~50–58 g/db; banánszerű → ~110–120 g hámozva.
- Ha így fogyasztják: ehető / előkészített súly.
- Márka / fajta figyelembevétele, ha megvan.
- Kerüld a lusta kerek 100 g defaultot, ha a makrók+név jobb értéket sejtet.
- Bizonytalanság esetén a legvalószínűbb tipikus érték — ne extrém outlier.
- gramsPerUnit > 0, tipikusan 1–2000 között.`;
}

function extractJsonText(body: any): string {
  const parts = body?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) throw new Error('empty');
  let text = '';
  for (const p of parts) {
    if (typeof p?.text === 'string') text += p.text;
  }
  text = text.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  return text;
}

function parseResult(raw: any): ServingEstimateResult | null {
  const n = Number(raw?.gramsPerUnit);
  if (!Number.isFinite(n) || n <= 0) return null;
  const grams = round1(Math.min(2000, Math.max(0.1, n)));
  return { gramsPerUnit: grams };
}

async function callGemini(
  apiKey: string,
  model: string,
  input: ServingEstimateInput,
): Promise<ServingEstimateResult | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const u = unitLabel(input.unit, input.locale);
  const brandPart = input.brand?.trim()
    ? input.locale === 'en'
      ? ` Brand: ${input.brand.trim()}.`
      : ` Márka: ${input.brand.trim()}.`
    : '';
  const fiberPart =
    input.fiber != null
      ? input.locale === 'en'
        ? ` fiber ${input.fiber}g`
        : ` rost ${input.fiber}g`
      : '';
  const sugarPart =
    input.sugar != null
      ? input.locale === 'en'
        ? ` sugar ${input.sugar}g`
        : ` cukor ${input.sugar}g`
      : '';
  const macrosPart =
    input.locale === 'en'
      ? ` Per 100g macros: ${input.kcal} kcal, protein ${input.protein}g, carbs ${input.carbs}g, fat ${input.fat}g${fiberPart}${sugarPart}.`
      : ` 100g-ra makrók: ${input.kcal} kcal, fehérje ${input.protein}g, szénhidrát ${input.carbs}g, zsír ${input.fat}g${fiberPart}${sugarPart}.`;
  const userText =
    input.locale === 'en'
      ? `Food name: ${input.name}.${brandPart}${macrosPart} Unit: 1 ${u}. Estimate precise gramsPerUnit for one unit primarily from these per-100g macros + name. JSON only.`
      : `Étel neve: ${input.name}.${brandPart}${macrosPart} Egység: 1 ${u}. Becsüld meg precízen a gramsPerUnit-ot egy egységre, elsősorban ezekből a /100g makrókból + névből. Csak JSON.`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(input.locale) }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: buildGenerationConfig(model),
    }),
    signal: AbortSignal.timeout(30000),
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

export async function estimateServingWithGemini(
  input: ServingEstimateInput,
): Promise<ServingEstimateResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw Object.assign(new Error('Gemini API kulcs nincs beállítva.'), { statusCode: 503 });
  }
  if (input.unit === 'g') {
    throw Object.assign(new Error('Gramm egységhez nincs szükség becslésre.'), { statusCode: 400 });
  }
  if (!input.name.trim()) {
    throw Object.assign(new Error('Hiányzik a termék neve.'), { statusCode: 400 });
  }
  for (const [key, n] of [
    ['kcal', input.kcal],
    ['protein', input.protein],
    ['carbs', input.carbs],
    ['fat', input.fat],
  ] as const) {
    if (!Number.isFinite(n) || n < 0) {
      throw Object.assign(
        new Error(
          input.locale === 'en'
            ? `Missing or invalid macro: ${key}`
            : `Hiányzó vagy hibás makró: ${key}`,
        ),
        { statusCode: 400 },
      );
    }
  }

  const models = geminiModelChain();

  let result = await callGemini(apiKey, models[0], input);
  for (let i = 1; i < models.length && !result; i += 1) {
    result = await callGemini(apiKey, models[i], input);
  }

  if (!result) {
    throw Object.assign(
      new Error(
        input.locale === 'en'
          ? 'Could not estimate serving weight. Try again or enter grams manually.'
          : 'Nem sikerült megbecsülni az adag súlyát. Próbáld újra, vagy add meg manuálisan grammban.',
      ),
      { statusCode: 502 },
    );
  }

  return result;
}
