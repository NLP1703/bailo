// Détail d'un contrat : prévisualisation, envoi du code OTP, signature, résiliation, téléchargement PDF.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ContractStatus } from '@bailo/shared';
import { api, ApiError, API, authFetch } from '../lib/api';
import { formatDate, formatFcfa } from '../lib/format';
import { Badge, Button, Card, PageHeader, PageSkeleton, type Tone } from '../components/ui';
import { useToast } from '../components/Toast';

interface Contract {
  id: string; reference: string; status: ContractStatus;
  monthlyRent: number; deposit: number; startDate: string;
  durationMonths: number | null; noticeDays: number;
  bodyHtml: string; signedByTenant: boolean; signedAt: string | null;
  terminatedAt: string | null; terminationReason: string | null;
}

const STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT: 'Brouillon', PENDING_SIGNATURE: 'En signature', SIGNED: 'Signé', TERMINATED: 'Résilié',
};
const STATUS_TONES: Record<ContractStatus, Tone> = {
  DRAFT: 'slate', PENDING_SIGNATURE: 'amber', SIGNED: 'emerald', TERMINATED: 'red',
};

export function ContractDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [c, setC] = useState<Contract | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSign, setShowSign] = useState(false);
  const [otp, setOtp] = useState('');
  const [sigName, setSigName] = useState('');

  const reload = useCallback(() => {
    api.get<Contract>(`/contracts/${id}`).then(setC).catch(() => setC(null));
  }, [id]);
  useEffect(reload, [reload]);

  if (!c) return <PageSkeleton />;

  const send = async () => {
    setBusy(true);
    try {
      await api.post(`/contracts/${c.id}/send-for-signature`, { channel: 'EMAIL' });
      toast.success('Code de signature envoyé par e-mail au locataire');
      reload();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erreur'); }
    finally { setBusy(false); }
  };

  const sign = async () => {
    setBusy(true);
    try {
      await api.post(`/contracts/${c.id}/sign`, { otpCode: otp.trim(), tenantSignatureName: sigName.trim() });
      toast.success('Contrat signé');
      setShowSign(false); setOtp(''); setSigName('');
      reload();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Code incorrect'); }
    finally { setBusy(false); }
  };

  const terminate = async () => {
    const reason = window.prompt('Motif de résiliation ?');
    if (!reason) return;
    setBusy(true);
    try {
      await api.post(`/contracts/${c.id}/terminate`, { reason });
      toast.success('Contrat résilié');
      reload();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erreur'); }
    finally { setBusy(false); }
  };

  const pdfUrl = `${API}/contracts/${c.id}/pdf`;
  const openPdf = async () => {
    const r = await authFetch(pdfUrl);
    if (!r.ok) { toast.error('Impossible de générer le document'); return; }
    const blob = await r.blob();
    window.open(URL.createObjectURL(blob), '_blank', 'noopener');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Contrat ${c.reference}`}
        subtitle={<Badge tone={STATUS_TONES[c.status]}>{STATUS_LABELS[c.status]}</Badge>}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/contracts')}>Retour</Button>
            <Button variant="ghost" onClick={openPdf}>Ouvrir le document</Button>
            {c.status === 'DRAFT' && <Button onClick={send} disabled={busy}>Envoyer au locataire pour signature</Button>}
            {c.status === 'PENDING_SIGNATURE' && <Button onClick={() => setShowSign(true)}>Saisir le code reçu</Button>}
            {(c.status === 'SIGNED' || c.status === 'PENDING_SIGNATURE') && (
              <Button variant="danger" onClick={terminate} disabled={busy}>Résilier</Button>
            )}
          </>
        }
      />

      <Card>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-slate-500">Loyer mensuel</dt><dd className="font-medium">{formatFcfa(c.monthlyRent)}</dd></div>
          <div><dt className="text-slate-500">Caution</dt><dd className="font-medium">{formatFcfa(c.deposit)}</dd></div>
          <div><dt className="text-slate-500">Date de début</dt><dd className="font-medium">{formatDate(c.startDate)}</dd></div>
          <div><dt className="text-slate-500">Durée</dt><dd className="font-medium">{c.durationMonths ? `${c.durationMonths} mois` : 'Indéterminée'}</dd></div>
          <div><dt className="text-slate-500">Préavis</dt><dd className="font-medium">{c.noticeDays} jours</dd></div>
          {c.signedAt && <div><dt className="text-slate-500">Signé le</dt><dd className="font-medium">{formatDate(c.signedAt)}</dd></div>}
          {c.terminatedAt && <div><dt className="text-slate-500">Résilié le</dt><dd className="font-medium">{formatDate(c.terminatedAt)}</dd></div>}
          {c.terminationReason && <div className="sm:col-span-4"><dt className="text-slate-500">Motif</dt><dd className="font-medium">{c.terminationReason}</dd></div>}
        </dl>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Corps du contrat</h2>
        <div className="prose max-w-none text-sm" dangerouslySetInnerHTML={{ __html: c.bodyHtml }} />
      </Card>

      {showSign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold">Signature électronique</h3>
            <p className="mt-1 text-sm text-slate-600">
              Saisissez le code à 6 chiffres reçu par e-mail par le locataire, et le nom tapé par lui pour mémoire.
            </p>
            <label className="mt-3 block text-sm">
              <span>Code reçu par e-mail</span>
              <input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" autoFocus
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono tracking-widest" />
            </label>
            <label className="mt-2 block text-sm">
              <span>Nom tapé par le locataire</span>
              <input value={sigName} onChange={(e) => setSigName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setShowSign(false); setOtp(''); setSigName(''); }}>Annuler</Button>
              <Button onClick={sign} disabled={busy || otp.length < 4 || sigName.length < 2}>Signer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
