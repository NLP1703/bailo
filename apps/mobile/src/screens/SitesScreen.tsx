import type { ProrataMode, SiteType } from '@bailo/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { PrimaryButton } from '../ui/components';
import { Choices, Field } from '../ui/form';
import { colors } from '../ui/theme';

export interface SiteDetail {
  id: string;
  name: string;
  type: SiteType;
  city: string | null;
  district: string | null;
  landmark: string | null;
  graceDays: number;
  prorataMode: ProrataMode;
  reminderJm3: boolean;
  reminderJ0: boolean;
  reminderJp5: boolean;
  reminderJp15: boolean;
  penaltyEnabled: boolean;
  penaltyMode: 'FIXED' | 'PERCENT';
  penaltyValue: number;
  penaltyGraceDays: number;
}

export const SITE_TYPE_LABEL: Record<SiteType, string> = {
  CITE: 'Cité',
  IMMEUBLE: 'Immeuble',
  MIXTE: 'Mixte',
};

/**
 * LM5 — Sites (propriétaire et gérant) : liste des sites du compte et création d'un nouveau
 * site. Les réglages détaillés (relances, pénalités) et les blocs sont sur la fiche du site.
 * Écran en ligne.
 */
export function SitesScreen() {
  const { user } = useSession();
  const [sites, setSites] = useState<SiteDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<SiteType>('CITE');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [prorata, setProrata] = useState<ProrataMode>('FULL');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSites(await api.get<SiteDetail[]>('/sites'));
    } catch {
      setError('Connexion requise pour les sites. Réessayez en ligne.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/sites', {
        name: name.trim(),
        type,
        ...(city.trim() ? { city: city.trim() } : {}),
        ...(district.trim() ? { district: district.trim() } : {}),
        prorataMode: prorata,
      });
      setName('');
      setCity('');
      setDistrict('');
      setType('CITE');
      setProrata('FULL');
      setCreating(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Création impossible. Réessayez en ligne.');
    } finally {
      setBusy(false);
    }
  };

  const readOnly = !!user?.readOnly;

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.title} accessibilityRole="header">
          Sites
        </Text>

        {!readOnly ? (
          creating ? (
            <View style={s.card}>
              <Text style={s.sectionLabel}>Nouveau site</Text>
              <Field label="Nom" value={name} onChangeText={setName} placeholder="Ex. Cité des Palmiers" />
              <Choices
                label="Type"
                options={[
                  { value: 'CITE', label: 'Cité' },
                  { value: 'IMMEUBLE', label: 'Immeuble' },
                  { value: 'MIXTE', label: 'Mixte' },
                ]}
                value={type}
                onChange={setType}
              />
              <Field label="Ville (facultatif)" value={city} onChangeText={setCity} />
              <Field label="Quartier (facultatif)" value={district} onChangeText={setDistrict} />
              <Choices
                label="Prorata du 1er mois"
                options={[
                  { value: 'FULL', label: 'Mois entier' },
                  { value: 'PRORATA', label: 'Au prorata' },
                ]}
                value={prorata}
                onChange={setProrata}
              />
              {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
              <PrimaryButton
                label="Créer le site"
                busy={busy}
                disabled={name.trim().length < 2}
                onPress={() => void create()}
              />
              <PrimaryButton label="Annuler" tone="outline" onPress={() => setCreating(false)} />
            </View>
          ) : (
            <PrimaryButton label="Nouveau site" onPress={() => setCreating(true)} />
          )
        ) : null}

        {error && !creating ? (
          <View style={s.card}>
            <Text style={s.muted}>{error}</Text>
          </View>
        ) : loading && sites.length === 0 ? (
          <Text style={s.muted}>Chargement…</Text>
        ) : (
          sites.map((site) => (
            <Pressable
              key={site.id}
              onPress={() =>
                router.push({ pathname: '/site/[id]', params: { id: site.id, name: site.name } })
              }
              accessibilityRole="button"
              style={s.card}
            >
              <View style={s.head}>
                <Text style={s.name}>{site.name}</Text>
                <View style={s.badge}>
                  <Text style={s.badgeText}>{SITE_TYPE_LABEL[site.type]}</Text>
                </View>
              </View>
              <Text style={s.muted}>
                {[site.city, site.district].filter(Boolean).join(' · ') || 'Lieu non précisé'}
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
  sectionLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 17, fontWeight: '700', color: colors.text },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.brandSoft },
  badgeText: { fontSize: 12, fontWeight: '600', color: colors.brand },
  muted: { fontSize: 14, color: colors.textSecondary },
});
