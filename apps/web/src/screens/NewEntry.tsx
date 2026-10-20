import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PAYMENT_MODES, generateRentSchedule, type PaymentMode } from '@bailo/shared';
import { api, API, ApiError } from '../lib/api';
import { formatFcfa } from '../lib/format';
import { FileField } from '../components/FileField';
import { useToast } from '../components/Toast';
import { PageHeader, Card, Input, NativeSelect, Button, Label, EmptyState } from '../components/ui';
import { DoorIcon, CheckCircleIcon } from '../components/icons';

/** Progression du parcours en 3 étapes (Chambre → Locataire → Conditions).
 *  Mobile : barre linéaire fine + libellé de l'étape courante en gros (lisible
 *  d'un coup d'œil, moins de bruit visuel que trois ronds numérotés).
 *  Bureau : ronds numérotés + barre entre eux, comme avant. */
function Steps({ current }: { current: number }) {
  const labels = ['Chambre', 'Locataire', 'Conditions'];
  const label = labels[current - 1] ?? '';
  return (
    <div>
      {/* Mobile : barre + numéro + libellé */}
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between text-xs font-semibold text-slate-500">
          <span>
            Étape <span className="text-brand">{current}</span>/3
          </span>
          <span className="truncate text-slate-900">{label}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${(current / 3) * 100}%` }}
          />
        </div>
      </div>
      {/* Bureau : ronds numérotés classiques */}
      <div className="hidden items-center gap-2 sm:flex">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                n <= current ? 'bg-brand text-white' : 'bg-slate-200 text-slate-500'
              }`}
            >
              {n}
            </span>
            <span
              className={`truncate text-xs font-medium ${
                n <= current ? 'text-slate-900' : 'text-slate-400'
              }`}
            >
              {labels[n - 1]}
            </span>
            {n < 3 && (
              <span className={`h-0.5 flex-1 ${n < current ? 'bg-brand' : 'bg-slate-200'}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface Site { id: string; name: string }
interface Unit {
  id: string;
  code: string;
  baseRent: number;
  manualStatus: string;
  activeOccupancyId: string | null;
  color: string;
  reservedFor: string | null;
  reservedUntil: string | null;
  reservationDepositAmount: number | null;
  siteId?: string;
}
interface TenantHit {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  occupation: string | null;
}

const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  ESPECES: 'Espèces',
  MTN_MOMO: 'MTN Mobile Money',
  ORANGE_MONEY: 'Orange Money',
  VIREMENT: 'Virement bancaire',
  AUTRE: 'Autre',
};

/** Types de pièce d'identité acceptés au Cameroun (reste `string` côté API). */
const ID_DOC_TYPES = [
  'CNI',
  'Passeport',
  'Carte étudiant',
  'Permis de conduire',
  'Récépissé',
  'Autre',
] as const;

function isSelectable(u: Unit): boolean {
  if (u.activeOccupancyId) return false;
  return u.manualStatus === 'AVAILABLE' || u.manualStatus === 'RESERVED';
}

export function NewEntry() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const prefUnitId = params.get('unitId');

  const [step, setStep] = useState(1);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState('');
  const [units, setUnits] = useState<Unit[]>([]);
  const [unit, setUnit] = useState<Unit | null>(null);

  // ─── Locataire : mode "existant" (recherche) OU "nouveau" (saisie) ────────
  const [tenantMode, setTenantMode] = useState<'new' | 'existing'>('new');
  const [selectedTenant, setSelectedTenant] = useState<TenantHit | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<TenantHit[]>([]);
  const [searching, setSearching] = useState(false);

  // Nouveau locataire — fiche complète
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [idDocType, setIdDocType] = useState<string>('CNI');
  const [idDocNumber, setIdDocNumber] = useState('');
  const [occupation, setOccupation] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [idDocKey, setIdDocKey] = useState<string | null>(null);

  // Garant (optionnel, pliable)
  const [showGuarantor, setShowGuarantor] = useState(false);
  const [gName, setGName] = useState('');
  const [gPhone, setGPhone] = useState('');
  const [gWhatsapp, setGWhatsapp] = useState('');
  const [gRelationship, setGRelationship] = useState('');
  const [gIsPrimaryPayer, setGIsPrimaryPayer] = useState(false);

  // Conditions financières
  const [rent, setRent] = useState(0);
  const [deposit, setDeposit] = useState(0);
  const [dueDay, setDueDay] = useState(1);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [advanceMonths, setAdvanceMonths] = useState(1);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('ESPECES');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentProofKey, setPaymentProofKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);
  const [lastReceiptNumber, setLastReceiptNumber] = useState('');

  // ─── Chargement sites + unités + pré-sélection ───────────────────────────
  useEffect(() => {
    api.get<Site[]>('/sites').then((s) => {
      setSites(s);
      if (s[0]) setSiteId(s[0].id);
    });
  }, []);

  useEffect(() => {
    if (!siteId) return;
    api.get<Unit[]>(`/units?siteId=${siteId}`).then((u) => {
      const selectable = u.filter(isSelectable).map((x) => ({ ...x, siteId }));
      setUnits(selectable);
      if (prefUnitId && !unit) {
        const found = selectable.find((x) => x.id === prefUnitId);
        if (found) chooseUnit(found);
      }
    });
  }, [siteId]);

  // ─── Recherche de locataire existant (debounce 300ms) ────────────────────
  useEffect(() => {
    if (tenantMode !== 'existing') return;
    const q = searchQ.trim();
    if (q.length < 2) {
      setSearchHits([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      api
        .get<TenantHit[]>(`/tenants?q=${encodeURIComponent(q)}`)
        .then((hits) => setSearchHits(hits.slice(0, 10)))
        .catch(() => setSearchHits([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQ, tenantMode]);

  const chooseUnit = (u: Unit) => {
    setUnit(u);
    setRent(u.baseRent);
    setDeposit(u.baseRent);
    if (u.manualStatus === 'RESERVED') {
      if (u.reservedFor) {
        setName(u.reservedFor);
        setTenantMode('new'); // on crée le locataire réservé
      }
      if (u.reservedUntil) setStartDate(u.reservedUntil.slice(0, 10));
    }
    setStep(2);
  };

  const pickExisting = (hit: TenantHit) => {
    setSelectedTenant(hit);
    setName(hit.name); // pour l'écran succès
  };

  const total = deposit + advanceMonths * rent;

  /** step 2 est "complet" si on a soit sélectionné un existant, soit saisi un nouveau avec un nom suffisant. */
  const step2Ready =
    (tenantMode === 'existing' && !!selectedTenant) ||
    (tenantMode === 'new' && name.trim().length >= 2);

  // ─── Submission : tenant (si nouveau) + garant (si rempli) + occupation ──
  const submit = async () => {
    if (!unit) return;
    setBusy(true);
    try {
      // 1) Tenant : existant ou nouveau
      let tenantId: string;
      let tenantName: string;
      if (tenantMode === 'existing' && selectedTenant) {
        tenantId = selectedTenant.id;
        tenantName = selectedTenant.name;
      } else {
        const t = await api.post<{ id: string; name: string }>('/tenants', {
          name: name.trim(),
          phone: phone || undefined,
          whatsapp: whatsapp || undefined,
          idDocType: idDocType || undefined,
          idDocNumber: idDocNumber || undefined,
          occupation: occupation || undefined,
          emergencyName: emergencyName || undefined,
          emergencyPhone: emergencyPhone || undefined,
          notes: notes || undefined,
          ...(photoKey ? { photoKey } : {}),
          ...(idDocKey ? { idDocKey } : {}),
        });
        tenantId = t.id;
        tenantName = t.name;
      }

      // 2) Garant (optionnel) — on n'échoue pas l'entrée si le garant plante.
      if (showGuarantor && gName.trim().length >= 2) {
        try {
          await api.post(`/tenants/${tenantId}/guarantors`, {
            name: gName.trim(),
            phone: gPhone || undefined,
            whatsapp: gWhatsapp || undefined,
            relationship: gRelationship || undefined,
            isPrimaryPayer: gIsPrimaryPayer,
          });
        } catch (gErr) {
          toast.warning(`Garant non enregistré : ${(gErr as Error).message}`);
        }
      }

      // 3) Occupation + paiement d'ouverture
      const res = await api.post<{
        openingPayment?: { payment: { id: string; receiptNumber: string } };
      }>('/occupancies', {
        unitId: unit.id,
        tenantId,
        startDate,
        monthlyRent: rent,
        dueDay,
        deposit,
        advance: advanceMonths > 0 ? { months: advanceMonths } : undefined,
        paymentMode,
        ...(paymentRef ? { paymentReference: paymentRef } : {}),
        ...(paymentProofKey ? { paymentProofKey } : {}),
      });
      const payment = res.openingPayment?.payment;
      if (payment) {
        setLastPaymentId(payment.id);
        setLastReceiptNumber(payment.receiptNumber);
        toast.success(`Entrée enregistrée · reçu N° ${payment.receiptNumber}`);
      } else {
        toast.success(`Entrée enregistrée pour ${tenantName}`);
      }
    } catch (err) {
      // Message d'erreur détaillé : préférer code+message serveur ; fallback générique.
      if (err instanceof ApiError) {
        const detail = err.code ? `[${err.code}] ${err.message}` : err.message;
        const retry = err.retryAfterSeconds
          ? ` — réessayez dans ${err.retryAfterSeconds}s`
          : '';
        toast.error(`${detail}${retry}`);
      } else {
        toast.error((err as Error).message || "Erreur à l'enregistrement");
      }
    } finally {
      setBusy(false);
    }
  };

  const viewReceipt = async () => {
    if (!lastPaymentId) return;
    try {
      const res = await fetch(`${API}/payments/${lastPaymentId}/receipt`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('at') ?? ''}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      window.open(URL.createObjectURL(await res.blob()), '_blank', 'noopener');
    } catch (err) {
      toast.error(`Impossible d'ouvrir le reçu : ${(err as Error).message}`);
    }
  };

  const sendReceipt = async () => {
    if (!lastPaymentId) return;
    try {
      const { links } = await api.get<{ links: { url: string }[] }>(
        `/payments/${lastPaymentId}/wa-link`,
      );
      if (links[0]) window.open(links[0].url, '_blank', 'noopener');
      else toast.warning('Pas de WhatsApp disponible pour ce locataire');
    } catch (err) {
      toast.error(`Impossible d'ouvrir WhatsApp : ${(err as Error).message}`);
    }
  };

  const newEntry = () => {
    setStep(1);
    setUnit(null);
    setTenantMode('new'); setSelectedTenant(null); setSearchQ(''); setSearchHits([]);
    setName(''); setPhone(''); setWhatsapp('');
    setIdDocType('CNI'); setIdDocNumber('');
    setOccupation(''); setEmergencyName(''); setEmergencyPhone(''); setNotes('');
    setPhotoKey(null); setIdDocKey(null);
    setShowGuarantor(false);
    setGName(''); setGPhone(''); setGWhatsapp(''); setGRelationship(''); setGIsPrimaryPayer(false);
    setRent(0); setDeposit(0); setDueDay(1); setAdvanceMonths(1);
    setPaymentMode('ESPECES'); setPaymentRef(''); setPaymentProofKey(null);
    setStartDate(new Date().toISOString().slice(0, 10));
    setLastPaymentId(null); setLastReceiptNumber('');
  };

  // ─── Rendu : écran succès ────────────────────────────────────────────────
  if (lastPaymentId) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('newEntry.title')} />
        <Card className="space-y-3 ring-2 ring-emerald-200">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircleIcon className="h-6 w-6" />
            </span>
            <div>
              <div className="text-base font-semibold text-slate-900">Entrée enregistrée</div>
              <div className="text-sm text-slate-500">
                {name || selectedTenant?.name} · chambre {unit?.code} · reçu N° {lastReceiptNumber}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => void viewReceipt()}>
              Voir le reçu
            </Button>
            <Button variant="success" className="flex-1" onClick={() => void sendReceipt()}>
              Envoyer WhatsApp
            </Button>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1" onClick={() => navigate('/rooms')}>
              Retour au plan
            </Button>
            <Button className="flex-1" onClick={newEntry}>
              Nouvelle entrée
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ─── Preview des échéances couvertes par l'avance (RG1-RG4) ─────────────
  // Note : le prorata exact est recalculé côté serveur selon le réglage du site.
  const preview = unit && rent > 0 && advanceMonths > 0
    ? generateRentSchedule({
        startDate: new Date(startDate),
        plannedEndDate: null,
        monthlyRent: rent,
        dueDay: Math.max(1, Math.min(28, dueDay)),
        prorataFirstMonth: false,
        horizonMonths: Math.max(1, advanceMonths),
      }).charges.slice(0, advanceMonths)
    : [];
  const MONTHS_FR = [
    'janv.', 'févr.', 'mars', 'avril', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
  ];

  // ─── Validations inline du step 3 ────────────────────────────────────────
  // Téléphone CM : accepte +237 6XXXXXXXX, 6XXXXXXXX ou juste 9 chiffres commençant par [2,6,7,9].
  const phoneCM = /^(?:\+?237)?\s*[2679]\d{8}$/;
  const errors: Record<string, string> = {};
  if (tenantMode === 'new' && phone && !phoneCM.test(phone.replace(/\s/g, ''))) {
    errors.phone = 'Téléphone invalide (ex. +237 6XX XXX XXX)';
  }
  if (tenantMode === 'new' && whatsapp && !phoneCM.test(whatsapp.replace(/\s/g, ''))) {
    errors.whatsapp = 'WhatsApp invalide';
  }
  if (rent <= 0) errors.rent = 'Loyer requis';
  if (deposit < 0) errors.deposit = 'Caution négative impossible';
  if (dueDay < 1 || dueDay > 28) errors.dueDay = 'Jour d\'échéance entre 1 et 28 (RG3)';
  if (advanceMonths < 0) errors.advanceMonths = 'Nombre de mois négatif impossible';
  if (
    paymentMode !== 'ESPECES' &&
    total > 0 &&
    (paymentMode === 'MTN_MOMO' || paymentMode === 'ORANGE_MONEY' || paymentMode === 'VIREMENT') &&
    !paymentRef.trim()
  ) {
    errors.paymentRef = 'Référence recommandée pour les paiements non-espèces';
  }
  const hasBlockingError =
    Object.keys(errors).filter((k) => k !== 'paymentRef' && k !== 'phone' && k !== 'whatsapp')
      .length > 0;

  const renderStep3 = () => (
    <Card className="space-y-3">
      <Label>{t('newEntry.step3')} · {unit!.code}</Label>

      <NumberField label={t('newEntry.rent')} value={rent} onChange={setRent} error={errors.rent} />
      <NumberField label={t('newEntry.deposit')} value={deposit} onChange={setDeposit} error={errors.deposit} />
      <div className="flex gap-2">
        <div className="flex-1">
          <NumberField label={t('newEntry.dueDay')} value={dueDay} onChange={setDueDay} error={errors.dueDay} />
        </div>
        <div className="flex-1">
          <NumberField
            label={t('newEntry.advanceMonths')}
            value={advanceMonths}
            onChange={setAdvanceMonths}
            error={errors.advanceMonths}
          />
        </div>
      </div>
      <div>
        <Label>{t('newEntry.startDate')}</Label>
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </div>

      <div>
        <Label>Mode de paiement</Label>
        <NativeSelect value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}>
          {PAYMENT_MODES.map((m) => (
            <option key={m} value={m}>{PAYMENT_MODE_LABELS[m]}</option>
          ))}
        </NativeSelect>
      </div>
      {(paymentMode === 'MTN_MOMO' || paymentMode === 'ORANGE_MONEY' || paymentMode === 'VIREMENT') && (
        <>
          <div>
            <Label>Référence du paiement</Label>
            <Input
              placeholder="ex. ID transaction MoMo"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
            />
            {errors.paymentRef && (
              <p className="mt-1 text-xs text-amber-600">{errors.paymentRef}</p>
            )}
          </div>
          <FileField
            purpose="payment-proof"
            label="Preuve de paiement (capture MoMo / scan virement)"
            accept="image/*,application/pdf"
            onUploaded={setPaymentProofKey}
          />
        </>
      )}

      {/* ─── Preview : récap de ce qui sera créé ─────────────────────────── */}
      <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Ce qui sera créé
        </div>
        <ul className="divide-y divide-slate-200 text-sm">
          {deposit > 0 && (
            <li className="flex justify-between py-1.5">
              <span className="text-slate-700">Caution (CAUTION)</span>
              <span className="font-medium text-slate-900">{formatFcfa(deposit)}</span>
            </li>
          )}
          {preview.map((c, i) => {
            const covered = i < advanceMonths;
            return (
              <li key={`${c.periodYear}-${c.periodMonth}`} className="flex justify-between py-1.5">
                <span className="text-slate-700">
                  Loyer {MONTHS_FR[c.periodMonth - 1]} {c.periodYear}
                  {covered && (
                    <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                      réglé à l'entrée
                    </span>
                  )}
                </span>
                <span className="font-medium text-slate-900">{formatFcfa(c.amount)}</span>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-sm">
          <span className="font-medium text-slate-600">Encaissé à l'entrée</span>
          <span className="text-lg font-bold text-brand">{formatFcfa(total)}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setStep(2)}>{t('newEntry.back')}</Button>
        <Button
          className="flex-1"
          busy={busy}
          disabled={hasBlockingError}
          onClick={submit}
        >
          {t('newEntry.submit')}
        </Button>
      </div>
    </Card>
  );

  // ─── Rendu : parcours en 3 étapes ────────────────────────────────────────
  return (
    <div className="space-y-4">
      <PageHeader title={t('newEntry.title')} subtitle={t('pageSub.newEntry')} />
      <Steps current={step} />

      {step === 1 && (
        <Card className="space-y-3">
          <Label>{t('newEntry.step1')}</Label>
          <NativeSelect value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </NativeSelect>
          {units.length === 0 ? (
            <EmptyState icon={DoorIcon} message="Aucune chambre disponible sur ce site" />
          ) : (
            <div className="grid grid-cols-3 gap-2.5">
              {units.map((u) => {
                const isReserved = u.manualStatus === 'RESERVED';
                return (
                  <button
                    key={u.id}
                    onClick={() => chooseUnit(u)}
                    className={`relative rounded-xl py-3.5 text-sm font-bold transition active:scale-95 ${
                      isReserved
                        ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100'
                        : 'bg-slate-100 text-slate-700 hover:bg-brand hover:text-white'
                    }`}
                  >
                    {u.code}
                    {isReserved && (
                      <span className="absolute -top-1.5 -right-1.5 rounded-full bg-sky-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                        Réservée
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-xs text-slate-400">
            Les cases bleues sont des chambres réservées — les sélectionner démarre l'occupation du locataire attendu.
          </p>
        </Card>
      )}

      {step === 2 && unit && (
        <Card className="space-y-4">
          <Label>
            {t('newEntry.step2')} · chambre {unit.code}
            {unit.manualStatus === 'RESERVED' && unit.reservedFor && (
              <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
                Réservée pour {unit.reservedFor}
              </span>
            )}
          </Label>

          {/* Toggle Existant / Nouveau */}
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm font-medium">
            <button
              onClick={() => { setTenantMode('new'); setSelectedTenant(null); }}
              className={`rounded-md px-3 py-1.5 ${tenantMode === 'new' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
            >
              Nouveau locataire
            </button>
            <button
              onClick={() => setTenantMode('existing')}
              className={`rounded-md px-3 py-1.5 ${tenantMode === 'existing' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
            >
              Rechercher un existant
            </button>
          </div>

          {/* Mode EXISTANT : recherche + sélection */}
          {tenantMode === 'existing' && (
            <div className="space-y-2">
              <Input
                placeholder="Chercher par nom ou téléphone…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                autoFocus
              />
              {searching && <p className="text-xs text-slate-400">Recherche…</p>}
              {!searching && searchQ.trim().length >= 2 && searchHits.length === 0 && (
                <p className="text-xs text-slate-400">Aucun résultat.</p>
              )}
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg ring-1 ring-slate-100">
                {searchHits.map((h) => (
                  <li key={h.id}>
                    <button
                      onClick={() => pickExisting(h)}
                      className={`flex w-full items-center justify-between gap-2 p-3 text-left text-sm transition hover:bg-slate-50 ${
                        selectedTenant?.id === h.id ? 'bg-brand/5 ring-1 ring-brand/30' : ''
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-800">{h.name}</span>
                        <span className="block truncate text-xs text-slate-400">
                          {h.phone ?? '—'}{h.occupation ? ` · ${h.occupation}` : ''}
                        </span>
                      </span>
                      {selectedTenant?.id === h.id && (
                        <CheckCircleIcon className="h-5 w-5 shrink-0 text-brand" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {selectedTenant && (
                <p className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  ✓ <strong>{selectedTenant.name}</strong> sélectionné — pas de doublon créé.
                </p>
              )}
            </div>
          )}

          {/* Mode NOUVEAU : fiche complète */}
          {tenantMode === 'new' && (
            <div className="space-y-3">
              <div>
                <Label>Nom complet *</Label>
                <Input
                  placeholder="Prénom NOM"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>Téléphone</Label>
                  <Input
                    placeholder="+237…"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    aria-invalid={!!errors.phone}
                    className={errors.phone ? 'ring-1 ring-red-300' : undefined}
                  />
                  {errors.phone && (
                    <p className="mt-1 text-xs font-medium text-red-600">{errors.phone}</p>
                  )}
                </div>
                <div className="flex-1">
                  <Label>WhatsApp</Label>
                  <Input
                    placeholder="(si différent)"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    aria-invalid={!!errors.whatsapp}
                    className={errors.whatsapp ? 'ring-1 ring-red-300' : undefined}
                  />
                  {errors.whatsapp && (
                    <p className="mt-1 text-xs font-medium text-red-600">{errors.whatsapp}</p>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <div className="w-40">
                  <Label>Pièce d'identité</Label>
                  <NativeSelect value={idDocType} onChange={(e) => setIdDocType(e.target.value)}>
                    {ID_DOC_TYPES.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex-1">
                  <Label>Numéro</Label>
                  <Input
                    placeholder="N° du document"
                    value={idDocNumber}
                    onChange={(e) => setIdDocNumber(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label>Profession ou école</Label>
                <Input
                  placeholder="ex. Étudiante ENSP, Caissière"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>Contact d'urgence · nom</Label>
                  <Input value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} />
                </div>
                <div className="flex-1">
                  <Label>Contact d'urgence · téléphone</Label>
                  <Input value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} />
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Input
                  placeholder="ex. Préfère payer en espèces le samedi"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <FileField purpose="tenant-photo" label={t('newEntry.photo')} onUploaded={setPhotoKey} />
              <FileField
                purpose="tenant-id"
                label={t('newEntry.idDoc')}
                accept="image/*,application/pdf"
                onUploaded={setIdDocKey}
              />
            </div>
          )}

          {/* Section Garant (pliable) */}
          <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
            <button
              onClick={() => setShowGuarantor((v) => !v)}
              className="flex w-full items-center justify-between text-left text-sm font-semibold text-slate-700"
            >
              <span>Garant {gIsPrimaryPayer && showGuarantor && '(payeur principal)'}</span>
              <span className="text-slate-400">{showGuarantor ? '−' : '+'}</span>
            </button>
            {showGuarantor && (
              <div className="mt-3 space-y-2">
                <Input
                  placeholder="Nom du garant"
                  value={gName}
                  onChange={(e) => setGName(e.target.value)}
                />
                <div className="flex gap-2">
                  <Input
                    placeholder="Téléphone"
                    value={gPhone}
                    onChange={(e) => setGPhone(e.target.value)}
                  />
                  <Input
                    placeholder="WhatsApp"
                    value={gWhatsapp}
                    onChange={(e) => setGWhatsapp(e.target.value)}
                  />
                </div>
                <Input
                  placeholder="Lien (père, oncle, tuteur…)"
                  value={gRelationship}
                  onChange={(e) => setGRelationship(e.target.value)}
                />
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/30"
                    checked={gIsPrimaryPayer}
                    onChange={(e) => setGIsPrimaryPayer(e.target.checked)}
                  />
                  C'est lui qui paie le loyer
                </label>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="secondary" onClick={() => setStep(1)}>
              {t('newEntry.back')}
            </Button>
            <Button className="flex-1" disabled={!step2Ready} onClick={() => setStep(3)}>
              {t('newEntry.next')}
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && unit && (
        <>
          {unit.reservationDepositAmount && unit.reservationDepositAmount > 0 && (
            <div className="rounded-lg bg-sky-50 p-3 text-sm ring-1 ring-inset ring-sky-200">
              <div className="font-semibold text-sky-900">
                Acompte de réservation déjà reçu : {formatFcfa(unit.reservationDepositAmount)}
              </div>
              <div className="mt-0.5 text-xs text-sky-700">
                Cet acompte compte dans le total déjà encaissé. Ajuste si besoin le nombre
                de mois d'avance ou la caution ci-dessous.
              </div>
            </div>
          )}
          {renderStep3()}
        </>
      )}
    </div>
  );
}

function NumberField({
  label, value, onChange, error,
}: { label: string; value: number; onChange: (n: number) => void; error?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '')) || 0)}
        aria-invalid={!!error}
        className={error ? 'ring-1 ring-red-300' : undefined}
      />
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
