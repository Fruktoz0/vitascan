import { RecipeDraftSchema, normalizeDietTags } from './recipes.schema';
import { httpError, type RecipeDraft } from './recipes.types';
import { geminiModelChain } from '../../utils/geminiModels';

const ATTEMPT_TIMEOUT_MS = 28_000;
const TOTAL_BUDGET_MS = 55_000;
const MAX_INGREDIENTS = 40;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    description: { type: 'STRING' },
    servings: { type: 'INTEGER' },
    category: { type: 'STRING' },
    dietTags: { type: 'ARRAY', items: { type: 'STRING' } },
    ingredients: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          amount: { type: 'NUMBER' },
          unit: { type: 'STRING' },
        },
        required: ['name'],
      },
    },
    instructions: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['title', 'ingredients', 'instructions'],
};

type GenConfig = Record<string, unknown>;

function withThinking(model: string, config: GenConfig): GenConfig {
  if (/gemini-3/i.test(model)) {
    return { ...config, thinkingConfig: { thinkingLevel: 'low' } };
  }
  if (/gemini-2\.5-flash/i.test(model) && !/pro/i.test(model)) {
    return { ...config, thinkingConfig: { thinkingBudget: 0 } };
  }
  return config;
}

function buildAttemptConfigs(model: string): GenConfig[] {
  return [
    withThinking(model, {
      temperature: 0.2,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    }),
    withThinking(model, {
      temperature: 0.2,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    }),
    { temperature: 0.2, maxOutputTokens: 8192, responseMimeType: 'application/json' },
  ];
}

