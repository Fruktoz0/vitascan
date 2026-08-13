const KEY = 'vitascan.recipeDraft';

export type RecipeDraftSession = {
  draft: import('../services/api').RecipeDraft;
  tempImageKey?: string;
  recipeId?: string;
};

export function saveRecipeDraftSession(data: RecipeDraftSession) {
  sessionStorage.setItem(KEY, JSON.stringify(data));
}

export function readRecipeDraftSession(): RecipeDraftSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RecipeDraftSession;
  } catch {
    return null;
  }
}

export function clearRecipeDraftSession() {
  sessionStorage.removeItem(KEY);
}
