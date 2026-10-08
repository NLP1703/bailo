import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { formatFcfa } from '../lib/format';
import { FileField } from '../components/FileField';

interface Site {
  id: string;
  name: string;
}
interface Unit {
  id: string;
  code: string;
  baseRent: number;
  manualStatus: string;
  activeOccupancyId: string | null;
}

export function NewEntry() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState('');
  const [units, setUnits] = useState<Unit[]>([]);
  const [unit, setUnit] = useState<Unit | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [idDocType, setIdDocType] = useState('');
  const [idDocNumber, setIdDocNumber] = useState('');
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [idDocKey, setIdDocKey] = useState<string | null>(null);

  const [rent, setRent] = useState(0);
  const [deposit, setDeposit] = useState(0);
  const [dueDay, setDueDay] = useState(1);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [advanceMonths, setAdvanceMonths] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get<Site[]>('/sites').then((s) => {
      setSites(s);
      if (s[0]) setSiteId(s[0].id);
    });
  }, []);

  useEffect(() => {
    if (!siteId) return;
    api
      .get<Unit[]>(`/units?siteId=${siteId}`)
      .then((u) =>
        setUnits(u.filter((x) => !x.activeOccupancyId && x.manualStatus === 'AVAILABLE')),
      );
  }, [siteId]);

  const chooseUnit = (u: Unit) => {
    setUnit(u);
    setRent(u.baseRent);
    setDeposit(u.baseRent);
    setStep(2);
  };

  const total = deposit + advanceMonths * rent;

  const submit = async () => {
    if (!unit) return;
    setBusy(true);
    setMessage('');
    try {
      const tenant = await api.post<{ id: string }>('/tenants', {
        name,
        phone: phone || undefined,
        idDocType: idDocType || undefined,
        idDocNumber: idDocNumber || undefined,
        ...(photoKey ? { photoKey } : {}),
        ...(idDocKey ? { idDocKey } : {}),
      });
      const res = await api.post<{ openingPayment?: { payment: { receiptNumber: string } } }>(
        '/occupancies',
        {
          unitId: unit.id,
          tenantId: tenant.id,
          startDate,
          monthlyRent: rent,
          dueDay,
          deposit,
          advance: advanceMonths > 0 ? { months: advanceMonths } : undefined,
          paymentMode: 'ESPECES',
        },
      );
      const number = res.openingPayment?.payment.receiptNumber ?? '';
      setMessage(t('newEntry.success', { number }));
      setTimeout(() => navigate('/rooms'), 1200);
    } catch {
      setMessage('Erreur');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t('newEntry.title')}</h1>

      {step === 1 && (
        <div className="space-y-3">
          <p className="font-semibold text-slate-600">{t('newEntry.step1')}</p>
          <select
            className="w-full rounded border border-slate-300 px-3 py-2"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-2">
            {units.map((u) => (
              <button
                key={u.id}
                onClick={() => chooseUnit(u)}
                className="rounded bg-slate-200 py-3 text-sm font-semibold"
              >
                {u.code}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="font-semibold text-slate-600">{t('newEntry.step2')}</p>
          <input
            className="w-full rounded border border-slate-300 px-3 py-2"
            placeholder={t('newEntry.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-full rounded border border-slate-300 px-3 py-2"
            placeholder={t('login.phone')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <div className="flex gap-2">
            <input
              className="flex-1 rounded border border-slate-300 px-3 py-2"
              placeholder={t('newEntry.idDocType')}
              value={idDocType}
              onChange={(e) => setIdDocType(e.target.value)}
            />
            <input
              className="flex-1 rounded border border-slate-300 px-3 py-2"
              placeholder={t('newEntry.idDocNumber')}
              value={idDocNumber}
              onChange={(e) => setIdDocNumber(e.target.value)}
            />
          </div>
          <FileField purpose="tenant-photo" label={t('newEntry.photo')} onUploaded={setPhotoKey} />
          <FileField
            purpose="tenant-id"
            label={t('newEntry.idDoc')}
            accept="image/*,application/pdf"
            onUploaded={setIdDocKey}
          />
          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="rounded bg-slate-200 px-4 py-2">
              {t('newEntry.back')}
            </button>
            <button
              disabled={name.length < 2}
              onClick={() => setStep(3)}
              className="rounded bg-brand px-4 py-2 text-white disabled:opacity-50"
            >
              {t('newEntry.next')}
            </button>
          </div>
        </div>
      )}

      {step === 3 && unit && (
        <div className="space-y-3">
          <p className="font-semibold text-slate-600">
            {t('newEntry.step3')} · {unit.code}
          </p>
          <Field label={t('newEntry.rent')} value={rent} onChange={setRent} />
          <Field label={t('newEntry.deposit')} value={deposit} onChange={setDeposit} />
          <Field label={t('newEntry.dueDay')} value={dueDay} onChange={setDueDay} />
          <Field
            label={t('newEntry.advanceMonths')}
            value={advanceMonths}
            onChange={setAdvanceMonths}
          />
          <label className="block text-sm">
            {t('newEntry.startDate')}
            <input
              type="date"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <div className="rounded-lg bg-white p-3 text-sm shadow-sm">
            {t('newEntry.total')} : <span className="font-bold">{formatFcfa(total)}</span>
          </div>
          {message && (
            <p className="rounded bg-emerald-50 p-2 text-sm text-emerald-700">{message}</p>
          )}
          <div className="flex gap-2">
            <button onClick={() => setStep(2)} className="rounded bg-slate-200 px-4 py-2">
              {t('newEntry.back')}
            </button>
            <button
              disabled={busy}
              onClick={submit}
              className="flex-1 rounded bg-brand py-2 font-semibold text-white disabled:opacity-50"
            >
              {t('newEntry.submit')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        inputMode="numeric"
        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        value={value}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '')) || 0)}
      />
    </label>
  );
}
