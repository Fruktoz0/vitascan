const raw = import.meta.env.VITE_API_URL?.trim();
/** Same-origin `/api` (nginx / Cloudflare) vagy abszolút URL env-ből. */
export const API_BASE = (raw || '/api').replace(/\/$/, '');
