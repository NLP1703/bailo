import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError } from '../lib/api';
import { PrimaryButton } from '../ui/components';
import { Card, Field } from '../ui/form';
import { ContractBody } from '../ui/ContractBody';
import { colors } from '../ui/theme';
import { BackBar } from './FicheChambreScreen';

interface Standard {
  bodyHtml: string;
  defaults: { monthlyRent: number; deposit: number; startDate: string };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * LM5 — Création d'un contrat (brouillon) à partir d'une occupation. Le serveur pré-remplit
 * le corps type et les montants depuis l'occupation ; le bailleur relit, ajuste, puis crée.
 * Écran en ligne. À l'ouverture depuis la fiche d'un locataire ayant une occupation active.
 */
export function ContratNouveauScreen({ occupancyId }: { occupancyId: string }) {
  const [tpl, setTpl] = useState<Standard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [monthlyRent, setMonthlyRent] = useState('');
  const [deposit, setDeposit] = useState('');
  const [startDate, setStartDate] = useState('');
  const [durationMonths, setDurationMonths] = useState('');
  const [noticeDays, setNoticeDays] = useState('30');
  const [bodyHtml, setBodyHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!occupancyId) {
      setLoadError('Aucune occupation. Ouvrez cet écran depuis la fiche d’un locataire actif.');
      return;
    }
    setLoadError(null);
    try {
      const s = await api.get<Standard>(`/contracts/standard-body/${occupancyId}`);
      setTpl(s);
      setMonthlyRent(String(s.defaults.monthlyRent));
      setDeposit(String(s.defaults.deposit));
      setStartDate(s.defaults.startDate);
      setBodyHtml(s.bodyHtml);
    } catch (e) {
      setLoadError(
        e instanceof ApiError ? e.message : 'Occupation introuvable ou connexion requise.',
      );
    }
  }, [occupancyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rent = Number(monthlyRent);
  const dep = Number(deposit);
  const notice = Number(noticeDays);
  const duration = durationMonths.trim() === '' ? null : Number(durationMonths);
  const valid =
    Number.isInteger(rent) &&
    rent > 0 &&
    Number.isInteger(dep) &&
    dep >= 0 &&
    ISO_DATE.test(startDate) &&
    Number.isInteger(notice) &&
    notice >= 0 &&
    notice <= 365 &&
    (duration === null || (Number.isInteger(duration) && duration >= 1 && duration <= 240)) &&
    bodyHtml.trim().length >= 50;

  const save = async () => {
    setError(null);
    if (!valid) {
      setError('Vérifiez les montants, la date (AAAA-MM-JJ) et le corps du contrat.');
      return;
    }
    setBusy(true);
    try {
      const c = await api.post<{ id: string }>('/contracts', {
        occupancyId,
        monthlyRent: rent,
        deposit: dep,
        startDate,
        durationMonths: duration,
        noticeDays: notice,
        bodyHtml,
      });
      router.replace({ pathname: '/contrat/[id]', params: { id: c.id } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Création impossible. Réessayez en ligne.');
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
        <BackBar title="Nouveau contrat" />
        <View style={{ padding: 20, gap: 12 }}>
          <Text style={s.muted}>{loadError}</Text>
          {occupancyId ? (
            <PrimaryButton label="Réessayer" tone="outline" onPress={() => void load()} />
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  if (!tpl) {
    return (
      <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
        <BackBar title="Nouveau contrat" />
        <Text style={[s.muted, { padding: 20 }]}>Chargement…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <BackBar title="Nouveau contrat" />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.muted}>
          Pré-rempli depuis l’occupation. Relisez puis créez le brouillon ; l’envoi pour
          signature se fait ensuite sur la fiche du contrat.
        </Text>

        <Card>
          <Field
            label="Loyer mensuel (FCFA)"
            value={monthlyRent}
            onChangeText={setMonthlyRent}
            keyboardType="number-pad"
          />
          <Field
            label="Caution (FCFA)"
            value={deposit}
            onChangeText={setDeposit}
            keyboardType="number-pad"
          />
          <Field
            label="Date de début (AAAA-MM-JJ)"
            value={startDate}
            onChangeText={setStartDate}
            autoCapitalize="none"
            placeholder="2026-01-01"
          />
          <Field
            label="Durée en mois (vide = indéterminée)"
            value={durationMonths}
            onChangeText={setDurationMonths}
            keyboardType="number-pad"
            placeholder="indéterminée"
          />
          <Field
            label="Préavis (jours)"
            value={noticeDays}
            onChangeText={setNoticeDays}
            keyboardType="number-pad"
          />
        </Card>

        <Card>
          <Text style={s.label}>Corps du contrat</Text>
          <Field
            label="HTML (modifiable)"
            value={bodyHtml}
            onChangeText={setBodyHtml}
            multiline
            style={s.html}
          />
          <PrimaryButton
            label="Réinitialiser depuis le modèle"
            tone="outline"
            onPress={() => setBodyHtml(tpl.bodyHtml)}
          />
          <PrimaryButton
            label={showPreview ? 'Masquer l’aperçu' : 'Prévisualiser le rendu'}
            tone="outline"
            onPress={() => setShowPreview((v) => !v)}
          />
          {showPreview ? (
            <View style={s.preview}>
              <ContractBody html={bodyHtml} />
            </View>
          ) : null}
        </Card>

        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

        <PrimaryButton
          label="Créer le brouillon"
          busy={busy}
          disabled={!valid || busy}
          onPress={() => void save()}
        />
        <PrimaryButton label="Annuler" tone="outline" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  content: { padding: 20, gap: 14, paddingBottom: 48 },
  muted: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  html: { minHeight: 200, paddingTop: 10, fontSize: 13, textAlignVertical: 'top' },
  preview: {
    marginTop: 4,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.ground,
  },
});
