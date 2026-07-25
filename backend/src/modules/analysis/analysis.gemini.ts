const SYSTEM_PROMPT_HU = `Te egy tapasztalt táplálkozási szakértő vagy a VitaScan appban.
Feladat: értékeld a felhasználó aznapi étkezését a napló és az alapadatok alapján.
Szabályok:
- Magyarul válaszolj.
- Legyen rövid és tömör: max 2–3 rövid bekezdés VAGY max ~120–150 szó.
- 1) rövid értékelés (mi volt jó / mi hiányzik), 2) egy konkrét, kivitelezhető javaslat holnapra/későbbre.
- Ne inventálj olyan adatot, ami nincs a bemenetben.
- Ne adj orvosi diagnózist; általános táplálkozási tanács.
- Kerüld a felsorolás-spamet és a marketing hangnemet.`;

const SYSTEM_PROMPT_EN = `You are an experienced nutrition expert in the VitaScan app.
Task: evaluate the user's meals for the day based on their food log and profile.
Rules:
- Reply in English.
- Keep it short and concise: max 2–3 short paragraphs OR ~120–150 words.
- 1) brief assessment (what was good / what is missing), 2) one concrete, actionable suggestion.
- Do not invent data that is not in the input.
- Do not give medical diagnoses; general nutrition advice only.
- Avoid bullet-spam and marketing tone.`;

export type GeminiUserPayload = {
  locale: 'hu' | 'en';
  profile: {
    gender?: string | null;
    birthYear?: number | null;
    heightCm?: number | null;
    weightKg?: number | null;
    activityLevel?: string | null;
    goal?: string | null;
    dailyKcalGoal?: number | null;
  };
  date: string;
  totals: { kcal: number; protein: number; carbs: number; fat: number };
  meals: Record<string, Array<{
    foodName: string;
    amount: number;
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
  }>>;
};

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
  ].join('\n');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 400,
      },
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      body?.error?.message ||
      (payload.locale === 'en'
        ? 'Gemini request failed.'
        : 'A Gemini kérés sikertelen.');
    throw Object.assign(new Error(msg), { statusCode: 502 });
  }

  const text =
    body?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || '')
      .join('')
      .trim() || '';

  if (!text) {
    throw Object.assign(
      new Error(payload.locale === 'en' ? 'Empty AI response.' : 'Üres AI válasz.'),
      { statusCode: 502 },
    );
  }

  return text;
}
