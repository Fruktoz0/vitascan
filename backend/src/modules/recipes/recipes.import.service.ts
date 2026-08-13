import type { RecipeDraft, RecipeSourceType } from './recipes.types';
import { extractRecipeFromText } from './recipes.ai.service';
import { saveTempRecipeImage } from './recipes.image.service';
import { httpError } from './recipes.types';
import { parsePublicHttpUrl, ssrfFetch, stripTrackingParams } from './recipes.ssrf';

export type UrlImportResult = {
  draft: RecipeDraft;
  tempImageKey?: string;
  needsFallback: boolean;
  usedAi: boolean;
  sourceType: RecipeSourceType;
  sourceExternalId: string | null;
  sourceUrl: string;
};

function detectSource(url: URL): RecipeSourceType {
  const h = url.hostname.replace(/^www\./, '').toLowerCase();
  if (h === 'facebook.com' || h === 'fb.com' || h === 'fb.watch' || h.endsWith('.facebook.com')) return 'FACEBOOK';
  if (h === 'instagram.com' || h.endsWith('.instagram.com')) return 'INSTAGRAM';
  if (h === 'tiktok.com' || h.endsWith('.tiktok.com') || h === 'vm.tiktok.com') return 'TIKTOK';
  if (h === 'youtube.com' || h === 'youtu.be' || h.endsWith('.youtube.com')) return 'YOUTUBE';
  return 'WEB';
}

