export type MealTypeKey = 'BREAKFAST' | 'TIZORAI' | 'LUNCH' | 'UZSONNA' | 'DINNER' | 'SNACK';

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
  if (!obj.summary || typeof obj.summary !== 'object') return null;

  const meals: StructuredDailyAnalysis['meals'] = [];
  const seen = new Set<string>();

  if (Array.isArray(obj.meals)) {
    for (const item of obj.meals) {
      if (!item || typeof item !== 'object') continue;
      const m = item as Record<string, unknown>;
      const mealType = String(m.mealType || '');
      if (!MEAL_ORDER.includes(mealType as MealTypeKey)) continue;
      const statusRaw = String(m.status || 'evaluated');
      // Skip empty-meal placeholders from older analyses
      if (statusRaw === 'empty_ok' || statusRaw === 'empty_missed') continue;
      if (seen.has(mealType)) continue;
      seen.add(mealType);
      meals.push({
        mealType: mealType as MealTypeKey,
        status: 'evaluated',
        positives: asStringArray(m.positives, 2),
        negatives: asStringArray(m.negatives, 2),
      });
    }

    meals.sort(
      (a, b) => MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType),
    );
  }

  const summary = obj.summary as Record<string, unknown>;
  return {
    meals,
    summary: {
      positives: asStringArray(summary.positives, 4),
      negatives: asStringArray(summary.negatives, 4),
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
