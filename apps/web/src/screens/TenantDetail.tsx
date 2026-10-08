import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { signedUrl } from '../lib/upload';
import { SignedImage } from '../components/SignedImage';

interface Guarantor {
  id: string;
  name: string;
  phone: string | null;
  relationship: string | null;
  isPrimaryPayer: boolean;
}
interface Occupancy {
  id: string;
  status: 'ACTIVE' | 'NOTICE' | 'CLOSED';
  startDate: string;
  unit: { code: string };
}
interface Tenant {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  occupation: string | null;
  photoKey: string | null;
  idDocKey: string | null;
  idDocType: string | null;
  idDocNumber: string | null;
  guarantors: Guarantor[];
  occupancies: Occupancy[];
}

export function TenantDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [tenant, setTenant] = useState<Tenant | null>(null);

  useEffect(() => {
    api
      .get<Tenant>(`/tenants/${id}`)
      .then(setTenant)
      .catch(() => setTenant(null));
  }, [id]);

  if (!tenant) return <p className="text-slate-500">{t('common.loading')}</p>;

  const statusLabel = (s: Occupancy['status']) =>
    s === 'ACTIVE' ? t('tenant.active') : s === 'NOTICE' ? t('tenant.notice') : t('tenant.closed');

  const openIdDoc = async () => {
    if (!tenant.idDocKey) return;
    try {
      window.open(await signedUrl(tenant.idDocKey), '_blank', 'noopener');
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        {tenant.photoKey && (
          <SignedImage
            objectKey={tenant.photoKey}
            alt={tenant.name}
            className="h-16 w-16 flex-none rounded-full object-cover"
          />
        )}
        <div>
          <h1 className="text-xl font-bold">{tenant.name}</h1>
          <p className="text-sm text-slate-500">
            {tenant.phone} {tenant.whatsapp ? `· WhatsApp ${tenant.whatsapp}` : ''}
            {tenant.occupation ? ` · ${tenant.occupation}` : ''}
          </p>
          {(tenant.idDocType || tenant.idDocNumber || tenant.idDocKey) && (
            <p className="mt-1 text-sm text-slate-500">
              {tenant.idDocType ?? t('tenant.idDoc')}
              {tenant.idDocNumber ? ` · ${tenant.idDocNumber}` : ''}
              {tenant.idDocKey && (
                <button onClick={openIdDoc} className="ml-2 text-brand underline">
                  {t('tenant.viewIdDoc')}
                </button>
              )}
            </p>
          )}
        </div>
      </div>

      <section>
        <h2 className="mb-1 font-semibold">{t('tenant.guarantors')}</h2>
        {tenant.guarantors.length === 0 ? (
          <p className="text-sm text-slate-400">—</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg bg-white shadow-sm">
            {tenant.guarantors.map((g) => (
              <li key={g.id} className="p-3 text-sm">
                {g.name} {g.relationship ? `(${g.relationship})` : ''} · {g.phone}
                {g.isPrimaryPayer && (
                  <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                    {t('tenant.primaryPayer')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 font-semibold">{t('tenant.occupations')}</h2>
        <ul className="divide-y divide-slate-100 rounded-lg bg-white shadow-sm">
          {tenant.occupancies.map((o) => (
            <li key={o.id} className="flex items-center justify-between p-3 text-sm">
              <span>
                {o.unit.code} · {formatDate(o.startDate)} · {statusLabel(o.status)}
              </span>
              {o.status !== 'CLOSED' && (
                <span className="flex gap-2">
                  <Link
                    to={`/collect?occupancyId=${o.id}&room=${o.unit.code}`}
                    className="text-brand"
                  >
                    {t('nav.collect')}
                  </Link>
                  <Link to={`/checkout?occupancyId=${o.id}`} className="text-red-600">
                    {t('tenant.checkout')}
                  </Link>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
