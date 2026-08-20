/**
 * Ordered Gemini model fallback chain used across the whole project.
 * Tries the primary first, then each fallback when a model is unavailable
 * or rate-limited. Every tier can be overridden via environment variables.
 */
export function geminiModelChain(): string[] {
  const chain = [
    process.env.GEMINI_MODEL?.trim() || 'gemini-3.7-flash',
    process.env.GEMINI_FALLBACK_MODEL?.trim() || 'gemini-3.6-flash',
    process.env.GEMINI_FALLBACK_MODEL_2?.trim() || 'gemini-3.5-flash',
    process.env.GEMINI_FALLBACK_MODEL_3?.trim() || 'gemini-3.5-flash-lite',
  ];
  return chain.filter((m, i, arr) => !!m && arr.indexOf(m) === i);
}