function systemPrompt(locale: 'hu' | 'en') {
  if (locale === 'en') {
    return `You extract structured cooking recipes from a photo (cookbook page, screenshot, handwritten card, or dish photo with visible text).
Return ONLY JSON matching the schema.
Rules:
- title: short recipe name.
- description: 1-2 sentences, or empty string if unknown.
- servings: integer number of portions if stated, otherwise 2.
- category: one of BREAKFAST, LUNCH, DINNER, SNACK, DESSERT, OTHER.
- dietTags: subset of GLUTEN_FREE, DAIRY_FREE, VEGAN that apply to the finished dish. Only include a tag if you are confident from the ingredients. Wheat/flour/barley/rye/couscous/breadcrumbs → not GLUTEN_FREE. Milk/cheese/butter/cream/yogurt → not DAIRY_FREE. Meat/fish/egg/honey/dairy → not VEGAN. If unsure, omit the tag.
- ingredients: name plus numeric amount and unit when visible (g, kg, ml, ek, tk, db, cup). If amount is unreadable, omit amount/unit rather than inventing.
- instructions: ordered cooking steps. If none are visible, return an empty array.
- Do not invent nutrition values.
- Max ${MAX_INGREDIENTS} ingredients.
- Prefer the language of the source text; if mixed, use Hungarian.`;
  }
  return `Receptet nyersz ki egy fotóból (szakácskönyv, screenshot, kézzel írt kártya, vagy szöveges receptkép).
Csak a sémának megfelelő JSON-t adj vissza.
Szabályok:
- title: rövid receptnév.
- description: 1-2 mondat, vagy üres string ha nincs.
- servings: adagok száma ha látszik, különben 2.
- category: BREAKFAST, LUNCH, DINNER, SNACK, DESSERT vagy OTHER.
- dietTags: a kész ételre igaz jelzők a következők közül: GLUTEN_FREE, DAIRY_FREE, VEGAN. Csak akkor tedd be, ha a hozzávalókból magabiztosan következik. Búza/liszt/árpa/rozs/zsemlemorzsa → nem GLUTEN_FREE. Tej/sajt/vaj/tejszín/joghurt → nem DAIRY_FREE. Hús/hal/tojás/méz/tejtermék → nem VEGAN. Ha bizonytalan, hagyd ki.
- ingredients: név, és ha látszik, szám + mértékegység (g, kg, ml, ek, tk, db). Ha a mennyiség nem olvasható, hagyd ki — ne találj ki.
- instructions: sorrendezett elkészítési lépések. Ha nincs szöveg, üres tömb.
- Ne találj ki tápértéket.
- Max ${MAX_INGREDIENTS} hozzávaló.
- A forrás nyelvét kövesd; kevert szövegnél magyar.`;
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

function parseMaybeTruncatedJson(text: string): unknown | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  const src = text.slice(start);
  try {
    return JSON.parse(src);
  } catch {
    /* repair */
  }
  const end = src.lastIndexOf('}');
  if (end > 0) {
    try {
      return JSON.parse(src.slice(0, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function coerceDraft(raw: unknown, sourceType: RecipeDraft['sourceType'] = 'IMAGE'): RecipeDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const title = String(o.title ?? '').trim();
  if (!title) return null;

  const catRaw = String(o.category ?? '').trim().toUpperCase();
  const category = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'DESSERT', 'OTHER'].includes(catRaw)
    ? (catRaw as RecipeDraft['category'])
    : undefined;

  const dietFromArray = normalizeDietTags(o.dietTags ?? o.diet_tags);
  const dietTags = [...dietFromArray];
  const truthy = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1';
  if (truthy(o.glutenFree) || truthy(o.gluten_free)) {
    if (!dietTags.includes('GLUTEN_FREE')) dietTags.push('GLUTEN_FREE');
  }
  if (truthy(o.dairyFree) || truthy(o.dairy_free) || truthy(o.lactoseFree)) {
    if (!dietTags.includes('DAIRY_FREE')) dietTags.push('DAIRY_FREE');
  }
  if (truthy(o.vegan)) {
    if (!dietTags.includes('VEGAN')) dietTags.push('VEGAN');
  }

  const ingredientsIn = Array.isArray(o.ingredients) ? o.ingredients : [];
  const ingredients = ingredientsIn.slice(0, MAX_INGREDIENTS).flatMap((item, idx) => {
    if (!item || typeof item !== 'object') return [];
    const r = item as Record<string, unknown>;
    const name = String(r.name ?? '').trim();
    if (!name) return [];
    const amountNum = r.amount != null ? Number(r.amount) : NaN;
    const unit = String(r.unit ?? '').trim().slice(0, 24);
    return [
      {
        name: name.slice(0, 160),
        amount: Number.isFinite(amountNum) && amountNum >= 0 ? amountNum : null,
        unit: unit || null,
        sortOrder: idx,
      },
    ];
  });

  const stepsIn = Array.isArray(o.instructions) ? o.instructions : [];
  const instructions = stepsIn
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
    .slice(0, 40);

  const servingsNum = Number(o.servings);
  const parsed = RecipeDraftSchema.safeParse({
    title: title.slice(0, 160),
    description: String(o.description ?? '').trim().slice(0, 2000) || null,
    servings: Number.isFinite(servingsNum) && servingsNum >= 1 ? Math.round(servingsNum) : 2,
    category: category ?? null,
    dietTags,
    ingredients,
    instructions,
    sourceType,
  });
  return parsed.success ? (parsed.data as RecipeDraft) : null;
}

type FailureKind = 'timeout' | 'network' | 'rate' | 'image' | 'config' | 'http' | 'empty' | 'parse';
type Failure = { kind: FailureKind; detail: string };

async function callGeminiOnce(
  apiKey: string,
  model: string,
  imageBase64: string,
  mimeType: string,
  locale: 'hu' | 'en',
  generationConfig: GenConfig,
  timeoutMs: number,
): Promise<{ result?: RecipeDraft; failure?: Failure }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(locale) }] },
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: imageBase64 } },
              {
                text:
                  locale === 'en'
                    ? 'Extract the recipe from this image. Return JSON only.'
                    : 'Nyerd ki a receptet erről a képről. Csak JSON.',
              },
            ],
          },
        ],
        generationConfig,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return { failure: { kind: 'timeout', detail: `${model}: timeout` } };
    }
    return { failure: { kind: 'network', detail: `${model}: ${err instanceof Error ? err.message : String(err)}` } };
  }

  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    const msg = errBody?.error?.message || `HTTP ${res.status}`;
    if (res.status === 429 || /quota|resource exhausted|rate limit/i.test(msg)) {
      return { failure: { kind: 'rate', detail: `${model}: ${msg}` } };
    }
    if (/image|mime|unsupported|media/i.test(msg)) {
      return { failure: { kind: 'image', detail: `${model}: ${msg}` } };
    }
    if (/invalid argument|unknown name|thinking|schema|responseMimeType|not supported/i.test(msg)) {
      return { failure: { kind: 'config', detail: `${model}: ${msg}` } };
    }
    return { failure: { kind: 'http', detail: `${model}: HTTP ${res.status} ${msg}` } };
  }

  const body = (await res.json().catch(() => null)) as any;
  if (!body) return { failure: { kind: 'parse', detail: `${model}: non-JSON` } };
  if (body?.promptFeedback?.blockReason) {
    return { failure: { kind: 'image', detail: `${model}: blocked` } };
  }
  const text = extractJsonText(body);
  if (!text) return { failure: { kind: 'empty', detail: `${model}: empty` } };
  const parsed = parseMaybeTruncatedJson(text);
  const result = parsed ? coerceDraft(parsed, 'IMAGE') : null;
  if (!result) return { failure: { kind: 'parse', detail: `${model}: unusable JSON` } };
  return { result };
}

