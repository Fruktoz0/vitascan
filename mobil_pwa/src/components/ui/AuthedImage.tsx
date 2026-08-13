import { useEffect, useState } from 'react';
import { recipesApi } from '../../services/api';

type Props = {
  recipeId?: string;
  tempKey?: string;
  alt: string;
  className?: string;
};

export default function AuthedImage({ recipeId, tempKey, alt, className }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    const load = async () => {
      try {
        const blob = recipeId
          ? await recipesApi.getImageBlob(recipeId)
          : tempKey
            ? await recipesApi.getTempImageBlob(tempKey)
            : null;
        if (!blob || cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setUrl(null);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [recipeId, tempKey]);

  if (!url) return <div className={className} aria-hidden />;
  return <img src={url} alt={alt} className={className} />;
}
