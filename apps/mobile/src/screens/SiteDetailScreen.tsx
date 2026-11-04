import type { PenaltyMode, ProrataMode } from '@bailo/shared';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, request } from '../lib/api';
import { useSession } from '../lib/session';
import { PrimaryButton } from '../ui/components';
import { Choices, Field } from '../ui/form';
import { colors } from '../ui/theme';
import { BackBar } from './FicheChambreScreen';
import type { SiteDetail } from './SitesScreen';

interface BlockRow {
  id: string;
  name: string;
  sortOrder: number;
}

function Toggle({
  label,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={s.toggleRow}>
      <Text style={s.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: colors.brand }}
      />
    </View>
  );
}

/**
 * LM5 — réglages d'un site (propriétaire et gérant) : coordonnées, prorata, jours de grâce,
 * relances automatiques, pénalités, et les blocs (bâtiments). Écran en ligne ; chaque
 * enregistrement envoie la mise à jour au serveur.
 */
export function SiteDetailScreen({ id, siteName }: { id: string; siteName?: string }) {
  const { user } = useSession();
  const [site, setSite] = useState<SiteDetail | null>(null);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Champs éditables
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [landmark, setLandmark] = useState('');
  const [graceText, setGraceText] = useState('0');
  const [prorata, setProrata] = useState<ProrataMode>('FULL');
  const [rJm3, setRJm3] = useState(false);
  const [rJ0, setRJ0] = useState(false);
  const [rJp5, setRJp5] = useState(false);
  const [rJp15, setRJp15] = useState(false);
  const [penalty, setPenalty] = useState(false);
  const [penaltyMode, setPenaltyMode] = useState<PenaltyMode>('FIXED');
  const [penaltyValueText, setPenaltyValueText] = useState('0');
  const [penaltyGraceText, setPenaltyGraceText] = useState('0');

  const [busy, setBusy] = useState(false);
  const [blockName, setBlockName] = useState('');
  const [addingBlock, setAddingBlock] = useState(false);

  const fill = (x: SiteDetail) => {
    setName(x.name);
    setCity(x.city ?? '');
    setDistrict(x.district ?? '');
    setLandmark(x.landmark ?? '');
    setGraceText(String(x.graceDays));
    setProrata(x.prorataMode);
    setRJm3(x.reminderJm3);
    setRJ0(x.reminderJ0);
    setRJp5(x.reminderJp5);
    setRJp15(x.reminderJp15);
    setPenalty(x.penaltyEnabled);
    setPenaltyMode(x.penaltyMode);
    setPenaltyValueText(String(x.penaltyValue));
    setPenaltyGraceText(String(x.penaltyGraceDays));
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const [all, bl] = await Promise.all([
        api.get<SiteDetail[]>('/sites'),
        api.get<BlockRow[]>(`/sites/${id}/blocks`),
      ]);
      const found = all.find((x) => x.id === id) ?? null;
      setSite(found);
      if (found) fill(found);
      setBlocks(bl);
    } catch {
      setError('Connexion requise pour ce site. Réessayez en ligne.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const readOnly = !!user?.readOnly;

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await request('PATCH', `/sites/${id}`, {
        name: name.trim(),
        city: city.trim(),
        district: district.trim(),
        landmark: landmark.trim(),
        graceDays: Number(graceText.replace(/\D/g, '')) || 0,
        prorataMode: prorata,
        reminderJm3: rJm3,
        reminderJ0: rJ0,
        reminderJp5: rJp5,
        reminderJp15: rJp15,
        penaltyEnabled: penalty,
        penaltyMode,
        penaltyValue: Number(penaltyValueText.replace(/\D/g, '')) || 0,
        penaltyGraceDays: Number(penaltyGraceText.replace(/\D/g, '')) || 0,
      });
      setSaved(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible. Réessayez en ligne.');
    } finally {
      setBusy(false);
    }
  };

  const addBlock = async () => {
    if (blockName.trim().length < 1) return;
    setAddingBlock(true);
    setError(null);
    try {
      await api.post(`/sites/${id}/blocks`, { name: blockName.trim(), sortOrder: blocks.length });
      setBlockName('');
      const bl = await api.get<BlockRow[]>(`/sites/${id}/blocks`);
      setBlocks(bl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ajout du bloc impossible.');
    } finally {
      setAddingBlock(false);
    }
  };

  if (loading && !site) {
    return (
      <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
        <BackBar title={siteName ?? 'Site'} />
        <Text style={[s.muted, { padding: 20 }]}>Chargement…</Text>
      </SafeAreaView>
    );
  }

  if (!site) {
    return (
      <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
        <BackBar title={siteName ?? 'Site'} />
        <Text style={[s.muted, { padding: 20 }]}>{error ?? 'Site introuvable.'}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <BackBar title={site.name} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.sectionLabel}>Coordonnées</Text>
        <Field label="Nom" value={name} onChangeText={setName} />
        <Field label="Ville" value={city} onChangeText={setCity} />
        <Field label="Quartier" value={district} onChangeText={setDistrict} />
        <Field label="Point de repère" value={landmark} onChangeText={setLandmark} />

        <Text style={s.sectionLabel}>Facturation</Text>
        <Field
          label="Jours de grâce"
          value={graceText}
          onChangeText={(t) => setGraceText(t.replace(/\D/g, '').slice(0, 2))}
          keyboardType="number-pad"
        />
        <Choices
          label="Prorata du 1er mois"
          options={[
            { value: 'FULL', label: 'Mois entier' },
            { value: 'PRORATA', label: 'Au prorata' },
          ]}
          value={prorata}
          onChange={setProrata}
        />

        <Text style={s.sectionLabel}>Relances automatiques</Text>
        <View style={s.card}>
          <Toggle label="3 jours avant l’échéance" value={rJm3} onValueChange={setRJm3} disabled={readOnly} />
          <Toggle label="Le jour de l’échéance" value={rJ0} onValueChange={setRJ0} disabled={readOnly} />
          <Toggle label="5 jours après" value={rJp5} onValueChange={setRJp5} disabled={readOnly} />
          <Toggle label="15 jours après" value={rJp15} onValueChange={setRJp15} disabled={readOnly} />
        </View>

        <Text style={s.sectionLabel}>Pénalités de retard</Text>
        <View style={s.card}>
          <Toggle label="Activer les pénalités" value={penalty} onValueChange={setPenalty} disabled={readOnly} />
        </View>
        {penalty ? (
          <>
            <Choices
              label="Type de pénalité"
              options={[
                { value: 'FIXED', label: 'Montant fixe' },
                { value: 'PERCENT', label: 'Pourcentage' },
              ]}
              value={penaltyMode}
              onChange={setPenaltyMode}
            />
            <Field
              label={penaltyMode === 'PERCENT' ? 'Pourcentage (%)' : 'Montant (FCFA)'}
              value={penaltyValueText}
              onChangeText={(t) => setPenaltyValueText(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
            />
            <Field
              label="Jours de grâce avant pénalité"
              value={penaltyGraceText}
              onChangeText={(t) => setPenaltyGraceText(t.replace(/\D/g, '').slice(0, 2))}
              keyboardType="number-pad"
            />
          </>
        ) : null}

        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
        {saved ? <Text style={{ color: colors.success }}>✓ Réglages enregistrés.</Text> : null}
        <PrimaryButton
          label="Enregistrer les réglages"
          busy={busy}
          disabled={readOnly || name.trim().length < 2}
          onPress={() => void save()}
        />

        <Text style={s.sectionLabel}>Blocs (bâtiments)</Text>
        {blocks.length > 0 ? (
          <View style={s.card}>
            {blocks.map((b, i) => (
              <View key={b.id} style={[s.blockRow, i > 0 && s.border]}>
                <Text style={s.blockName}>{b.name}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.muted}>Aucun bloc. Les chambres sans bloc restent regroupées.</Text>
        )}
        {!readOnly ? (
          <View style={s.card}>
            <Field
              label="Nouveau bloc"
              value={blockName}
              onChangeText={setBlockName}
              placeholder="Ex. Bâtiment A"
            />
            <PrimaryButton
              label="Ajouter le bloc"
              tone="outline"
              busy={addingBlock}
              disabled={blockName.trim().length < 1}
              onPress={() => void addBlock()}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  content: { padding: 20, gap: 12, paddingBottom: 48 },
  sectionLabel: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 6 },
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  toggleLabel: { fontSize: 15, color: colors.text, flex: 1, paddingRight: 12 },
  blockRow: { paddingVertical: 10 },
  border: { borderTopWidth: 1, borderTopColor: colors.border },
  blockName: { fontSize: 15, color: colors.text },
  muted: { fontSize: 14, color: colors.textSecondary },
});
