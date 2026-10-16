import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FilePurpose } from '@bailo/shared';
import { uploadFile } from '../lib/upload';
import { CheckIcon } from './icons';

interface Props {
  purpose: FilePurpose;
  label: string;
  /** Clé objet déposée (ou null après retrait). */
  onUploaded: (key: string | null) => void;
  accept?: string;
}

/**
 * Champ de dépôt de fichier : envoie le fichier via une URL signée dès la sélection et
 * remonte la clé objet. Mobile d'abord : un simple bouton qui ouvre l'appareil photo/galerie.
 */
export function FileField({ purpose, label, onUploaded, accept = 'image/*' }: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [name, setName] = useState('');

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setState('busy');
    setName(file.name);
    try {
      const key = await uploadFile(file, purpose);
      onUploaded(key);
      setState('done');
    } catch {
      onUploaded(null);
      setState('error');
    }
  };

  const clear = () => {
    onUploaded(null);
    setName('');
    setState('idle');
    if (ref.current) ref.current.value = '';
  };

  return (
    <div className="text-sm">
      <span className="mb-1 block">{label}</span>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="rounded border border-slate-300 px-3 py-2"
        >
          {state === 'busy' ? t('file.uploading') : t('file.choose')}
        </button>
        {state === 'done' && (
          <span className="flex items-center gap-1 text-emerald-700">
            <CheckIcon className="h-4 w-4" /> {name}
            <button type="button" onClick={clear} className="text-slate-400 underline">
              {t('file.remove')}
            </button>
          </span>
        )}
        {state === 'error' && <span className="text-rose-600">{t('file.error')}</span>}
      </div>
    </div>
  );
}
