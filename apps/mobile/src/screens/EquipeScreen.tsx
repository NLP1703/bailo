import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AdminUserView, DeviceView, PaginatedResult, UserRole } from '@bailo/shared';
import { api } from '../lib/api';
import { colors } from '../ui/theme';

const ROLE: Record<UserRole, string> = {
  OWNER: 'Propriétaire',
  MANAGER: 'Gérant',
  CARETAKER: 'Gardien',
};

/** « vu le 02/11 à 10:58 », ou « jamais » si l'appareil ne s'est pas encore manifesté. */
function seenLabel(iso: string | null): string {
  if (!iso) return 'jamais vu';
  const d = new Date(iso);
  const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `vu le ${date} à ${time}`;
}

/**
 * T15 — contrôle de l'équipe (propriétaire) : chaque membre, son rôle et ses appareils
 * connectés, avec les opérations encore en attente d'envoi. Écran en ligne : les données
 * viennent du serveur (membres et appareils ne sont pas dans la base locale du téléphone).
 */
export function EquipeScreen() {
  const [members, setMembers] = useState<AdminUserView[]>([]);
  const [devices, setDevices] = useState<DeviceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [users, devs] = await Promise.all([
        api.get<PaginatedResult<AdminUserView>>('/admin/users?pageSize=100'),
        api.get<DeviceView[]>('/devices'),
      ]);
      setMembers(users.items);
      setDevices(devs);
    } catch {
      setError('Connexion requise pour voir l’équipe. Réessayez en ligne.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const devicesByUser = useMemo(() => {
    const map = new Map<string, DeviceView[]>();
    for (const d of devices) {
      if (d.revokedAt) continue; // appareils déconnectés : on ne les liste plus
      const list = map.get(d.userId) ?? [];
      list.push(d);
      map.set(d.userId, list);
    }
    return map;
  }, [devices]);

  const active = useMemo(
    () => members.filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name)),
    [members],
  );

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
      >
        <Text style={s.title} accessibilityRole="header">
          Équipe
        </Text>

        {error ? (
          <View style={s.card}>
            <Text style={s.muted}>{error}</Text>
          </View>
        ) : loading && members.length === 0 ? (
          <Text style={s.muted}>Chargement…</Text>
        ) : active.length === 0 ? (
          <Text style={s.muted}>Aucun membre actif.</Text>
        ) : (
          active.map((m) => {
            const devs = devicesByUser.get(m.id) ?? [];
            const pending = devs.reduce((sum, d) => sum + d.pendingCount, 0);
            return (
              <View key={m.id} style={s.card}>
                <View style={s.head}>
                  <Text style={s.name}>{m.name}</Text>
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{ROLE[m.role]}</Text>
                  </View>
                </View>
                {m.sites.length > 0 ? (
                  <Text style={s.muted}>{m.sites.map((site) => site.name).join(' · ')}</Text>
                ) : null}

                {devs.length === 0 ? (
                  <Text style={s.small}>Aucun appareil connecté.</Text>
                ) : (
                  devs.map((d) => (
                    <View key={d.id} style={s.deviceRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.deviceName}>
                          {d.platform === 'ios' ? 'iPhone' : d.platform === 'android' ? 'Android' : d.platform}
                          {d.model ? ` · ${d.model}` : ''}
                        </Text>
                        <Text style={s.small}>{seenLabel(d.lastSeenAt)}</Text>
                      </View>
                      {d.pendingCount > 0 ? (
                        <View style={s.pendingBadge}>
                          <Text style={s.pendingText}>
                            {d.pendingCount} en attente
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ))
                )}
                {pending > 0 ? (
                  <Text style={s.small}>
                    {pending} opération{pending > 1 ? 's' : ''} à envoyer au total.
                  </Text>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  card: {
    gap: 6,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 17, fontWeight: '700', color: colors.text },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.brandSoft,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: colors.brand },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  deviceName: { fontSize: 15, color: colors.text },
  pendingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#FEF3C7',
  },
  pendingText: { fontSize: 12, fontWeight: '600', color: '#92400E' },
  muted: { fontSize: 14, color: colors.textSecondary },
  small: { fontSize: 12, color: colors.textSecondary },
});
