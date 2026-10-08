import { useEffect, useState } from 'react';
import { signedUrl } from '../lib/upload';

interface Props {
  objectKey: string;
  alt: string;
  className?: string;
}

/** Affiche une image stockée (clé objet S3) via une URL signée à durée limitée (NF8). */
export function SignedImage({ objectKey, alt, className }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    signedUrl(objectKey)
      .then((u) => active && setUrl(u))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [objectKey]);

  if (failed) return null;
  if (!url) return <div className={`animate-pulse bg-slate-200 ${className ?? ''}`} />;
  return <img src={url} alt={alt} className={className} onError={() => setFailed(true)} />;
}
