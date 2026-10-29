import Ionicons from '@expo/vector-icons/Ionicons';
import type { RejectedOperation } from '@bailo/sync';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { remindersForToday } from '../data/reminders';
import { useSiteData } from '../data/useSiteData';
import { useSession } from '../lib/session';
import { getSync } from '../sync/engine';
import { useSyncState } from '../sync/useSync';
import { formatFcfa, monthLabel } from '../ui/format';
import { colors, touch } from '../ui/theme';

const ROLE = { OWNER: 'Propriétaire', MANAGER: 'Gérant', CARETAKER: 'Gardien' } as const;

/**
 * T2 — accueil du gérant : encaissé du jour et du mois, reste à encaisser, occupation,
 * puis ce qui demande une action (retards, relances, pannes, saisies refusées).
 * Consultable sans réseau (données du téléphone).
 */
export function AccueilScreen() {
  const { user } = useSession();
  const sync = useSyncState();
  const { summary, tables, units } = useSiteData();
  const [toFix, setToFix] = useState<RejectedOperation[]>([]);

  useEffect(() => {
    void getSync()
      .then(({ outbox }) => outbox.listToFix())
      .then(setToFix)
      .catch(() => setToFix([]));
  }, [sync.pendingCount, sync.lastSuccessAt]);

  const reminders = useMemo(() => remindersForToday(tables, units, new Date()), [tables, units]);
  const openTickets = tables.tickets.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED');
  const urgent = openTickets.filter((t) => t.priority === 'URGENT');
  const month = monthLabel(new Date().getMonth() + 1);
  const firstName = user?.name.split(/\s+/)[0] ?? '';
  const occupancyRate = summary.total ? Math.round((summary.occupied / summary.total) * 100) : 0;
  const syncLine =
    sync.phase === 'offline'
      ? `Hors-ligne · ${sync.pendingCount} en attente d’envoi`
      : sync.pendingCount > 0
        ? `${sync.pendingCount} en cours d’envoi`
        : sync.lastSuccessAt
          ? `Synchronisé à ${new Date(sync.lastSuccessAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
          : 'Pas encore synchronisé';

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={{ gap: 2 }}>
          <Text style={s.hello} accessibilityRole="header">
            Bonjour {firstName}
          </Text>
          <Text style={s.muted}>
            {user ? ROLE[user.role] : ''} · {tables.sites[0]?.name ?? ''}
          </Text>
          <View style={s.syncRow}>
            <View
              style={[
                s.dot,
                { backgroundColor: sync.phase === 'offline' ? colors.warning : colors.success },
              ]}
            />
            <Text style={s.small}>{syncLine}</Text>
          </View>
        </View>

        <View style={s.grid}>
          <Tile
            label="Encaissé aujourd’hui"
            value={formatFcfa(summary.collectedToday)}
            hint={`${summary.paymentsToday} paiement${summary.paymentsToday > 1 ? 's' : ''}`}
          />
          <Tile
            label={`Encaissé en ${month}`}
            value={formatFcfa(summary.collectedMonth)}
            hint={`sur ${formatFcfa(summary.expectedMonth)} attendus`}
          />
          <Tile
            label={`Reste à encaisser (${month})`}
            value={formatFcfa(summary.toCollectMonth)}
            hint={`${summary.toCollectUnits} chambre${summary.toCollectUnits > 1 ? 's' : ''}`}
          />
          <Tile
            label="Occupation"
            value={`${summary.occupied} / ${summary.total}`}
            hint={`${occupancyRate} %`}
          />
        </View>

        <Action
          icon="alert-circle"
          tone={summary.overdueUnits > 0 ? 'danger' : undefined}
          title={`${summary.overdueUnits} chambre${summary.overdueUnits > 1 ? 's' : ''} en retard`}
          detail={`${formatFcfa(summary.overdue)} d’impayés`}
          href={{ pathname: '/gerant/chambres', params: { status: 'RED' } }}
        />
        <Action
          icon="notifications"
          title="Relances du jour"
          detail={`${reminders.filter((r) => r.kind === 'upcoming').length} rappel(s) · ${reminders.filter((r) => r.kind === 'late').length} retard(s)`}
          href="/gerant/relances"
        />
        <Action
          icon="construct"
          tone={urgent.length > 0 ? 'danger' : undefined}
          title={`${openTickets.length} panne${openTickets.length > 1 ? 's' : ''} ouverte${openTickets.length > 1 ? 's' : ''}`}
          detail={
            urgent.length > 0
              ? `dont ${urgent.length} urgente${urgent.length > 1 ? 's' : ''}`
              : 'aucune urgente'
          }
          href="/pannes"
        />
        {toFix.length > 0 ? (
          <Action
            icon="warning"
            tone="danger"
            title={`${toFix.length} saisie${toFix.length > 1 ? 's' : ''} à corriger`}
            detail="Refusée(s) par le serveur : à refaire ou abandonner"
            href="/a-corriger"
          />
        ) : null}

        <View style={s.quick}>
          <Quick icon="speedometer-outline" label="Relevés" href="/releves" />
          <Quick icon="receipt-outline" label="Dépense" href="/depense" />
          <Quick icon="wallet-outline" label="Ma caisse" href="/caisse" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={s.tile}>
      <Text style={s.small}>{label}</Text>
      <Text style={s.tileValue} adjustsFontSizeToFit numberOfLines={1}>
        {value}
      </Text>
      <Text style={s.small}>{hint}</Text>
    </View>
  );
}

function Action({
  icon,
  title,
  detail,
  href,
  tone,
}: {
  icon: 'alert-circle' | 'notifications' | 'construct' | 'warning';
  title: string;
  detail: string;
  href: Href;
  tone?: 'danger';
}) {
  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="button"
      style={[
        s.action,
        tone === 'danger' && { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
      ]}
    >
      <Ionicons name={icon} size={24} color={tone === 'danger' ? colors.danger : colors.brand} />
      <View style={{ flex: 1 }}>
        <Text style={s.actionTitle}>{title}</Text>
        <Text style={s.muted}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}

function Quick({
  icon,
  label,
  href,
}: {
  icon: 'speedometer-outline' | 'receipt-outline' | 'wallet-outline';
  label: string;
  href: Href;
}) {
  return (
    <Pressable onPress={() => router.push(href)} accessibilityRole="button" style={s.quickBtn}>
      <Ionicons name={icon} size={22} color={colors.brand} />
      <Text style={s.quickText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  hello: { fontSize: 24, fontWeight: '700', color: colors.text },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    padding: 14,
    gap: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tileValue: { fontSize: 20, fontWeight: '700', color: colors.text },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  quick: { flexDirection: 'row', gap: 10 },
  quickBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    minHeight: touch.button,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  quickText: { fontSize: 13, fontWeight: '600', color: colors.text },
  muted: { fontSize: 14, color: colors.textSecondary },
  small: { fontSize: 12, color: colors.textSecondary },
});
