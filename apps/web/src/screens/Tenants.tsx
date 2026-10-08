import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

interface Tenant {
  id: string;
  name: string;
  phone: string | null;
}

export function Tenants() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Tenant[]>([]);

  useEffect(() => {
    const id = setTimeout(() => {
      api
        .get<Tenant[]>(`/tenants${q ? `?q=${encodeURIComponent(q)}` : ''}`)
        .then(setRows)
        .catch(() => setRows([]));
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('tenants.title')}</h1>
        <Link to="/new-entry" className="rounded bg-brand px-3 py-1 text-sm text-white">
          {t('tenants.add')}
        </Link>
      </div>
      <input
        className="w-full rounded border border-slate-300 px-3 py-2"
        placeholder={t('tenants.search')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {rows.length === 0 ? (
        <p className="text-slate-500">{t('tenants.empty')}</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg bg-white shadow-sm">
          {rows.map((tn) => (
            <li key={tn.id}>
              <Link to={`/tenants/${tn.id}`} className="flex items-center justify-between p-3">
                <span>{tn.name}</span>
                <span className="text-sm text-slate-500">{tn.phone ?? ''}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
