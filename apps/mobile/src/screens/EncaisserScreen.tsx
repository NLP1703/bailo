import Ionicons from '@expo/vector-icons/Ionicons';
import { allocateFifo, type PaymentMode } from '@bailo/shared';
import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { UnitView } from '../data/types';
import { useSiteData } from '../data/useSiteData';
import { useSession } from '../lib/session';
import { getSync } from '../sync/engine';
import { PrimaryButton, SyncBanner } from '../ui/components';
import { formatFcfa, PAYMENT_MODE_LABELS, shortDate, whatsappNumber } from '../ui/format';
import { chargeLabel } from '../ui/labels';
import { colors, touch } from '../ui/theme';
import { BackBar } from './FicheChambreScreen';

const MODES: PaymentMode[] = ['ESPECES', 'ORANGE_MONEY', 'MTN_MOMO', 'VIREMENT'];

interface Done {
  opId: string;
  unitCode: string;
  tenantName: string;
  tenantPhone: string | null;
  amount: number;
  mode: PaymentMode;
  at: string;
}

/** Numéro de reçu provisoire, lisible au téléphone, remplacé par le définitif à l'envoi. */
export function provisionalReceipt(opId: string): string {
  return `PROV-${opId.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

/**
 * T7 — encaisser, avec ou sans réseau. Le paiement est enregistré sur le téléphone puis
 * part tout seul ; l'affectation affichée est celle que fera le serveur (RG5), recalculée
 * par lui à la réception.
 */
export function EncaisserScreen({ unitId, standalone }: { unitId?: string; standalone?: boolean }) {
  const { units, tables, siteId } = useSiteData();
  const { user } = useSession();
  const occupied = useMemo(() => units.filter((v) => v.occupancy), [units]);
  const [selectedId, setSelectedId] = useState<string | null>(unitId ?? null);
  const [query, setQuery] = useState('');
  const [amountText, setAmountText] = useState('');
  const [mode, setMode] = useState<PaymentMode>('ESPECES');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  useEffect(() => {
    if (unitId) setSelectedId(unitId);
  }, [unitId]);

  const view: UnitView | undefined = occupied.find((v) => v.unit.id === selectedId);

  // Montant proposé : le reste dû, sinon un mois de loyer.
  // Seulement au choix d'une chambre : une relecture des données ne doit pas écraser la saisie.
  const viewId = view?.unit.id;
  const suggested = view ? (view.due > 0 ? view.due : (view.occupancy?.monthlyRent ?? 0)) : 0;
  useEffect(() => {
    if (viewId) setAmountText(suggested > 0 ? String(suggested) : '');
  }, [viewId]);

  const amount = Number(amountText.replace(/\D/g, '')) || 0;
  const plan = useMemo(() => {
    if (!view || amount <= 0) return null;
    const result = allocateFifo(
      amount,
      view.openCharges.map((c) => ({ chargeId: c.id, remaining: c.remaining })),
    );
    const lines = result.lines.map((l) => {
      const charge = view.openCharges.find((c) => c.id === l.chargeId)!;
      return { charge, amount: l.amount, settled: l.amount >= charge.remaining };
    });
    const dueIds = new Set(
      view.openCharges.filter((c) => new Date(c.dueDate) <= new Date()).map((c) => c.id),
    );
    const paidOnDue = lines
      .filter((l) => dueIds.has(l.charge.id))
      .reduce((s, l) => s + l.amount, 0);
    return { lines, leftover: result.leftover, dueAfter: Math.max(0, view.due - paidOnDue) };
  }, [view, amount]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? occupied.filter(
          (v) =>
            v.unit.code.toLowerCase().includes(q) ||
            (v.tenant?.name.toLowerCase().includes(q) ?? false),
        )
      : [...occupied].sort((a, b) => b.due - a.due);
    return list.slice(0, 30);
  }, [occupied, query]);

  const submit = async () => {
    if (!view?.occupancy || !siteId || amount <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const { engine } = await getSync();
      const at = new Date().toISOString();
      const op = await engine.enqueue({
        type: 'payment.create',
        siteId,
        payload: {
          occupancyId: view.occupancy.id,
          amount,
          mode,
          paidAt: at,
          ...(mode !== 'ESPECES' && reference.trim() ? { reference: reference.trim() } : {}),
        },
      });
      void engine.flush();
      setDone({
        opId: op.opId,
        unitCode: view.unit.code,
        tenantName: view.tenant?.name ?? '',
        tenantPhone: view.tenant?.whatsapp ?? view.tenant?.phone ?? null,
        amount,
        mode,
        at,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible sur ce téléphone.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setDone(null);
    setSelectedId(null);
    setAmountText('');
    setReference('');
    setMode('ESPECES');
    if (standalone) router.back();
  };

  // Fonction (et non composant) : un composant redéfini à chaque rendu ferait perdre le
  // focus aux champs à chaque frappe.
  const wrap = (children: ReactNode) => (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      {standalone ? <BackBar title="Encaisser" /> : null}
      {children}
    </SafeAreaView>
  );

  if (done) {
    const sent = !tables.payments.some(
      (p) => (p as { pending?: true }).pending && p.id === done.opId,
    );
    const prov = provisionalReceipt(done.opId);
    const site = tables.sites[0]?.name ?? 'Bailo';
    const message = `Reçu provisoire ${prov} : ${formatFcfa(done.amount)} reçus pour la chambre ${done.unitCode} le ${shortDate(done.at)} (${PAYMENT_MODE_LABELS[done.mode]}). Le reçu définitif suivra. — ${site}`;
    return wrap(
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.doneIcon}>
          <Ionicons name="checkmark-circle" size={64} color={colors.success} />
        </View>
        <Text style={s.doneTitle}>Paiement enregistré</Text>
        <Text style={s.doneText}>
          {formatFcfa(done.amount)} · chambre {done.unitCode}
          {done.tenantName ? ` · ${done.tenantName}` : ''}
        </Text>
        <View style={s.card}>
          <Text style={s.label}>Reçu provisoire</Text>
          <Text style={s.prov}>{prov}</Text>
          <Text style={s.muted}>
            {sent
              ? 'Envoyé au serveur : le reçu définitif est disponible.'
              : 'Sans réseau : le paiement part dès le retour de la connexion, puis le reçu définitif remplace celui-ci.'}
          </Text>
        </View>
        {done.tenantPhone ? (
          <PrimaryButton
            tone="outline"
            label="Envoyer le reçu provisoire par WhatsApp"
            onPress={() =>
              void Linking.openURL(
                `https://wa.me/${whatsappNumber(done.tenantPhone!)}?text=${encodeURIComponent(message)}`,
              )
            }
          />
        ) : null}
        <PrimaryButton label={standalone ? 'Terminer' : 'Nouvel encaissement'} onPress={reset} />
      </ScrollView>,
    );
  }

  return wrap(
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <SyncBanner />
        {!standalone ? (
          <Text style={s.title} accessibilityRole="header">
            Encaisser
          </Text>
        ) : null}
        {user?.readOnly ? (
          <View style={[s.card, { backgroundColor: colors.warningSoft, borderColor: '#FDE68A' }]}>
            <Text style={{ color: colors.warning }}>
              Compte en lecture seule : l’abonnement est à régulariser par le propriétaire.
            </Text>
          </View>
        ) : null}

        <Text style={s.label}>Chambre</Text>
        {view ? (
          <Pressable
            style={s.selected}
            onPress={() => setSelectedId(null)}
            accessibilityRole="button"
            accessibilityHint="Changer de chambre"
          >
            <View style={{ flex: 1 }}>
              <Text style={s.selectedMain}>
                {view.unit.code} · {view.tenant?.name ?? 'Occupant'}
              </Text>
              <Text style={[s.muted, view.due > 0 && { color: colors.danger }]}>
                {view.due > 0 ? `dû ${formatFcfa(view.due)}` : 'à jour'}
              </Text>
            </View>
            <Text style={s.change}>Changer</Text>
          </Pressable>
        ) : (
          <View style={{ gap: 8 }}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Numéro de chambre ou nom"
              placeholderTextColor={colors.textSecondary}
              style={s.input}
              autoCorrect={false}
              autoFocus={!unitId}
            />
            <View style={s.card}>
              {matches.length === 0 ? (
                <Text style={s.muted}>Aucune chambre occupée ne correspond.</Text>
              ) : (
                matches.map((v, i) => (
                  <Pressable
                    key={v.unit.id}
                    onPress={() => setSelectedId(v.unit.id)}
                    style={[s.pickRow, i > 0 && s.rowBorder]}
                    accessibilityRole="button"
                  >
                    <Text style={s.pickCode}>{v.unit.code}</Text>
                    <Text style={s.pickName} numberOfLines={1}>
                      {v.tenant?.name ?? ''}
                    </Text>
                    <Text style={[s.pickDue, v.due > 0 && { color: colors.danger }]}>
                      {v.due > 0 ? formatFcfa(v.due) : 'à jour'}
                    </Text>
                  </Pressable>
                ))
              )}
            </View>
          </View>
        )}

        {view ? (
          <>
            <Text style={s.label}>Montant (FCFA)</Text>
            <TextInput
              value={amountText}
              onChangeText={(t) => setAmountText(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              style={[s.input, s.amountInput]}
              accessibilityLabel="Montant en francs CFA"
            />

            <Text style={s.label}>Mode de paiement</Text>
            <View style={s.modes}>
              {MODES.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  style={[s.mode, mode === m && s.modeActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: mode === m }}
                >
                  <Text style={[s.modeText, mode === m && { color: '#fff' }]}>
                    {PAYMENT_MODE_LABELS[m]}
                  </Text>
                </Pressable>
              ))}
            </View>
            {mode !== 'ESPECES' ? (
              <TextInput
                value={reference}
                onChangeText={setReference}
                placeholder="Référence de la transaction (facultatif)"
                placeholderTextColor={colors.textSecondary}
                style={s.input}
                autoCapitalize="characters"
              />
            ) : null}

            {plan ? (
              <View style={s.card}>
                <Text style={s.cardTitle}>
                  Affectation prévue <Text style={s.mutedSmall}>(recalculée par le serveur)</Text>
                </Text>
                {plan.lines.length === 0 ? (
                  <Text style={s.muted}>
                    Aucune échéance ouverte : le montant restera non affecté.
                  </Text>
                ) : (
                  plan.lines.map((l) => (
                    <View key={l.charge.id} style={s.planRow}>
                      <Text style={s.planLabel}>{chargeLabel(l.charge)}</Text>
                      <Text style={s.planValue}>
                        {formatFcfa(l.amount)} → {l.settled ? 'soldé' : 'partiel'}
                      </Text>
                    </View>
                  ))
                )}
                {plan.leftover > 0 ? (
                  <Text style={[s.mutedSmall, { color: colors.warning }]}>
                    {formatFcfa(plan.leftover)} dépassent les échéances prévues et resteront non
                    affectés.
                  </Text>
                ) : null}
                <View style={[s.planRow, s.rowBorder, { paddingTop: 8 }]}>
                  <Text style={s.planLabel}>Reste dû après paiement</Text>
                  <Text style={[s.planValue, { fontWeight: '700' }]}>
                    {formatFcfa(plan.dueAfter)}
                  </Text>
                </View>
              </View>
            ) : null}

            {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
            <PrimaryButton
              label={amount > 0 ? `Valider ${formatFcfa(amount)}` : 'Saisissez un montant'}
              onPress={() => void submit()}
              busy={busy}
              disabled={amount <= 0 || !!user?.readOnly}
            />
            <Text style={[s.mutedSmall, { textAlign: 'center' }]}>
              Sans réseau : le paiement part dès le retour de la connexion.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>,
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  label: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginTop: 4 },
  input: {
    minHeight: touch.button,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontSize: 17,
    color: colors.text,
  },
  amountInput: { fontSize: 26, fontWeight: '700' },
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  selectedMain: { fontSize: 17, fontWeight: '600', color: colors.text },
  change: { color: colors.brand, fontWeight: '600', fontSize: 15 },
  card: {
    padding: 14,
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: touch.min },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  pickCode: { width: 56, fontSize: 16, fontWeight: '700', color: colors.text },
  pickName: { flex: 1, fontSize: 15, color: colors.text },
  pickDue: { fontSize: 14, color: colors.textSecondary },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mode: {
    minHeight: touch.min,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  modeActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  modeText: { fontSize: 15, fontWeight: '600', color: colors.text },
  planRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  planLabel: { flex: 1, fontSize: 15, color: colors.text },
  planValue: { fontSize: 15, color: colors.text },
  muted: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  mutedSmall: { fontSize: 12, color: colors.textSecondary, fontWeight: '400' },
  doneIcon: { alignItems: 'center', marginTop: 24 },
  doneTitle: { fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center' },
  doneText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
  prov: { fontSize: 22, fontWeight: '700', letterSpacing: 1, color: colors.text },
});
