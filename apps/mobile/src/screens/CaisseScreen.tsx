import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSiteData } from '../data/useSiteData';
import { useSession } from '../lib/session';
import { getSync } from '../sync/engine';
import { PrimaryButton, SyncBanner } from '../ui/components';
import { Card, Field, PendingBadge } from '../ui/form';
import { formatFcfa, shortDate } from '../ui/format';
import { colors } from '../ui/theme';
import { BackBar } from './FicheChambreScreen';

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `aujourd’hui ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `hier ${time}`;
  return `${shortDate(iso).slice(0, 5)} ${time}`;
}

/**
 * T8 — ma caisse : espèces encaissées par moi et pas encore remises, puis déclaration
 * d'une remise (à confirmer par le propriétaire, T14).
 */
export function CaisseScreen({
  standalone,
  embedded,
}: {
  standalone?: boolean;
  embedded?: boolean;
}) {
  const { tables, siteId } = useSiteData();
  const { user } = useSession();
  const [declaring, setDeclaring] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const units = useMemo(() => {
    const byUnit = new Map(tables.units.map((u) => [u.id, u.code]));
    return new Map(tables.occupancies.map((o) => [o.id, byUnit.get(o.unitId) ?? '—']));
  }, [tables.units, tables.occupancies]);

  const handovers = useMemo(
    () => [...tables.cash_handovers].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)),
    [tables.cash_handovers],
  );
  const last = handovers[0];
  const cash = useMemo(
    () =>
      tables.payments
        .filter(
          (p) =>
            p.mode === 'ESPECES' &&
            p.status === 'VALID' &&
            (p.pending || p.receivedBy === user?.id) &&
            (!last || p.paidAt > last.periodEnd),
        )
        .sort((a, b) => b.paidAt.localeCompare(a.paidAt)),
    [tables.payments, user?.id, last],
  );
  const total = cash.reduce((s, p) => s + p.amount, 0);
  const handed = Number(amountText) || 0;

  const declare = async () => {
    if (!siteId || !user) return;
    setBusy(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const oldest = cash[cash.length - 1]?.paidAt;
      const start =
        last?.periodEnd ?? oldest ?? new Date(Date.now() - 90 * 86_400_000).toISOString();
      const { engine } = await getSync();
      await engine.enqueue({
        type: 'cashHandover.create',
        siteId,
        payload: {
          collectorId: user.id,
          periodStart: start,
          periodEnd: now,
          handedAmount: handed,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      void engine.syncNow(siteId);
      setDeclaring(false);
      setAmountText('');
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  const content = (
    <>
      <Card>
        <Text style={s.label}>Espèces non remises</Text>
        <Text style={s.total}>{formatFcfa(total)}</Text>
        <Text style={s.muted}>
          {cash.length} paiement{cash.length > 1 ? 's' : ''}
          {last ? ` depuis la remise du ${shortDate(last.periodEnd)}` : ' en espèces'}
        </Text>
      </Card>

      {cash.length > 0 ? (
        <Card>
          {cash.map((p, i) => (
            <View key={p.id} style={[s.row, i > 0 && s.rowBorder]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.rowMain}>
                  {units.get(p.occupancyId) ?? '—'} · {when(p.paidAt)}
                </Text>
                {p.pending ? <PendingBadge /> : null}
              </View>
              <Text style={s.rowAmount}>{formatFcfa(p.amount)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {declaring ? (
        <Card>
          <Field
            label="Montant remis (FCFA)"
            value={amountText}
            onChangeText={(t) => setAmountText(t.replace(/\D/g, ''))}
            keyboardType="number-pad"
            big
            hint={
              handed !== total && amountText !== ''
                ? `Écart de ${formatFcfa(Math.abs(handed - total))} ${handed < total ? 'en moins' : 'en plus'} : précisez-le dans la note.`
                : undefined
            }
          />
          <Field
            label="Note (facultatif)"
            value={note}
            onChangeText={setNote}
            placeholder="À qui, comment…"
          />
          {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
          <PrimaryButton
            label={`Déclarer ${formatFcfa(handed)}`}
            onPress={() => void declare()}
            busy={busy}
            disabled={amountText === '' || !!user?.readOnly}
          />
          <PrimaryButton label="Annuler" tone="outline" onPress={() => setDeclaring(false)} />
        </Card>
      ) : (
        <PrimaryButton
          label="Déclarer une remise de caisse"
          tone="outline"
          disabled={!!user?.readOnly}
          onPress={() => {
            setAmountText(String(total));
            setDeclaring(true);
          }}
        />
      )}

      {handovers.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={s.section}>Remises</Text>
          <Card>
            {handovers.slice(0, 6).map((h, i) => (
              <View key={h.id} style={[s.row, i > 0 && s.rowBorder]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.rowMain}>
                    Remise du {shortDate(h.periodEnd)} · {formatFcfa(h.handedAmount)}
                  </Text>
                  {h.pending ? (
                    <PendingBadge />
                  ) : (
                    <Text
                      style={[s.small, { color: h.settledAt ? colors.success : colors.warning }]}
                    >
                      {h.settledAt ? 'Confirmée' : 'À confirmer par le propriétaire'}
                      {h.variance !== 0 ? ` · écart ${formatFcfa(h.variance)}` : ''}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </Card>
        </View>
      ) : null}
    </>
  );

  if (embedded) return content;

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      {standalone ? <BackBar title="Ma caisse" /> : null}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <SyncBanner />
          {content}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  label: { fontSize: 14, color: colors.textSecondary },
  total: { fontSize: 30, fontWeight: '700', color: colors.text },
  section: { fontSize: 16, fontWeight: '600', color: colors.text },
  muted: { fontSize: 14, color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowMain: { fontSize: 15, color: colors.text },
  rowAmount: { fontSize: 15, fontWeight: '600', color: colors.text },
  small: { fontSize: 12, color: colors.textSecondary },
});
