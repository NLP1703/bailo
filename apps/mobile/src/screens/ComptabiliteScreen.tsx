import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { Choices } from '../ui/form';
import { formatFcfa } from '../ui/format';
import { colors } from '../ui/theme';

interface JournalRow {
  date: string;
  piece: string;
  compte: string;
  libelle: string;
  debit: number;
  credit: number;
}
interface AccountSummary {
  compte: string;
  libelle: string;
  debit: number;
  credit: number;
  solde: number;
}
interface JournalSummary {
  rows: JournalRow[];
  totals: { debit: number; credit: number; delta: number };
  byAccount: AccountSummary[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Période : mois courant (jusqu'à aujourd'hui) ou mois précédent (complet). */
function monthRange(offset: 0 | -1): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = offset === 0 ? now : new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: iso(start), to: iso(end) };
}

/**
 * LM5 — Comptabilité (propriétaire et gérant) : aperçu du journal OHADA pour une période,
 * avec totaux débit/crédit et grand livre par compte. Écran en ligne (lecture seule) ;
 * l'export CSV reste sur le site web.
 */
export function ComptabiliteScreen() {
  const [period, setPeriod] = useState<'this' | 'last'>('this');
  const [data, setData] = useState<JournalSummary | null>(null);
  const [tab, setTab] = useState<'ledger' | 'journal'>('ledger');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => monthRange(period === 'this' ? 0 : -1), [period]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const qs = new URLSearchParams({ from: range.from, to: range.to });
      setData(await api.get<JournalSummary>(`/accounting/ohada-journal/preview?${qs}`));
    } catch {
      setError('Connexion requise pour la comptabilité. Réessayez en ligne.');
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const totals = data?.totals;
  const balanced = totals ? totals.delta === 0 : false;

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
      >
        <Text style={s.title} accessibilityRole="header">
          Comptabilité
        </Text>

        <Choices
          options={[
            { value: 'this', label: 'Ce mois' },
            { value: 'last', label: 'Mois dernier' },
          ]}
          value={period}
          onChange={setPeriod}
        />

        {error ? (
          <View style={s.card}>
            <Text style={s.muted}>{error}</Text>
          </View>
        ) : loading && !data ? (
          <Text style={s.muted}>Chargement…</Text>
        ) : totals ? (
          <>
            <View style={s.totalsRow}>
              <View style={[s.tile, { flex: 1 }]}>
                <Text style={s.tileLabel}>Débit</Text>
                <Text style={s.tileValue}>{formatFcfa(totals.debit)}</Text>
              </View>
              <View style={[s.tile, { flex: 1 }]}>
                <Text style={s.tileLabel}>Crédit</Text>
                <Text style={s.tileValue}>{formatFcfa(totals.credit)}</Text>
              </View>
            </View>
            <View style={[s.card, { alignItems: 'center' }]}>
              <Text style={[s.balance, { color: balanced ? colors.success : colors.danger }]}>
                {balanced ? 'Journal équilibré' : `Écart ${formatFcfa(Math.abs(totals.delta))}`}
              </Text>
            </View>

            <Choices
              options={[
                { value: 'ledger', label: 'Grand livre' },
                { value: 'journal', label: 'Journal' },
              ]}
              value={tab}
              onChange={setTab}
            />

            {tab === 'ledger' ? (
              data!.byAccount.length === 0 ? (
                <Text style={s.muted}>Aucune écriture sur la période.</Text>
              ) : (
                <View style={s.card}>
                  {data!.byAccount.map((a, i) => (
                    <View key={a.compte} style={[s.ledgerRow, i > 0 && s.border]}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.compte}>
                          {a.compte} · {a.libelle}
                        </Text>
                        <Text style={s.small}>
                          débit {formatFcfa(a.debit)} · crédit {formatFcfa(a.credit)}
                        </Text>
                      </View>
                      <Text style={[s.solde, { color: a.solde >= 0 ? colors.text : colors.danger }]}>
                        {formatFcfa(a.solde)}
                      </Text>
                    </View>
                  ))}
                </View>
              )
            ) : data!.rows.length === 0 ? (
              <Text style={s.muted}>Aucune écriture sur la période.</Text>
            ) : (
              <View style={s.card}>
                {data!.rows.map((r, i) => (
                  <View key={`${r.piece}-${i}`} style={[s.journalRow, i > 0 && s.border]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.compte}>{r.libelle}</Text>
                      <Text style={s.small}>
                        {r.date.slice(0, 10)} · {r.compte} · pièce {r.piece}
                      </Text>
                    </View>
                    <Text style={s.amount}>
                      {r.debit > 0 ? `+${formatFcfa(r.debit)}` : `−${formatFcfa(r.credit)}`}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  totalsRow: { flexDirection: 'row', gap: 12 },
  tile: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tileLabel: { fontSize: 13, color: colors.textSecondary },
  tileValue: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 2 },
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  balance: { fontSize: 15, fontWeight: '700' },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  journalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  border: { borderTopWidth: 1, borderTopColor: colors.border },
  compte: { fontSize: 15, color: colors.text },
  solde: { fontSize: 15, fontWeight: '700' },
  amount: { fontSize: 14, fontWeight: '600', color: colors.text },
  small: { fontSize: 12, color: colors.textSecondary },
  muted: { fontSize: 14, color: colors.textSecondary },
});
