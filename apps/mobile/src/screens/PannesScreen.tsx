import type { MaintenancePriority } from '@bailo/shared';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSiteData } from '../data/useSiteData';
import { useSession } from '../lib/session';
import { getSync } from '../sync/engine';
import { PrimaryButton, SyncBanner } from '../ui/components';
import { Card, Choices, Field, f, PendingBadge } from '../ui/form';
import { shortDate } from '../ui/format';
import { colors, touch } from '../ui/theme';
import { BackBar } from './FicheChambreScreen';

const KINDS = ['Eau, fuite', 'Électricité', 'Serrure, porte', 'Autre'] as const;
type Kind = (typeof KINDS)[number];

const PRIORITY: Array<{ value: MaintenancePriority; label: string; tone?: 'danger' }> = [
  { value: 'NORMAL', label: 'Normale' },
  { value: 'HIGH', label: 'Haute' },
  { value: 'URGENT', label: 'Urgente', tone: 'danger' },
];

const PRIORITY_STYLE: Record<MaintenancePriority, { bg: string; fg: string; label: string }> = {
  LOW: { bg: '#F1F5F9', fg: '#475569', label: 'Basse' },
  NORMAL: { bg: '#F1F5F9', fg: '#475569', label: 'Normale' },
  HIGH: { bg: '#FEF3C7', fg: '#78350F', label: 'Haute' },
  URGENT: { bg: '#FEE2E2', fg: '#7F1D1D', label: 'Urgente' },
};

const STATUS_LABEL = {
  OPEN: 'Ouverte',
  ASSIGNED: 'Confiée',
  IN_PROGRESS: 'En cours',
  DONE: 'Réparée',
  CANCELLED: 'Annulée',
} as const;

