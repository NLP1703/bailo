import type { ContractStatus, PaginatedResult } from '@bailo/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { formatFcfa, shortDate } from '../ui/format';
import { colors } from '../ui/theme';

export interface ContractRow {
  id: string;
  reference: string;
  status: ContractStatus;
  monthlyRent: number;
  deposit: number;
  startDate: string;
  durationMonths: number | null;
  noticeDays: number;
  signedAt: string | null;
  terminatedAt: string | null;
  terminationReason: string | null;
  tenant?: { name: string } | null;
}

/** Libellé et couleur de la pastille d'état (parité web). */
export const STATUS_META: Record<ContractStatus, { label: string; bg: string; fg: string }> = {
  DRAFT: { label: 'Brouillon', bg: '#E5E7EB', fg: '#374151' },
  PENDING_SIGNATURE: { label: 'À signer', bg: '#FEF3C7', fg: '#92400E' },
  SIGNED: { label: 'Signé', bg: '#D1FAE5', fg: '#065F46' },
  TERMINATED: { label: 'Résilié', bg: '#FEE2E2', fg: '#991B1B' },
};

export function StatusBadge({ status }: { status: ContractStatus }) {
  const m = STATUS_META[status];
  return (
    <View style={[s.badge, { backgroundColor: m.bg }]}>
      <Text style={[s.badgeText, { color: m.fg }]}>{m.label}</Text>
    </View>
  );
}

/**
 * LM5 — Contrats (propriétaire et gérant) : liste des contrats de bail avec leur état.
 * Écran en ligne (les contrats ne sont pas dans la base locale du téléphone) ; la gestion
 * complète (envoi pour signature, signature OTP, résiliation) est sur la fiche du contrat.
 */
export function ContratsScreen() {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get<PaginatedResult<ContractRow>>('/contracts?pageSize=100');
      setContracts(res.items);
    } catch {
      setError('Connexion requise pour voir les contrats. Réessayez en ligne.');
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
          Contrats
        </Text>

        {error ? (
          <View style={s.card}>
            <Text style={s.muted}>{error}</Text>
          </View>
        ) : loading && contracts.length === 0 ? (
          <Text style={s.muted}>Chargement…</Text>
        ) : contracts.length === 0 ? (
          <Text style={s.muted}>
            Aucun contrat. Créez-en un depuis la fiche d’un locataire ayant une occupation
            active (« Créer un contrat »).
          </Text>
        ) : (
          contracts.map((c) => (
            <Pressable
              key={c.id}
              onPress={() =>
                router.push({
                  pathname: '/contrat/[id]',
                  params: { id: c.id, tenant: c.tenant?.name ?? '' },
                })
              }
              accessibilityRole="button"
              style={s.card}
            >
              <View style={s.head}>
                <Text style={s.ref}>{c.reference}</Text>
                <StatusBadge status={c.status} />
              </View>
              <Text style={s.name}>{c.tenant?.name ?? 'Locataire'}</Text>
              <Text style={s.muted}>
                {formatFcfa(c.monthlyRent)} / mois · depuis le {shortDate(c.startDate)}
              </Text>
            </Pressable>
          ))
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
  ref: { fontSize: 15, fontWeight: '700', color: colors.text },
  name: { fontSize: 16, color: colors.text },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  muted: { fontSize: 14, color: colors.textSecondary },
});