function failureToError(failure: Failure | null, locale: 'hu' | 'en'): Error {
  const en = locale === 'en';
  switch (failure?.kind) {
    case 'timeout':
      return httpError(504, en ? 'Recognition timed out. Try a smaller photo.' : 'A felismerés időtúllépés miatt megszakadt. Próbálj kisebb képet.');
    case 'rate':
      return httpError(429, en ? 'The recognition service is busy. Try again shortly.' : 'A felismerő szolgáltatás most túlterhelt. Próbáld később.');
    case 'image':
      return httpError(400, en ? 'This photo could not be processed.' : 'Ez a fotó nem dolgozható fel.');
    default:
      return httpError(502, en ? 'Could not extract a recipe from this photo.' : 'Nem sikerült receptet kinyerni a képből.');
  }
}

export async function extractRecipeFromImage(opts: {
  imageBase64: string;
  mimeType: string;
  locale: 'hu' | 'en';
}): Promise<RecipeDraft> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw httpError(503, 'Gemini API kulcs nincs beállítva.');

  const models = geminiModelChain();

  const startedAt = Date.now();
  let lastFailure: Failure | null = null;

  for (const model of models) {
    for (const generationConfig of buildAttemptConfigs(model)) {
      const left = TOTAL_BUDGET_MS - (Date.now() - startedAt);
      if (left < 6_000) throw failureToError(lastFailure ?? { kind: 'timeout', detail: 'budget' }, opts.locale);
      const outcome = await callGeminiOnce(
        apiKey,
        model,
        opts.imageBase64,
        opts.mimeType,
        opts.locale,
        generationConfig,
        Math.min(ATTEMPT_TIMEOUT_MS, left),
      );
      if (outcome.result) return outcome.result;
      lastFailure = outcome.failure ?? lastFailure;
      if (outcome.failure?.kind === 'rate') break;
    }
  }

  throw failureToError(lastFailure, opts.locale);
}

