// Liste des contrats, filtrable par statut, avec actions rapides et création depuis une occupation.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CONTRACT_STATUSES, type ContractStatus } from '@bailo/shared';
import { api } from '../lib/api';
import { formatDate, formatFcfa } from '../lib/format';
import { Badge, Button, Card, PageHeader, PageSkeleton, type Tone } from '../components/ui';
import { FileTextIcon, PlusIcon } from '../components/icons';

interface ContractRow {
  id: string;
  reference: string;
  status: ContractStatus;
  monthlyRent: number;
  deposit: number;
  startDate: string;
  signedAt: string | null;
  tenant: { name: string };
}

const STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT: 'Brouillon',
  PENDING_SIGNATURE: 'En signature',
  SIGNED: 'Signé',
  TERMINATED: 'Résilié',
};
const STATUS_TONES: Record<ContractStatus, Tone> = {
  DRAFT: 'slate',
  PENDING_SIGNATURE: 'amber',
  SIGNED: 'emerald',
  TERMINATED: 'red',
};

export function Contracts() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const activeStatus = (params.get('status') as ContractStatus | null) ?? null;
  const [rows, setRows] = useState<ContractRow[] | null>(null);

  useEffect(() => {
    const q = activeStatus ? `?status=${activeStatus}` : '';
    api.get<ContractRow[]>(`/contracts${q}`).then(setRows).catch(() => setRows([]));
  }, [activeStatus]);

  const counts = useMemo(() => {
    const c: Record<ContractStatus, number> = { DRAFT: 0, PENDING_SIGNATURE: 0, SIGNED: 0, TERMINATED: 0 };
    (rows ?? []).forEach((r) => { c[r.status]++; });
    return c;
  }, [rows]);

  if (!rows) return <PageSkeleton />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Contrats"
        subtitle="Baux de location — brouillon, envoi à la signature, signature OTP et résiliation."
        actions={
          <Button
            onClick={async () => {
              // Choix d'une occupation active : simple prompt pour MVP ; une fenêtre dédiée arrivera.
              const occId = window.prompt('ID de l\'occupation (depuis la fiche locataire)');
              if (occId) navigate(`/contracts/new?occupancyId=${encodeURIComponent(occId)}`);
            }}
          >
            <PlusIcon className="mr-1 h-4 w-4" />
            Nouveau contrat
          </Button>
        }
      />

      {/* Filtre par statut */}
      <div className="flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          onClick={() => setParams({})}
          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
            !activeStatus ? 'bg-brand text-white ring-brand' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
          }`}
        >
          Tous · {rows.length}
        </button>
        {CONTRACT_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setParams({ status: s })}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
              activeStatus === s ? 'bg-brand text-white ring-brand' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
            }`}
          >
            {STATUS_LABELS[s]} · {counts[s]}
          </button>
        ))}
      </div>

      <Card>
        {rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            <FileTextIcon className="mx-auto h-10 w-10 opacity-40" />
            <p className="mt-2">Aucun contrat {activeStatus ? `au statut ${STATUS_LABELS[activeStatus]}` : ''}.</p>
            <p className="mt-1 text-xs">
              Pour en créer un, ouvrez la fiche d'un locataire ayant une occupation active, puis utilisez le menu « Nouveau contrat ».
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/contracts/${r.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-3 hover:bg-slate-50 rounded-lg"
                >
                  <span className="font-mono text-xs text-slate-500">{r.reference}</span>
                  <span className="font-medium text-slate-900">{r.tenant.name}</span>
                  <Badge tone={STATUS_TONES[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                  <span className="ml-auto text-sm text-slate-600">
                    {formatFcfa(r.monthlyRent)} / mois · caution {formatFcfa(r.deposit)}
                  </span>
                  <span className="text-xs text-slate-500 w-full sm:w-auto">
                    Début {formatDate(r.startDate)}
                    {r.signedAt && ` · Signé ${formatDate(r.signedAt)}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
