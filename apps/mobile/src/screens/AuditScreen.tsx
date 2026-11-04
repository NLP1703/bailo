import type { AuditEntryView, AuditListResult } from '@bailo/shared';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { PrimaryButton } from '../ui/components';
import { Choices } from '../ui/form';
import { colors } from '../ui/theme';
import { BackBar } from './FicheChambreScreen';

function stamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${date} à ${time}`;
}

/**
 * LM5 — Journal d'audit (propriétaire et gérant) : toutes les actions enregistrées sur le
 * compte, les plus récentes d'abord, avec pagination par curseur et un filtre « actions
 * sensibles ». Écran en ligne (lecture seule).
 */
export function AuditScreen() {
  const [items, setItems] = useState<AuditEntryView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [sensitiveOnly, setSensitiveOnly] = useState<'all' | 'sensitive'>('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (before: string | null) => {
      const qs = new URLSearchParams({ pageSize: '30' });
      if (sensitiveOnly === 'sensitive') qs.set('sensitiveOnly', 'true');
      if (before) qs.set('before', before);
      return api.get<AuditListResult>(`/admin/audit?${qs}`);
    },
    [sensitiveOnly],
  );

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetchPage(null);
      setItems(res.items);
      setCursor(res.nextCursor);
    } catch {
      setError('Connexion requise pour le journal d’audit. Réessayez en ligne.');
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await fetchPage(cursor);
      setItems((prev) => [...prev, ...res.items]);
      setCursor(res.nextCursor);
    } catch {
      setError('Chargement interrompu. Réessayez en ligne.');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <BackBar title="Journal d’audit" />
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
      >
        <Choices
          options={[
            { value: 'all', label: 'Tout' },
            { value: 'sensitive', label: 'Sensibles' },
          ]}
          value={sensitiveOnly}
          onChange={setSensitiveOnly}
        />

        {error ? (
          <View style={s.card}>
            <Text style={s.muted}>{error}</Text>
          </View>
        ) : loading && items.length === 0 ? (
          <Text style={s.muted}>Chargement…</Text>
        ) : items.length === 0 ? (
          <Text style={s.muted}>Aucune entrée.</Text>
        ) : (
          <>
            <View style={s.card}>
              {items.map((e, i) => (
                <View key={e.id} style={[s.row, i > 0 && s.border]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.action}>
                      {e.isRoleChange ? 'Changement de rôle' : e.action} · {e.entity}
                    </Text>
                    <Text style={s.small}>
                      {e.actorName ?? 'Système'} · {stamp(e.createdAt)}
                    </Text>
                    {e.reason ? <Text style={s.reason}>{e.reason}</Text> : null}
                  </View>
                  {e.sensitive ? (
                    <View style={s.badge}>
                      <Text style={s.badgeText}>sensible</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
            {cursor ? (
              <PrimaryButton
                label="Charger plus"
                tone="outline"
                busy={loadingMore}
                onPress={() => void loadMore()}
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  border: { borderTopWidth: 1, borderTopColor: colors.border },
  action: { fontSize: 15, color: colors.text, fontWeight: '600' },
  reason: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#FEE2E2',
  },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#991B1B' },
  muted: { fontSize: 14, color: colors.textSecondary },
  small: { fontSize: 12, color: colors.textSecondary },
});