/** T11 — pannes du site et signalement, avec ou sans réseau. */
export function PannesScreen({ standalone, unitId }: { standalone?: boolean; unitId?: string }) {
  const { tables, units, siteId } = useSiteData();
  const { user } = useSession();
  const [form, setForm] = useState(!!unitId);
  const [unit, setUnit] = useState<string | null>(unitId ?? null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind | null>(null);
  const [priority, setPriority] = useState<MaintenancePriority>('NORMAL');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codes = useMemo(() => new Map(tables.units.map((u) => [u.id, u.code])), [tables.units]);
  const tickets = useMemo(() => {
    const order: Record<MaintenancePriority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
    return [...tables.tickets].sort(
      (a, b) =>
        Number(a.status === 'DONE' || a.status === 'CANCELLED') -
          Number(b.status === 'DONE' || b.status === 'CANCELLED') ||
        order[a.priority] - order[b.priority] ||
        b.reportedAt.localeCompare(a.reportedAt),
    );
  }, [tables.tickets]);
  const open = tickets.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED');

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return units
      .filter(
        (v) =>
          v.unit.code.toLowerCase().includes(q) ||
          (v.tenant?.name.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 6);
  }, [units, query]);
  const selected = units.find((v) => v.unit.id === unit);

  const submit = async () => {
    if (!siteId || !kind) return;
    setBusy(true);
    setError(null);
    try {
      const { engine } = await getSync();
      await engine.enqueue({
        type: 'ticket.create',
        siteId,
        payload: {
          title: selected ? `${kind} · ${selected.unit.code}` : `${kind} · parties communes`,
          ...(description.trim() ? { description: description.trim() } : {}),
          priority,
          ...(unit ? { unitId: unit } : {}),
        },
      });
      void engine.syncNow(siteId);
      setForm(false);
      setKind(null);
      setPriority('NORMAL');
      setDescription('');
      setUnit(null);
      setQuery('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  const formView = (
    <>
      {!standalone ? (
        <Text style={s.title} accessibilityRole="header">
          Nouvelle panne
        </Text>
      ) : null}
      <View style={f.field}>
        <Text style={f.label}>Chambre</Text>
        {selected ? (
          <Pressable style={s.selected} onPress={() => setUnit(null)} accessibilityRole="button">
            <Text style={s.selectedText}>
              {selected.unit.code}
              {selected.tenant ? ` · ${selected.tenant.name}` : ''}
            </Text>
            <Text style={s.change}>Changer</Text>
          </Pressable>
        ) : (
          <>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Numéro de chambre (vide = parties communes)"
              placeholderTextColor={colors.textSecondary}
              style={f.input}
              autoCorrect={false}
            />
            {matches.map((v) => (
              <Pressable
                key={v.unit.id}
                onPress={() => setUnit(v.unit.id)}
                style={s.match}
                accessibilityRole="button"
              >
                <Text style={s.matchCode}>{v.unit.code}</Text>
                <Text style={s.muted}>{v.tenant?.name ?? 'libre'}</Text>
              </Pressable>
            ))}
          </>
        )}
      </View>
      <Choices
        label="Type"
        options={KINDS.map((k) => ({ value: k, label: k }))}
        value={kind}
        onChange={setKind}
      />
      <Choices label="Urgence" options={PRIORITY} value={priority} onChange={setPriority} />
      {priority === 'URGENT' ? (
        <Text style={s.muted}>
          Le propriétaire et le gérant sont alertés dès l’envoi, même la nuit.
        </Text>
      ) : null}
      <Field
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Ex. fuite sous l’évier, l’eau coule dans le couloir."
        multiline
        style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }}
      />
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      <PrimaryButton
        label="Signaler la panne"
        onPress={() => void submit()}
        busy={busy}
        disabled={!kind || !!user?.readOnly}
      />
      <PrimaryButton label="Annuler" tone="outline" onPress={() => setForm(false)} />
    </>
  );

  const listView = (
    <>
      {!standalone ? (
        <Text style={s.title} accessibilityRole="header">
          Pannes
        </Text>
      ) : null}
      <PrimaryButton
        label="Signaler une panne"
        onPress={() => setForm(true)}
        disabled={!!user?.readOnly}
      />
      <Text style={s.section}>
        {open.length === 0
          ? 'Aucune panne ouverte'
          : `${open.length} panne${open.length > 1 ? 's' : ''} ouverte${open.length > 1 ? 's' : ''}`}
      </Text>
      {tickets.map((t) => {
        const p = PRIORITY_STYLE[t.priority];
        const closed = t.status === 'DONE' || t.status === 'CANCELLED';
        return (
          <Card key={t.id}>
            <View style={s.ticketHead}>
              <Text
                style={[s.ticketTitle, closed && { color: colors.textSecondary }]}
                numberOfLines={2}
              >
                {t.title}
              </Text>
              <View style={[s.pill, { backgroundColor: p.bg }]}>
                <Text style={[s.pillText, { color: p.fg }]}>{p.label}</Text>
              </View>
            </View>
            {t.description ? <Text style={s.muted}>{t.description}</Text> : null}
            <Text style={s.small}>
              {[
                t.unitId ? `Chambre ${codes.get(t.unitId) ?? ''}` : 'Parties communes',
                STATUS_LABEL[t.status],
                shortDate(t.reportedAt),
              ].join(' · ')}
            </Text>
            {t.pending ? <PendingBadge /> : null}
          </Card>
        );
      })}
    </>
  );

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      {standalone ? <BackBar title={form ? 'Signaler une panne' : 'Pannes'} /> : null}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <SyncBanner />
          {form ? formView : listView}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  section: { fontSize: 16, fontWeight: '600', color: colors.text },
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touch.button,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  selectedText: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.text },
  change: { color: colors.brand, fontWeight: '600' },
  match: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: touch.min,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  matchCode: { width: 56, fontSize: 16, fontWeight: '700', color: colors.text },
  ticketHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  ticketTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 12, fontWeight: '700' },
  muted: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  small: { fontSize: 12, color: colors.textSecondary },
});