async function generateRecipeFromParts(
  parts: unknown[],
  locale: 'hu' | 'en',
  sourceType: RecipeDraft['sourceType'],
  system = systemPrompt(locale),
  budgetMs = TOTAL_BUDGET_MS,
): Promise<RecipeDraft> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw httpError(503, 'Gemini API kulcs nincs beállítva.');
  const models = geminiModelChain();
  const startedAt = Date.now();
  let lastFailure: Failure | null = null;

  for (const model of models) {
    for (const generationConfig of buildAttemptConfigs(model)) {
      const left = budgetMs - (Date.now() - startedAt);
      if (left < 6_000) throw failureToError(lastFailure ?? { kind: 'timeout', detail: 'budget' }, locale);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts }],
            generationConfig,
          }),
          signal: AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS, left)),
        });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          const msg = errBody?.error?.message || `HTTP ${res.status}`;
          if (res.status === 429 || /quota|rate limit/i.test(msg)) {
            lastFailure = { kind: 'rate', detail: msg };
            break;
          }
          lastFailure = { kind: 'http', detail: msg };
          continue;
        }
        const body = (await res.json().catch(() => null)) as any;
        const text = extractJsonText(body);
        const parsed = text ? parseMaybeTruncatedJson(text) : null;
        const result = parsed ? coerceDraft(parsed, sourceType) : null;
        if (result) return result;
        lastFailure = { kind: 'parse', detail: 'unusable JSON' };
      } catch (err) {
        const name = err instanceof Error ? err.name : '';
        lastFailure = name === 'TimeoutError' || name === 'AbortError'
          ? { kind: 'timeout', detail: 'timeout' }
          : { kind: 'network', detail: err instanceof Error ? err.message : String(err) };
      }
    }
  }
  throw failureToError(lastFailure, locale);
}

export async function extractRecipeFromText(opts: {
  text: string;
  locale: 'hu' | 'en';
  sourceType: RecipeDraft['sourceType'];
}): Promise<RecipeDraft> {
  const prompt =
    opts.locale === 'en'
      ? 'Extract a structured recipe from this page/caption text. Return JSON only.\n\n'
      : 'Nyerd ki a strukturált receptet ebből a szövegből. Csak JSON.\n\n';
  return generateRecipeFromParts(
    [{ text: prompt + opts.text.slice(0, 12000) }],
    opts.locale,
    opts.sourceType,
  );
}

export async function extractRecipeFromFileUri(opts: {
  fileUri: string;
  mimeType: string;
  locale: 'hu' | 'en';
}): Promise<RecipeDraft> {
  const prompt =
    opts.locale === 'en'
      ? 'Extract the recipe spoken or shown in this video. Return JSON only.'
      : 'Nyerd ki a receptet ebből a videóból (beszéd és/vagy felirat). Csak JSON.';
  return generateRecipeFromParts(
    [{ fileData: { fileUri: opts.fileUri, mimeType: opts.mimeType } }, { text: prompt }],
    opts.locale,
    'VIDEO',
    systemPrompt(opts.locale),
    90_000,
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function uploadGeminiFile(
  buf: Buffer,
  mimeType: string,
  displayName: string,
): Promise<{ uri: string; name: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw httpError(503, 'Gemini API kulcs nincs beállítva.');

  const start = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(buf.length),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  const session = start.headers.get('x-goog-upload-url');
  if (!start.ok || !session) {
    throw httpError(502, 'A videó feltöltése a felismerőhöz sikertelen.');
  }

  const put = await fetch(session, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
      'Content-Length': String(buf.length),
      'Content-Type': mimeType,
    },
    body: new Uint8Array(buf),
    signal: AbortSignal.timeout(120_000),
  });
  const json = (await put.json().catch(() => null)) as {
    file?: { uri?: string; name?: string; state?: string };
  } | null;
  let name = json?.file?.name;
  let uri = json?.file?.uri;
  if (!put.ok || !name || !uri) {
    throw httpError(502, 'A videó feltöltése a felismerőhöz sikertelen.');
  }

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const st = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${name}?key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    const body = (await st.json().catch(() => null)) as { uri?: string; name?: string; state?: string } | null;
    const state = body?.state;
    if (state === 'ACTIVE') {
      return { uri: body?.uri || uri, name: body?.name || name };
    }
    if (state === 'FAILED') {
      throw httpError(400, 'A videó feldolgozása sikertelen. Próbálj rövidebb fájlt.');
    }
    await sleep(2000);
  }
  throw httpError(504, 'A videó feldolgozása túl sokáig tartott.');
}

export async function deleteGeminiFile(name: string): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || !name) return;
  await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${name}?key=${encodeURIComponent(apiKey)}`,
    { method: 'DELETE', signal: AbortSignal.timeout(10_000) },
  ).catch(() => undefined);
}
