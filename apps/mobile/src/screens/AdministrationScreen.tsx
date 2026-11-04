import type { AdminOverview, AdminQuotaGauge, UserRole } from '@bailo/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { colors } from '../ui/theme';

const ROLE: Record<UserRole, string> = {
  OWNER: 'Propriétaire',
  MANAGER: 'Gérant',
  CARETAKER: 'Gardien',
};

function dateLabel(iso: string | null): string {
  if (!iso) return 'jamais';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function Gauge({ label, g }: { label: string; g: AdminQuotaGauge }) {
  const pct = g.pct ?? 0;
  const over = g.pct !== null && g.pct >= 100;
  return (
    <View style={{ gap: 4 }}>
      <View style={s.gaugeHead}>
        <Text style={s.gaugeLabel}>{label}</Text>
        <Text style={s.gaugeValue}>
          {g.used}
          {g.limit !== null ? ` / ${g.limit}` : ' · illimité'}
        </Text>
      </View>
      {g.limit !== null ? (
        <View style={s.track}>
          <View
            style={[
              s.fill,
              { width: `${Math.min(pct, 100)}%`, backgroundColor: over ? colors.danger : colors.brand },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * LM5 — Administration (propriétaire et gérant) : synthèse de la gouvernance du compte —
 * plan et jauges de quota, équipe, anomalies ouvertes, actions sensibles récentes — avec
 * accès au journal d'audit complet. Écran en ligne (lecture seule).
 */
export function AdministrationScreen() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.get<AdminOverview>('/admin/overview'));
    } catch {
      setError('Connexion requise pour l’administration. Réessayez en ligne.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
      >
        <Text style={s.title} accessibilityRole="header">
          Administration
        </Text>

        {error ? (
          <View style={s.card}>
            <Text style={s.muted}>{error}</Text>
          </View>
        ) : loading && !data ? (
          <Text style={s.muted}>Chargement…</Text>
        ) : data ? (
          <>
            <View style={s.card}>
              <Text style={s.sectionLabel}>
                Plan {data.plan.code}
                {data.plan.endsAt ? ` · jusqu’au ${dateLabel(data.plan.endsAt)}` : ''}
              </Text>
              <View style={{ gap: 12, marginTop: 8 }}>
                <Gauge label="Sites" g={data.quotas.sites} />
                <Gauge label="Chambres" g={data.quotas.units} />
                <Gauge label="Utilisateurs" g={data.quotas.users} />
              </View>
            </View>

            <View style={s.statRow}>
              <View style={[s.stat, { flex: 1 }]}>
                <Text style={s.statValue}>{data.users.active}</Text>
                <Text style={s.statLabel}>membres actifs</Text>
              </View>
              <Pressable style={[s.stat, { flex: 1 }]} onPress={() => router.push('/audit')}>
                <Text style={[s.statValue, data.anomaliesOpen > 0 && { color: colors.danger }]}>
                  {data.anomaliesOpen}
                </Text>
                <Text style={s.statLabel}>anomalies ouvertes</Text>
              </Pressable>
              <View style={[s.stat, { flex: 1 }]}>
                <Text style={s.statValue}>{data.sensitiveActionsLast7Days}</Text>
                <Text style={s.statLabel}>actions sensibles (7 j)</Text>
              </View>
            </View>

            {data.openAnomalies.length > 0 ? (
              <View style={s.card}>
                <Text style={s.sectionLabel}>Anomalies à traiter</Text>
                {data.openAnomalies.map((a, i) => (
                  <View key={a.id} style={[s.listRow, i > 0 && s.border]}>
                    <View style={[s.sev, a.severity >= 3 && { backgroundColor: colors.danger }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowText}>{a.message}</Text>
                      <Text style={s.small}>
                        {a.kind} · {dateLabel(a.createdAt)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {data.recentSensitiveActions.length > 0 ? (
              <View style={s.card}>
                <Text style={s.sectionLabel}>Actions sensibles récentes</Text>
                {data.recentSensitiveActions.map((a, i) => (
                  <View key={a.id} style={[s.listRow, i > 0 && s.border]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowText}>
                        {a.isRoleChange ? 'Changement de rôle' : a.action} · {a.entity}
                      </Text>
                      <Text style={s.small}>
                        {a.actorName ?? 'Système'} · {dateLabel(a.createdAt)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {data.recentLogins.length > 0 ? (
              <View style={s.card}>
                <Text style={s.sectionLabel}>Dernières connexions</Text>
                {data.recentLogins.map((u, i) => (
                  <View key={u.userId} style={[s.listRow, i > 0 && s.border]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowText}>{u.name}</Text>
                      <Text style={s.small}>{ROLE[u.role]}</Text>
                    </View>
                    <Text style={s.small}>{dateLabel(u.lastLoginAt)}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Pressable style={s.linkCard} onPress={() => router.push('/audit')}>
              <Text style={s.linkText}>Journal d’audit complet</Text>
              <Text style={s.small}>Toutes les actions enregistrées sur le compte.</Text>
            </Pressable>
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
  card: {
    gap: 4,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  gaugeHead: { flexDirection: 'row', justifyContent: 'space-between' },
  gaugeLabel: { fontSize: 14, color: colors.textSecondary },
  gaugeValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  statRow: { flexDirection: 'row', gap: 10 },
  stat: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: 2,
  },
  statValue: { fontSize: 22, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textSecondary, textAlign: 'center' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  border: { borderTopWidth: 1, borderTopColor: colors.border },
  sev: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textSecondary },
  rowText: { fontSize: 14, color: colors.text },
  linkCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
    gap: 2,
  },
  linkText: { fontSize: 15, fontWeight: '700', color: colors.brand },
  muted: { fontSize: 14, color: colors.textSecondary },
  small: { fontSize: 12, color: colors.textSecondary },
});
