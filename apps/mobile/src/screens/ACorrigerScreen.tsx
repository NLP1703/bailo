import type { RejectedOperation } from '@bailo/sync';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSiteData } from '../data/useSiteData';
import { getSync } from '../sync/engine';
import { useSyncState } from '../sync/useSync';
import { PrimaryButton } from '../ui/components';
import { Card } from '../ui/form';
import { formatFcfa, shortDate } from '../ui/format';
import { colors } from '../ui/theme';
import { BackBar } from './FicheChambreScreen';

/**
 * T16 — opérations refusées par le serveur (RGM6) : rien ne se perd, l'utilisateur
 * refait la saisie ou l'abandonne. Le refus reste aussi visible du propriétaire.
 */
export function ACorrigerScreen() {
  const { tables } = useSiteData();
  const sync = useSyncState();
  const [items, setItems] = useState<RejectedOperation[] | null>(null);

  const load = useCallback(() => {
    void getSync()
      .then(({ outbox }) => outbox.listToFix())
      .then(setItems)
      .catch(() => setItems([]));
  }, []);
  useEffect(load, [load, sync.pendingCount, sync.lastSuccessAt]);

  const unitOfOccupancy = useMemo(() => {
    const codes = new Map(tables.units.map((u) => [u.id, u]));
    return new Map(tables.occupancies.map((o) => [o.id, codes.get(o.unitId)]));
  }, [tables.units, tables.occupancies]);
  const unitOfMeter = useMemo(() => {
    const codes = new Map(tables.units.map((u) => [u.id, u.code]));
    return new Map(tables.meters.map((m) => [m.id, codes.get(m.unitId)]));
  }, [tables.units, tables.meters]);

  const describe = (item: RejectedOperation): { title: string; redo: Href } => {
    const p = item.op.payload as Record<string, unknown>;
    switch (item.op.type) {
      case 'payment.create': {
        const unit = unitOfOccupancy.get(String(p.occupancyId));
        return {
          title: `Paiement ${unit?.code ?? ''} · ${formatFcfa(Number(p.amount ?? 0))}`,
          redo: unit ? { pathname: '/encaisser', params: { unitId: unit.id } } : '/encaisser',
        };
      }
      case 'meterReading.create':
        return {
          title: `Relevé ${unitOfMeter.get(String(p.meterId)) ?? ''} · index ${String(p.value)}`,
          redo: '/releves',
        };
      case 'ticket.create':
        return { title: `Panne · ${String(p.title ?? '')}`, redo: '/pannes' };
      case 'expense.create':
        return {
          title: `Dépense · ${String(p.label ?? '')} · ${formatFcfa(Number(p.amount ?? 0))}`,
          redo: '/depense',
        };
      case 'cashHandover.create':
        return {
          title: `Remise de caisse · ${formatFcfa(Number(p.handedAmount ?? 0))}`,
          redo: '/caisse',
        };
      default:
        return { title: item.op.type, redo: '/' };
    }
  };

  const remove = async (opId: string) => {
    const { outbox } = await getSync();
    await outbox.removeToFix(opId);
    load();
  };

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <BackBar title="À corriger" />
      <ScrollView contentContainerStyle={s.content}>
        {items === null ? <Text style={s.muted}>Chargement…</Text> : null}
        {items?.length === 0 ? (
          <Card>
            <Text style={s.muted}>
              Aucune opération refusée : tout ce qui a été saisi est arrivé.
            </Text>
          </Card>
        ) : null}
        {items?.map((item) => {
          const { title, redo } = describe(item);
          return (
            <Card key={item.op.opId} tone="danger">
              <Text style={s.title}>{title}</Text>
              <Text style={s.small}>
                saisi le {shortDate(item.op.createdAt)} · refusé le {shortDate(item.rejectedAt)}
              </Text>
              <Text style={s.reason}>Refusé par le serveur : {item.message}</Text>
              <View style={s.actions}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    label="Refaire"
                    onPress={() => {
                      void remove(item.op.opId).then(() => router.push(redo));
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    label="Abandonner"
                    tone="outline"
                    onPress={() =>
                      Alert.alert('Abandonner cette saisie ?', title, [
                        { text: 'Garder', style: 'cancel' },
                        {
                          text: 'Abandonner',
                          style: 'destructive',
                          onPress: () => void remove(item.op.opId),
                        },
                      ])
                    }
                  />
                </View>
              </View>
            </Card>
          );
        })}
        {items && items.length > 0 ? (
          <Text style={s.small}>
            Visible aussi par le propriétaire. Rien n’est supprimé sans votre action.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  reason: { fontSize: 14, color: colors.danger, lineHeight: 20 },
  muted: { fontSize: 14, color: colors.textSecondary },
  small: { fontSize: 12, color: colors.textSecondary },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
});
