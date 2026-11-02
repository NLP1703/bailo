import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAllSites } from '../data/useAllSites';
import { useSession } from '../lib/session';
import { useSyncState } from '../sync/useSync';
import { formatFcfa, monthLabel } from '../ui/format';
import { colors } from '../ui/theme';

/**
 * T13 — vue d'ensemble du propriétaire : encaissé, attendu, impayés et occupation de tous
 * ses sites, additionnés, puis le détail site par site. Données du téléphone (sans réseau).
 */
export function VueEnsembleScreen() {
  const { user } = useSession();
  const sync = useSyncState();
  const { sites, total, loading } = useAllSites();
  const month = monthLabel(new Date().getMonth() + 1);
  const occupancyRate = total.total ? Math.round((total.occupied / total.total) * 100) : 0;

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
            Vue d’ensemble
          </Text>
          <Text style={s.muted}>
            {user?.accountName ?? ''} ·{' '}
            {sites.length} site{sites.length > 1 ? 's' : ''}
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
          <Tile label="Encaissé aujourd’hui" value={formatFcfa(total.collectedToday)} hint={`${total.paymentsToday} paiement${total.paymentsToday > 1 ? 's' : ''}`} />
          <Tile label={`Encaissé en ${month}`} value={formatFcfa(total.collectedMonth)} hint={`sur ${formatFcfa(total.expectedMonth)} attendus`} />
          <Tile label={`Reste à encaisser (${month})`} value={formatFcfa(total.toCollectMonth)} hint={`${total.toCollectUnits} chambre${total.toCollectUnits > 1 ? 's' : ''}`} />
          <Tile label="Occupation" value={`${total.occupied} / ${total.total}`} hint={`${occupancyRate} %`} />
        </View>

        <View style={[s.tile, total.overdueUnits > 0 && s.danger]}>
          <Text style={s.small}>Impayés (tous sites)</Text>
          <Text style={[s.tileValue, total.overdueUnits > 0 && { color: colors.danger }]}>
            {formatFcfa(total.overdue)}
          </Text>
          <Text style={s.small}>
            {total.overdueUnits} chambre{total.overdueUnits > 1 ? 's' : ''} en retard
          </Text>
        </View>

        <Text style={s.section}>Par site</Text>
        {loading && sites.length === 0 ? (
          <Text style={s.muted}>Chargement…</Text>
        ) : sites.length === 0 ? (
          <Text style={s.muted}>Aucun site.</Text>
        ) : (
          sites.map((site) => (
            <View key={site.id} style={s.card}>
              <View style={s.cardHead}>
                <Text style={s.cardName}>{site.name || 'Site'}</Text>
                <Text style={s.cardOcc}>
                  {site.summary.occupied}/{site.summary.total} occupées
                </Text>
              </View>
              <View style={s.cardRow}>
                <Text style={s.muted}>Encaissé en {month}</Text>
                <Text style={s.cardValue}>{formatFcfa(site.summary.collectedMonth)}</Text>
              </View>
              <View style={s.cardRow}>
                <Text style={s.muted}>Reste à encaisser</Text>
                <Text style={s.cardValue}>{formatFcfa(site.summary.toCollectMonth)}</Text>
              </View>
              <View style={s.cardRow}>
                <Text style={s.muted}>Impayés</Text>
                <Text
                  style={[
                    s.cardValue,
                    site.summary.overdue > 0 && { color: colors.danger },
                  ]}
                >
                  {formatFcfa(site.summary.overdue)}
                </Text>
              </View>
            </View>
          ))
        )}
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
  danger: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  tileValue: { fontSize: 20, fontWeight: '700', color: colors.text },
  section: { fontSize: 16, fontWeight: '600', color: colors.text, marginTop: 6 },
  card: {
    gap: 6,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardOcc: { fontSize: 13, color: colors.textSecondary },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardValue: { fontSize: 15, fontWeight: '600', color: colors.text },
  muted: { fontSize: 14, color: colors.textSecondary },
  small: { fontSize: 12, color: colors.textSecondary },
});
