export type RecipeSourceType =
  | 'MANUAL'
  | 'IMAGE'
  | 'VIDEO'
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'TIKTOK'
  | 'YOUTUBE'
  | 'WEB';

export type RecipeStatus = 'PENDING' | 'PUBLISHED' | 'REJECTED';

export type RecipeCategory =
  | 'BREAKFAST'
  | 'LUNCH'
  | 'DINNER'
  | 'SNACK'
  | 'DESSERT'
  | 'OTHER';

export type RecipeDraftIngredient = {
  name: string;
  amount?: number | null;
  unit?: string | null;
  amountG?: number | null;
  sortOrder?: number;
};

export type RecipeDraft = {
  title: string;
  description?: string | null;
  servings: number;
  category?: RecipeCategory | null;
  ingredients: RecipeDraftIngredient[];
  instructions: string[];
  sourceUrl?: string | null;
  sourceExternalId?: string | null;
  sourceType: RecipeSourceType;
};

export type StoredRecipeImage = {
  storageKey: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
};

export function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}
