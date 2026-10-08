import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { API } from '../lib/api';
import { formatFcfa } from '../lib/format';

interface Verification {
  authentic: boolean;
  receiptNumber?: string;
  amount?: number;
  date?: string;
}

/** Page publique de vérification d'un reçu (QR). Aucune donnée personnelle (F6.4). */
export function Verify() {
  const { id } = useParams();
  const [data, setData] = useState<Verification | null>(null);

  useEffect(() => {
    fetch(`${API}/receipts/verify/${id}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ authentic: false }));
  }, [id]);

  if (!data) return <div className="p-8 text-center text-slate-500">…</div>;

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center p-8 text-center">
      {data.authentic ? (
        <>
          <div className="text-5xl">✅</div>
          <h1 className="mt-3 text-xl font-bold text-emerald-700">Reçu authentique</h1>
          <p className="mt-2 text-sm text-slate-600">N° {data.receiptNumber}</p>
          <p className="text-sm text-slate-600">
            {data.amount !== undefined ? formatFcfa(data.amount) : ''} · {data.date}
          </p>
        </>
      ) : (
        <>
          <div className="text-5xl">❌</div>
          <h1 className="mt-3 text-xl font-bold text-red-700">Reçu non reconnu</h1>
        </>
      )}
      <p className="mt-6 text-xs text-slate-400">CitéGest — vérification de reçu</p>
    </div>
  );
}
