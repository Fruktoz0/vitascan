import { useEffect, useState } from 'react';
import { recipesApi } from '../../services/api';

type Props = {
  recipeId?: string;
  tempKey?: string;
  alt: string;
  className?: string;
  revision?: number | string | null;
};

export default function AuthedImage({ recipeId, tempKey, alt, className, revision }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const cacheKey = revision == null || revision === 0 ? undefined : revision;

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    const load = async () => {
      try {
        const blob = recipeId
          ? await recipesApi.getImageBlob(recipeId, cacheKey)
          : tempKey
            ? await recipesApi.getTempImageBlob(tempKey)
            : null;
        if (!blob || cancelled) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setUrl(objectUrl);
      } catch {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        if (!cancelled) setUrl(null);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [recipeId, tempKey, cacheKey]);

  if (!url) return <div className={className} aria-hidden />;
  return <img src={url} alt={alt} className={className} />;
}
