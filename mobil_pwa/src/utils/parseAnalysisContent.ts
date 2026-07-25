export type MealTypeKey = 'BREAKFAST' | 'TIZORAI' | 'LUNCH' | 'UZSONNA' | 'DINNER' | 'SNACK';

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

export type ParsedAnalysisContent =
  | { kind: 'structured'; data: StructuredDailyAnalysis }
  | { kind: 'plain'; text: string };

const MEAL_ORDER: MealTypeKey[] = ['BREAKFAST', 'TIZORAI', 'LUNCH', 'UZSONNA', 'DINNER', 'SNACK'];

function asStringArray(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((s) => s.trim())
    .slice(0, max);
}

function normalize(raw: unknown): StructuredDailyAnalysis | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.meals) || !obj.summary || typeof obj.summary !== 'object') return null;

  const byType = new Map<string, StructuredDailyAnalysis['meals'][number]>();
  for (const item of obj.meals) {
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

  const summary = obj.summary as Record<string, unknown>;
  return {
    meals: MEAL_ORDER.map(
      (mealType) =>
        byType.get(mealType) ?? {
          mealType,
          status: 'empty_ok' as const,
          positives: [],
          negatives: [],
        },
    ),
    summary: {
      positives: asStringArray(summary.positives, 3),
      negatives: asStringArray(summary.negatives, 3),
    },
    suggestions: asStringArray(obj.suggestions, 3),
  };
}

/** Parse DB content: structured JSON or legacy plain text. */
export function parseAnalysisContent(content: string | null | undefined): ParsedAnalysisContent | null {
  if (!content?.trim()) return null;
  const trimmed = content.trim();
  try {
    let cleaned = trimmed;
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    }
    if (cleaned.startsWith('{')) {
      const data = normalize(JSON.parse(cleaned));
      if (data) return { kind: 'structured', data };
    }
  } catch {
    // fall through to plain
  }
  return { kind: 'plain', text: trimmed };
}
