// Carte compacte à insérer dans la fiche locataire : score de fiabilité (si assez d'historique)
// et résumé de caution sur l'occupation en cours.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatFcfa } from '../lib/format';
import { Card } from './ui';

interface Score {
  tenantId: string; score: number; onTimeRate: number; avgDelayDays: number; totalPayments: number;
}
interface Deposit {
  deposit: number; totalWithheld: number; refundable: number;
}

export function TenantInsightsCard({
  tenantId,
  activeOccupancyId,
}: { tenantId: string; activeOccupancyId?: string | null }) {
  const [score, setScore] = useState<Score | null>(null);
  const [deposit, setDeposit] = useState<Deposit | null>(null);

  useEffect(() => {
    api.get<Score>(`/insights/tenants/${tenantId}/score`).then(setScore).catch(() => setScore(null));
  }, [tenantId]);
  useEffect(() => {
    if (!activeOccupancyId) return;
    api.get<Deposit>(`/inspections/deposit-summary?occupancyId=${activeOccupancyId}`)
      .then(setDeposit).catch(() => setDeposit(null));
  }, [activeOccupancyId]);

  // Si rien à montrer, pas de carte.
  if ((!score || score.totalPayments === 0) && !deposit) return null;

  const scoreColor =
    !score ? 'bg-slate-100 text-slate-500'
      : score.score >= 80 ? 'bg-emerald-100 text-emerald-700'
      : score.score >= 50 ? 'bg-amber-100 text-amber-700'
      : 'bg-red-100 text-red-700';

  return (
    <Card className="flex flex-wrap items-center gap-6">
      {score && score.totalPayments > 0 && (
        <div className="flex items-center gap-3">
          <div className={`flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold ${scoreColor}`}>
            {score.score}
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Score de fiabilité</div>
            <div className="text-sm text-slate-700">
              {Math.round(score.onTimeRate * 100)} % à l'heure · retard moyen {score.avgDelayDays} j
            </div>
            <div className="text-xs text-slate-500">{score.totalPayments} paiement(s) analysés</div>
          </div>
        </div>
      )}

      {deposit && (
        <div className="flex-1 border-l border-slate-200 pl-6">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Caution</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-3 text-sm">
            <span><span className="text-slate-500">Versée : </span><span className="font-medium">{formatFcfa(deposit.deposit)}</span></span>
            {deposit.totalWithheld > 0 && (
              <span><span className="text-slate-500">Retenue : </span><span className="font-medium text-amber-700">{formatFcfa(deposit.totalWithheld)}</span></span>
            )}
            <span><span className="text-slate-500">À rembourser : </span><span className="font-semibold text-emerald-700">{formatFcfa(deposit.refundable)}</span></span>
          </div>
          {activeOccupancyId && (
            <Link to={`/inspections?occupancyId=${activeOccupancyId}`}
              className="mt-1 inline-block text-xs text-brand hover:underline">
              Voir les états des lieux →
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
