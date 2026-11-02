import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAllSites } from '../data/useAllSites';
import { useSession } from '../lib/session';
import { getSync } from '../sync/engine';
import { Card } from '../ui/form';
import { PrimaryButton } from '../ui/components';
import { formatFcfa, shortDate } from '../ui/format';
import { colors } from '../ui/theme';
import { BackBar } from './FicheChambreScreen';

/**
 * T14 — remises de caisse à confirmer : le propriétaire atteste avoir reçu l'argent remis
 * par un gardien ou un gérant (écart = remis − attendu). Confirmable hors-ligne : l'opération
 * part dès le retour du réseau.
 */
export function RemisesAConfirmerScreen() {
  const { user } = useSession();
  const { pendingHandovers, loading } = useAllSites();
  const siteId = user?.sites[0]?.id ?? user?.siteId ?? null;
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const list = useMemo(
    () => pendingHandovers.filter((h) => !confirmedIds.has(h.id)),
    [pendingHandovers, confirmedIds],
  );

  const confirm = async (handoverId: string) => {
    if (!siteId) return;
    setBusyId(handoverId);
    try {
      const { engine } = await getSync();
      await engine.enqueue({ type: 'cashHandover.settle', siteId, payload: { handoverId } });
      void engine.syncNow(siteId);
      setConfirmedIds((prev) => new Set(prev).add(handoverId));
    } catch {
      // On laisse la remise dans la liste : elle reste à confirmer.
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <BackBar title="Remises à confirmer" />
      <ScrollView contentContainerStyle={s.content}>
        {loading && list.length === 0 ? (
          <Text style={s.muted}>Chargement…</Text>
        ) : list.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>Rien à confirmer</Text>
            <Text style={s.muted}>
              Les remises déclarées par votre équipe apparaîtront ici pour confirmation.
            </Text>
          </View>
        ) : (
          list.map((h) => (
            <Card key={h.id}>
              <View style={s.row}>
                <Text style={s.name}>{h.collectorName ?? 'Encaisseur'}</Text>
                <Text style={s.period}>
                  {shortDate(h.periodStart)} – {shortDate(h.periodEnd)}
                </Text>
              </View>
              <View style={s.line}>
                <Text style={s.muted}>Attendu</Text>
                <Text style={s.value}>{formatFcfa(h.expectedAmount)}</Text>
              </View>
              <View style={s.line}>
                <Text style={s.muted}>Remis</Text>
                <Text style={s.value}>{formatFcfa(h.handedAmount)}</Text>
              </View>
              <View style={s.line}>
                <Text style={s.muted}>Écart</Text>
                <Text style={[s.value, h.variance !== 0 && { color: colors.danger }]}>
                  {h.variance > 0 ? '+' : ''}
                  {formatFcfa(h.variance)}
                </Text>
              </View>
              {h.note ? <Text style={s.note}>« {h.note} »</Text> : null}
              <PrimaryButton
                label="Confirmer la remise"
                onPress={() => void confirm(h.id)}
                busy={busyId === h.id}
                disabled={!!user?.readOnly}
              />
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  period: { fontSize: 13, color: colors.textSecondary },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  value: { fontSize: 15, fontWeight: '600', color: colors.text },
  note: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic' },
  muted: { fontSize: 14, color: colors.textSecondary },
  empty: { alignItems: 'center', gap: 6, marginTop: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
});
