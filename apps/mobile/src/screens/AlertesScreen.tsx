import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAlerts, type AlertKind } from '../data/useAlerts';
import { colors } from '../ui/theme';

const KIND: Record<
  AlertKind,
  { icon: 'checkmark-circle' | 'close-circle' | 'wallet' | 'construct'; color: string }
> = {
  payment: { icon: 'checkmark-circle', color: colors.success },
  void: { icon: 'close-circle', color: colors.danger },
  variance: { icon: 'wallet', color: '#B45309' },
  ticket: { icon: 'construct', color: colors.danger },
};

/** « 02/11 à 10:58 ». */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${date} à ${time}`;
}

/**
 * T16 — alertes du propriétaire : paiements reçus, écarts de caisse, pannes urgentes et
 * annulations de tous ses sites, par ordre chronologique. Consultable sans réseau.
 */
export function AlertesScreen() {
  const { alerts, loading } = useAlerts();

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title} accessibilityRole="header">
          Alertes
        </Text>

        {loading && alerts.length === 0 ? (
          <Text style={s.muted}>Chargement…</Text>
        ) : alerts.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>Rien à signaler</Text>
            <Text style={s.muted}>
              Paiements, écarts de caisse, pannes urgentes et annulations apparaîtront ici.
            </Text>
          </View>
        ) : (
          alerts.map((a) => {
            const k = KIND[a.kind];
            return (
              <View key={a.id} style={s.row}>
                <Ionicons name={k.icon} size={24} color={k.color} />
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{a.title}</Text>
                  <Text style={s.muted}>{a.detail}</Text>
                  <Text style={s.small}>
                    {a.siteName ? `${a.siteName} · ` : ''}
                    {whenLabel(a.at)}
                  </Text>
                </View>
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
  content: { padding: 20, gap: 10, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  empty: { alignItems: 'center', gap: 6, marginTop: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  muted: { fontSize: 14, color: colors.textSecondary },
  small: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
