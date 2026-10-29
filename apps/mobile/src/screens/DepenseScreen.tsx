import Ionicons from '@expo/vector-icons/Ionicons';
import type { ExpenseCategory } from '@bailo/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSiteData } from '../data/useSiteData';
import { useSession } from '../lib/session';
import { getSync } from '../sync/engine';
import { PrimaryButton, SyncBanner } from '../ui/components';
import { Card, Choices, Field, PendingBadge } from '../ui/form';
import { formatFcfa, shortDate } from '../ui/format';
import { colors } from '../ui/theme';
import { BackBar } from './FicheChambreScreen';

export const EXPENSE_LABELS: Record<ExpenseCategory, string> = {
  MAINTENANCE: 'Travaux',
  UTILITIES: 'Eau, électricité',
  TAX: 'Taxes',
  SALARY: 'Salaires',
  INSURANCE: 'Assurance',
  SUPPLIES: 'Fournitures',
  MARKETING: 'Publicité',
  OTHER: 'Autre',
};

const CATEGORIES: ExpenseCategory[] = [
  'MAINTENANCE',
  'UTILITIES',
  'TAX',
  'SALARY',
  'SUPPLIES',
  'OTHER',
];

/** Date locale AAAA-MM-JJ, `daysAgo` jours avant aujourd'hui. */
function localDay(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** T12 — nouvelle dépense du site, avec ou sans réseau (gérant et propriétaire). */
export function DepenseScreen() {
  const { tables, siteId } = useSiteData();
  const { user } = useSession();
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [label, setLabel] = useState('');
  const [amountText, setAmountText] = useState('');
  const [day, setDay] = useState<'0' | '1' | '2'>('0');
  const [payee, setPayee] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ label: string; amount: number } | null>(null);

  const amount = Number(amountText) || 0;
  const valid = !!category && label.trim().length >= 2 && amount > 0;
  const recent = [...tables.expenses]
    .sort((a, b) => b.spentAt.localeCompare(a.spentAt))
    .slice(0, 5);

  const submit = async () => {
    if (!siteId || !category || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const { engine } = await getSync();
      await engine.enqueue({
        type: 'expense.create',
        siteId,
        payload: {
          category,
          label: label.trim(),
          amount,
          spentAt: localDay(Number(day)),
          ...(payee.trim() ? { payee: payee.trim() } : {}),
        },
      });
      void engine.syncNow(siteId);
      setSaved({ label: label.trim(), amount });
      setCategory(null);
      setLabel('');
      setAmountText('');
      setPayee('');
      setDay('0');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <BackBar title="Nouvelle dépense" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <SyncBanner />
          {saved ? (
            <Card>
              <View style={s.savedRow}>
                <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                <Text style={s.savedText}>
                  Dépense enregistrée : {saved.label} · {formatFcfa(saved.amount)}
                </Text>
              </View>
            </Card>
          ) : null}
          <Choices
            label="Catégorie"
            options={CATEGORIES.map((c) => ({ value: c, label: EXPENSE_LABELS[c] }))}
            value={category}
            onChange={(c) => {
              setCategory(c);
              setSaved(null);
            }}
          />
          <Field
            label="Libellé"
            value={label}
            onChangeText={setLabel}
            placeholder="Ex. plombier, réparation fuite B03"
          />
          <Field
            label="Montant (FCFA)"
            value={amountText}
            onChangeText={(t) => setAmountText(t.replace(/\D/g, ''))}
            keyboardType="number-pad"
            big
          />
          <Choices
            label="Date"
            options={[
              { value: '0', label: 'Aujourd’hui' },
              { value: '1', label: 'Hier' },
              { value: '2', label: 'Avant-hier' },
            ]}
            value={day}
            onChange={setDay}
          />
          <Field
            label="Payé à (facultatif)"
            value={payee}
            onChangeText={setPayee}
            placeholder="Nom du prestataire"
          />
          {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
          <PrimaryButton
            label={amount > 0 ? `Enregistrer ${formatFcfa(amount)}` : 'Enregistrer la dépense'}
            onPress={() => void submit()}
            busy={busy}
            disabled={!valid || !!user?.readOnly}
          />
          {recent.length > 0 ? (
            <View style={{ gap: 8, marginTop: 8 }}>
              <Text style={s.section}>Dernières dépenses du site</Text>
              <Card>
                {recent.map((e, i) => (
                  <View key={e.id} style={[s.row, i > 0 && s.rowBorder]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.rowMain}>{e.label}</Text>
                      <Text style={s.small}>
                        {EXPENSE_LABELS[e.category as ExpenseCategory] ?? e.category} ·{' '}
                        {shortDate(e.spentAt)}
                      </Text>
                      {e.pending ? <PendingBadge /> : null}
                    </View>
                    <Text style={s.rowAmount}>{formatFcfa(e.amount)}</Text>
                  </View>
                ))}
              </Card>
            </View>
          ) : null}
          <PrimaryButton label="Retour" tone="outline" onPress={() => router.back()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  section: { fontSize: 16, fontWeight: '600', color: colors.text },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  savedText: { flex: 1, fontSize: 15, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowMain: { fontSize: 15, color: colors.text },
  rowAmount: { fontSize: 15, fontWeight: '600', color: colors.text },
  small: { fontSize: 12, color: colors.textSecondary },
});
