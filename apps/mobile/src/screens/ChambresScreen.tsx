import Ionicons from '@expo/vector-icons/Ionicons';
import type { UnitColor } from '@bailo/shared';
import { diffDays } from '@bailo/shared';
import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSiteData } from '../data/useSiteData';
import type { UnitView } from '../data/types';
import { Screen, SyncBanner } from '../ui/components';
import { amountShort, UNIT_COLOR_STYLE } from '../ui/format';
import { colors, touch } from '../ui/theme';

type StatusFilter = 'ALL' | UnitColor;

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'ALL', label: 'Toutes' },
  { key: 'RED', label: 'En retard' },
  { key: 'ORANGE', label: 'Échéance proche' },
  { key: 'GREEN', label: 'À jour' },
  { key: 'GREY', label: 'Libres' },
];

/** Petit texte sous le numéro de chambre : ce qui compte pour agir. */
function tileHint(view: UnitView): string {
  if (view.color === 'BLUE') return view.unit.reservedFor ?? 'Réservée';
  if (!view.occupancy) return 'Libre';
  if (view.color === 'RED') return `−${amountShort(view.due)}`;
  if (view.color === 'ORANGE') {
    const next = view.openCharges[0];
    const days = next ? diffDays(new Date(), new Date(next.dueDate)) : 0;
    return days <= 0 ? 'Aujourd’hui' : `J−${days}`;
  }
  return 'À jour';
}

/**
 * T3 — plan des chambres en grille colorée (RG18), consultable sans réseau.
 * Commun aux trois rôles ; `headerAction` ajoute un bouton en haut (menu du gardien).
 */
export function ChambresScreen({ headerAction }: { headerAction?: ReactNode }) {
  const { units, tables, loading, empty } = useSiteData();
  const [query, setQuery] = useState('');
  const [block, setBlock] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const site = tables.sites[0];
  // Quatre cases par ligne (maquette T3) : largeur calculée, les pourcentages ne tenant
  // pas compte de l'espacement entre cases.
  const { width } = useWindowDimensions();
  const tileWidth = Math.floor((Math.min(width, 600) - 40 - 3 * 8) / 4);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return units.filter(
      (v) =>
        (block === null || v.unit.blockId === block) &&
        (status === 'ALL' || v.color === status) &&
        (!q ||
          v.unit.code.toLowerCase().includes(q) ||
          (v.tenant?.name.toLowerCase().includes(q) ?? false)),
    );
  }, [units, query, block, status]);

  const groups = useMemo(() => {
    const map = new Map<string, { title: string; items: UnitView[] }>();
    for (const v of filtered) {
      const key = v.block?.id ?? '';
      const title = v.block?.name ?? 'Sans bloc';
      if (!map.has(key)) map.set(key, { title, items: [] });
      map.get(key)!.items.push(v);
    }
    return [...map.values()];
  }, [filtered]);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      ALL: units.length,
      RED: 0,
      ORANGE: 0,
      GREEN: 0,
      GREY: 0,
      BLUE: 0,
    };
    for (const v of units) c[v.color] += 1;
    return c;
  }, [units]);

  return (
    <Screen padded={false}>
      <View style={s.header}>
        <SyncBanner />
        <View style={s.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.title} accessibilityRole="header">
              Chambres
            </Text>
            <Text style={s.subtitle}>
              {site ? `${site.name} · ${units.length} chambre${units.length > 1 ? 's' : ''}` : ' '}
            </Text>
          </View>
          {headerAction}
        </View>
        <View style={s.search}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Chambre ou locataire"
            placeholderTextColor={colors.textSecondary}
            style={s.searchInput}
            autoCorrect={false}
            accessibilityLabel="Rechercher une chambre ou un locataire"
          />
        </View>
        {tables.blocks.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chips}
          >
            <Chip label="Tous les blocs" active={block === null} onPress={() => setBlock(null)} />
            {[...tables.blocks]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((b) => (
                <Chip
                  key={b.id}
                  label={b.name}
                  active={block === b.id}
                  onPress={() => setBlock(b.id)}
                />
              ))}
          </ScrollView>
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chips}
        >
          {STATUS_FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={`${f.label} · ${counts[f.key]}`}
              active={status === f.key}
              dot={f.key === 'ALL' ? undefined : UNIT_COLOR_STYLE[f.key].fg}
              onPress={() => setStatus(f.key)}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {loading ? <Text style={s.muted}>Chargement…</Text> : null}
        {empty ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyTitle}>Aucune chambre sur ce téléphone</Text>
            <Text style={s.muted}>
              Les chambres arrivent à la première synchronisation : connectez-vous à Internet une
              fois, elles resteront ensuite consultables sans réseau.
            </Text>
          </View>
        ) : null}
        {!loading && !empty && filtered.length === 0 ? (
          <Text style={s.muted}>Aucune chambre ne correspond à la recherche.</Text>
        ) : null}
        {groups.map((g) => (
          <View key={g.title} style={{ gap: 8 }}>
            {groups.length > 1 || g.title !== 'Sans bloc' ? (
              <Text style={s.blockTitle}>{g.title.toUpperCase()}</Text>
            ) : null}
            <View style={s.grid}>
              {g.items.map((v) => {
                const c = UNIT_COLOR_STYLE[v.color];
                return (
                  <Pressable
                    key={v.unit.id}
                    onPress={() => router.push(`/chambre/${v.unit.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`Chambre ${v.unit.code}, ${c.label}${v.tenant ? `, ${v.tenant.name}` : ''}`}
                    style={({ pressed }) => [
                      s.tile,
                      { width: tileWidth, backgroundColor: c.bg },
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <Text style={[s.tileCode, { color: c.fg }]}>{v.unit.code}</Text>
                    <Text style={[s.tileHint, { color: c.fg }]} numberOfLines={1}>
                      {tileHint(v)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function Chip({
  label,
  active,
  onPress,
  dot,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  dot?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[s.chip, active && s.chipActive]}
    >
      {dot ? <View style={[s.dot, { backgroundColor: dot }]} /> : null}
      <Text style={[s.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textSecondary },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: touch.min,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 10 },
  chips: { gap: 8, paddingRight: 20 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 14, color: colors.text, fontWeight: '500' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  content: { padding: 20, paddingTop: 12, gap: 18, paddingBottom: 40 },
  blockTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    minHeight: 64,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tileCode: { fontSize: 17, fontWeight: '700' },
  tileHint: { fontSize: 12, fontWeight: '500' },
  muted: { fontSize: 15, color: colors.textSecondary, lineHeight: 21 },
  emptyCard: {
    gap: 6,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
});
