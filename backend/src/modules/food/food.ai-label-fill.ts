/**
 * Gemini: termékcímke / adatlap fotóból űrlap-kitöltés (per 100g).
 * A képet NEM tároljuk — csak a requestben megy a Geminihez.
 */
import { geminiModelChain } from '../../utils/geminiModels';

export type LabelFillResult = {
  name: string;
  brand?: string;
  barcode?: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  isApproximate: boolean;
  approximateNote?: string;
};

export type LabelFillInput = {
  locale: 'hu' | 'en';
  imageBase64: string;
  mimeType?: string;
};

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    brand: { type: 'STRING' },
    barcode: { type: 'STRING' },
    kcal: { type: 'NUMBER' },
    protein: { type: 'NUMBER' },
    carbs: { type: 'NUMBER' },
    fat: { type: 'NUMBER' },
    fiber: { type: 'NUMBER' },
    sugar: { type: 'NUMBER' },
    isApproximate: { type: 'BOOLEAN' },
    approximateNote: { type: 'STRING' },
  },
  required: ['name', 'kcal', 'protein', 'carbs', 'fat', 'isApproximate'],
};

function buildGenerationConfig(model: string): Record<string, unknown> {
  const isGemini3 = /gemini-3/i.test(model);
  const base: Record<string, unknown> = {
    temperature: 0.15,
    maxOutputTokens: 2048,
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
    return `You are VitaScan's product-label reader.
Read a food packaging / nutrition label photo and fill a single food form.
Return ONLY JSON matching the schema.
Rules:
- All macros (kcal, protein, carbs, fat, fiber, sugar) are PER 100g (or convert from per-serving / per-ml if the label shows that).
- name: product name as readable on the pack (short).
- brand and barcode: fill ONLY when clearly readable on the packaging. If not 100% sure, leave empty strings — NEVER guess or invent brand or barcode.
- fiber and sugar: optional; fill only if readable or confidently convertible to per 100g.
- isApproximate: false when the nutrition table and product identity are clearly readable; true when you must estimate because amount/brand/label is incomplete or unclear.
- approximateNote: if isApproximate is true, ONE short sentence only (e.g. "Values are estimates — exact amount or brand is not clear on the label."). If isApproximate is false, leave approximateNote empty. Do NOT list individual missing macros.`;
  }
  return `Te a VitaScan termékcímke-olvasója vagy.
Olvasd le a csomagolás / tápérték adatlap fotóját, és tölts ki egyetlen étel űrlapot.
CSAK a sémának megfelelő JSON-t adj vissza.
Szabályok:
- Minden makró (kcal, protein, carbs, fat, fiber, sugar) 100g-ra vonatkozik (ha adagra / ml-re van, számold át 100g-ra).
- name: a terméknév a csomagolásról (röviden).
- brand és barcode: CSAK akkor töltsd ki, ha egyértelműen olvasható. Ha nem vagy 100%-ig biztos, hagyd üres stringnek — SOHA ne tippelj / inventálj márkát vagy vonalkódot.
- fiber és sugar: opcionális; csak ha olvasható vagy biztosan átszámolható 100g-ra.
- isApproximate: false, ha a tápértéktábla és a termékazonosítás egyértelműen olvasható; true, ha becsülni kell, mert a mennyiség/márka/címke hiányos vagy homályos.
- approximateNote: ha isApproximate true, EGY rövid mondat (pl. „Az adatok becsültek — a címkén nincs pontos mennyiség vagy márka.”). Ha false, hagyd üresen. NE sorold fel a hiányzó makrókat.`;
}

function parseResult(raw: unknown, locale: 'hu' | 'en'): LabelFillResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const name = String(o.name ?? '').trim();
  const kcal = Number(o.kcal);
  const protein = Number(o.protein);
  const carbs = Number(o.carbs);
  const fat = Number(o.fat);
  if (!name || name.length < 1) return null;
  if (![kcal, protein, carbs, fat].every((n) => Number.isFinite(n) && n >= 0)) return null;

  const fiber = o.fiber != null ? Number(o.fiber) : undefined;
  const sugar = o.sugar != null ? Number(o.sugar) : undefined;
  const brand = cleanOptionalLabel(o.brand, 80);
  const barcode = cleanOptionalLabel(o.barcode, 30);
  const isApproximate = Boolean(o.isApproximate);

  let approximateNote: string | undefined;
  if (isApproximate) {
    const note = String(o.approximateNote ?? '').trim().slice(0, 160);
    approximateNote =
      note ||
      (locale === 'en'
        ? 'Values are estimates — exact amount or brand is not clear on the label.'
        : 'Az adatok becsültek — a címkén nincs pontos mennyiség vagy márka.');
  }

  return {
    name: name.slice(0, 120),
    ...(brand ? { brand } : {}),
    ...(barcode ? { barcode } : {}),
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
    isApproximate,
    ...(approximateNote ? { approximateNote } : {}),
  };
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
  input: LabelFillInput,
): Promise<LabelFillResult | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const mime = (input.mimeType || 'image/jpeg').split(';')[0].trim() || 'image/jpeg';
  const data = input.imageBase64.replace(/^data:[^;]+;base64,/, '');
  const userParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { inlineData: { mimeType: mime, data } },
    {
      text:
        input.locale === 'en'
          ? 'Read this product label / nutrition panel. Fill per-100g macros. Brand/barcode only if clearly readable. Return JSON only.'
          : 'Olvasd le ezt a termékcímkét / tápértéktáblát. Töltsd ki a 100g-os makrókat. Márka/vonalkód csak ha egyértelműen olvasható. Csak JSON.',
    },
  ];

  // Two models are tried in sequence, so keep each call short enough that the
  // whole request still finishes before a proxy/tunnel drops the connection.
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(input.locale) }] },
        contents: [{ role: 'user', parts: userParts }],
        generationConfig: buildGenerationConfig(model),
      }),
      signal: AbortSignal.timeout(28_000),
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  if (!body) return null;

  try {
    const text = extractJsonText(body);
    return parseResult(JSON.parse(text), input.locale);
  } catch {
    return null;
  }
}

export async function fillFoodLabelWithGemini(input: LabelFillInput): Promise<LabelFillResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw Object.assign(new Error('Gemini API kulcs nincs beállítva.'), { statusCode: 503 });
  }
  if (!input.imageBase64) {
    throw Object.assign(new Error('Hiányzik a kép.'), { statusCode: 400 });
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
          ? 'Could not read the label. Try a clearer photo of the nutrition panel.'
          : 'Nem sikerült leolvasni a címkét. Próbálj élesebb fotót a tápértéktábláról.',
      ),
      { statusCode: 502 },
    );
  }

  return result;
}
