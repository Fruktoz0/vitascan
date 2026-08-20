/**
 * Gemini: rövid AI testelemzés legfrissebb mérések + személyes adatok alapján.
 */
import { geminiModelChain } from '../../utils/geminiModels';

export type BodyAnalysisResult = {
  headline: string;
  summary: string;
  positives: string[];
  concerns: string[];
  suggestions: string[];
};

export type BodyAnalysisInput = {
  locale: 'hu' | 'en';
  profile: {
    gender?: string | null;
    birthYear?: number | null;
    heightCm?: number | null;
    weightKg?: number | null;
    activityLevel?: string | null;
    goal?: string | null;
  };
  measurements: Array<{ bodyPart: string; valueCm: number; loggedDate: string }>;
  goals: Array<{ bodyPart: string; goalCm: number }>;
};

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: { type: 'STRING' },
    summary: { type: 'STRING' },
    positives: { type: 'ARRAY', items: { type: 'STRING' } },
    concerns: { type: 'ARRAY', items: { type: 'STRING' } },
    suggestions: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['headline', 'summary', 'positives', 'concerns', 'suggestions'],
};

function buildGenerationConfig(model: string): Record<string, unknown> {
  const isGemini3 = /gemini-3/i.test(model);
  const base: Record<string, unknown> = {
    temperature: 0.35,
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

function systemPrompt(locale: 'hu' | 'en') {
  if (locale === 'en') {
    return `You are VitaScan's body-composition coach.
Given the user's latest circumference measurements (cm), optional goals, and personal profile, write a SHORT body analysis.
Return ONLY JSON matching the schema.
Rules:
- headline: max ~8 words
- summary: 1–2 short sentences (body fat / shape impression — not a medical diagnosis)
- positives: max 3 short bullets
- concerns: max 3 short bullets (only if justified by data)
- suggestions: max 3 concrete tips (movement, consistency, measurement habits, calorie/macro direction if profile goal suggests it)
- No medical diagnoses. Be encouraging and practical.
- English only.`;
  }
  return `Te a VitaScan testösszetétel-edzője vagy.
A felhasználó legfrissebb körfogat-mérései (cm), opcionális céljai és személyes adatai alapján írj RÖVID testelemzést.
CSAK a sémának megfelelő JSON.
Szabályok:
- headline: max ~8 szó
- summary: 1–2 rövid mondat (testzsír / alak benyomás — nem orvosi diagnózis)
- positives: max 3 rövid bullet
- concerns: max 3 rövid bullet (csak ha indokolt)
- suggestions: max 3 konkrét tipp (mozgás, következetesség, mérési szokások, kalória/makró irány ha a cél indokolja)
- Nincs orvosi diagnózis. Bátorító és gyakorlati hangnem.
- Csak magyarul.`;
}

function clampList(arr: unknown, max: number): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
    .slice(0, max);
}

function parseResult(raw: unknown): BodyAnalysisResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const headline = String(o.headline ?? '').trim();
  const summary = String(o.summary ?? '').trim();
  if (!headline || !summary) return null;
  return {
    headline: headline.slice(0, 80),
    summary: summary.slice(0, 400),
    positives: clampList(o.positives, 3),
    concerns: clampList(o.concerns, 3),
    suggestions: clampList(o.suggestions, 3),
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
  input: BodyAnalysisInput,
): Promise<BodyAnalysisResult | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const userText = [
    input.locale === 'en' ? 'Context (JSON):' : 'Kontextus (JSON):',
    JSON.stringify(
      {
        profile: input.profile,
        latestMeasurementsCm: input.measurements,
        goalsCm: input.goals,
      },
      null,
      2,
    ),
  ].join('\n');

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
    return parseResult(JSON.parse(extractJsonText(body)));
  } catch {
    return null;
  }
}

export async function generateBodyAnalysisWithGemini(
  input: BodyAnalysisInput,
): Promise<BodyAnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw Object.assign(new Error('Gemini API kulcs nincs beállítva.'), { statusCode: 503 });
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
          ? 'Body analysis failed. Try again later.'
          : 'A testelemzés sikertelen. Próbáld később.',
      ),
      { statusCode: 502 },
    );
  }
  return result;
}