export function extractExternalId(url: URL, source: RecipeSourceType): string | null {
  const path = url.pathname;
  if (source === 'YOUTUBE') {
    if (url.hostname.includes('youtu.be')) return path.replace(/^\//, '') || null;
    return url.searchParams.get('v');
  }
  if (source === 'TIKTOK') {
    const m = path.match(/\/video\/(\d+)/);
    return m?.[1] ?? null;
  }
  if (source === 'INSTAGRAM') {
    const m = path.match(/\/(reel|p|tv)\/([^/]+)/);
    return m?.[2] ?? null;
  }
  if (source === 'FACEBOOK') {
    const m = path.match(/\/(reel|videos|share\/v)\/([^/]+)/) || path.match(/\/posts\/([^/]+)/);
    return m?.[2] ?? m?.[1] ?? url.searchParams.get('v');
  }
  return null;
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function og(html: string, prop: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i');
  const m = html.match(re) || html.match(re2);
  return m ? decodeEntities(m[1]).trim() : null;
}

function parseJsonLdRecipe(html: string): Partial<RecipeDraft> | null {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    try {
      const json = JSON.parse(block[1]);
      const nodes = Array.isArray(json) ? json : json['@graph'] ? json['@graph'] : [json];
      const rec = nodes.find((n: any) => {
        const t = n?.['@type'];
        return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
      });
      if (!rec) continue;
      const ings: string[] = Array.isArray(rec.recipeIngredient) ? rec.recipeIngredient : [];
      const instrRaw = rec.recipeInstructions;
      let instructions: string[] = [];
      if (typeof instrRaw === 'string') instructions = [instrRaw];
      else if (Array.isArray(instrRaw)) {
        instructions = instrRaw.map((s: any) => (typeof s === 'string' ? s : s?.text || '')).filter(Boolean);
      }
      const yieldRaw = rec.recipeYield ?? rec.yield;
      const servings = Number(String(yieldRaw ?? '').match(/\d+/)?.[0] ?? 2);
      return {
        title: String(rec.name ?? '').trim(),
        description: typeof rec.description === 'string' ? rec.description : '',
        servings: Number.isFinite(servings) && servings >= 1 ? servings : 2,
        ingredients: ings.map((line, i) => ({ name: String(line).slice(0, 160), sortOrder: i })),
        instructions,
        sourceType: 'WEB',
      };
    } catch {
      /* next block */
    }
  }
  return null;
}

function looksLikeRecipe(text: string): boolean {
  const t = text.toLowerCase();
  const hits = ['ingredient', 'hozzávaló', 'hozzaval', 'tbsp', 'evőkanál', 'recipe', 'recept', 'minutes', 'perc', 'előmelegít', 'preheat'].filter((k) =>
    t.includes(k),
  );
  return hits.length >= 2 || t.length > 400;
}

async function fetchOEmbed(source: RecipeSourceType, url: string): Promise<{ title?: string; author?: string; html?: string; thumbnail?: string } | null> {
  const endpoints: Partial<Record<RecipeSourceType, string>> = {
    YOUTUBE: `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
    TIKTOK: `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
    INSTAGRAM: `https://api.instagram.com/oembed?url=${encodeURIComponent(url)}`,
  };
  const ep = endpoints[source];
  if (!ep) return null;
  try {
    const got = await ssrfFetch(ep);
    const json = JSON.parse(got.body.toString('utf8'));
    return {
      title: json.title,
      author: json.author_name,
      html: json.html,
      thumbnail: json.thumbnail_url,
    };
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function importRecipeFromUrl(
  userId: string,
  rawUrl: string,
  locale: 'hu' | 'en',
): Promise<UrlImportResult> {
  const parsed = parsePublicHttpUrl(rawUrl);
  const sourceType = detectSource(parsed);
  const sourceUrl = stripTrackingParams(parsed.toString());
  const sourceExternalId = extractExternalId(parsed, sourceType) || null;

  let title = '';
  let description = '';
  let thumb: string | null = null;
  let pageText = '';
  let jsonLd: Partial<RecipeDraft> | null = null;

  if (sourceType === 'WEB') {
    const page = await ssrfFetch(sourceUrl);
    const html = page.body.toString('utf8');
    jsonLd = parseJsonLdRecipe(html);
    title = jsonLd?.title || og(html, 'og:title') || '';
    description = jsonLd?.description || og(html, 'og:description') || '';
    thumb = og(html, 'og:image');
    pageText = stripHtml(html).slice(0, 8000);
  } else {
    const oembed = await fetchOEmbed(sourceType, sourceUrl);
    title = oembed?.title || '';
    description = oembed?.author ? `${oembed.author}` : '';
    thumb = oembed?.thumbnail || null;
    try {
      const page = await ssrfFetch(sourceUrl);
      const html = page.body.toString('utf8');
      title = title || og(html, 'og:title') || '';
      description = [description, og(html, 'og:description')].filter(Boolean).join('\n');
      thumb = thumb || og(html, 'og:image');
      pageText = stripHtml(html).slice(0, 8000);
    } catch {
      /* social page fetch often blocked */
    }
  }

  const blob = [title, description, pageText].filter(Boolean).join('\n\n');
  const enough = Boolean(jsonLd?.ingredients?.length) || looksLikeRecipe(blob);

  let draft: RecipeDraft;
  let needsFallback = false;
  let usedAi = false;
  if (jsonLd?.title && (jsonLd.ingredients?.length || jsonLd.instructions?.length)) {
    try {
      draft = await extractRecipeFromText({
        text: JSON.stringify(jsonLd),
        locale,
        sourceType,
      });
      usedAi = true;
    } catch {
      draft = {
        title: jsonLd.title || title || 'Recept',
        description: jsonLd.description || description,
        servings: jsonLd.servings || 2,
        ingredients: jsonLd.ingredients || [],
        instructions: jsonLd.instructions || [],
        sourceType,
        sourceUrl,
      };
    }
  } else if (enough) {
    draft = await extractRecipeFromText({ text: blob, locale, sourceType });
    usedAi = true;
  } else {
    needsFallback = true;
    draft = {
      title: title || 'Recept',
      description: description || '',
      servings: 2,
      ingredients: [],
      instructions: [],
      sourceType,
      sourceUrl,
    };
  }
  draft.sourceUrl = sourceUrl;
  draft.sourceType = sourceType;
  draft.sourceExternalId = sourceExternalId;

  let tempImageKey: string | undefined;
  if (thumb) {
    try {
      const img = await ssrfFetch(thumb);
      if (/^image\//i.test(img.contentType) || img.body.length > 100) {
        const stored = await saveTempRecipeImage(userId, img.body);
        tempImageKey = stored.storageKey;
      }
    } catch {
      /* thumbnail optional */
    }
  }

  if (!draft.title) throw httpError(422, 'Nem sikerült receptet kinyerni ebből a linkből.');

  return { draft, tempImageKey, needsFallback, usedAi, sourceType, sourceExternalId, sourceUrl };
}
