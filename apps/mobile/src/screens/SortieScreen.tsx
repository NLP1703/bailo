import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSiteData } from '../data/useSiteData';
import { useSession } from '../lib/session';
import { getSync } from '../sync/engine';
import { PrimaryButton, SyncBanner } from '../ui/components';
import { Card, Choices, Field } from '../ui/form';
import { formatFcfa, shortDate } from '../ui/format';
import { colors, touch } from '../ui/theme';
import { BackBar } from './FicheChambreScreen';

interface Retenue {
  amount: number;
  reason: string;
}

/** Date locale AAAA-MM-JJ, `daysAgo` jours avant aujourd'hui. */
function localDay(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DAY_OPTIONS: { value: '0' | '1' | '2'; label: string }[] = [
  { value: '0', label: 'Aujourd’hui' },
  { value: '1', label: 'Hier' },
  { value: '2', label: 'Avant-hier' },
];

/**
 * Sortie du locataire (gérant et propriétaire) : enregistrer un préavis puis clôturer
 * l'occupation, avec ou sans réseau. Le préavis et la clôture partent comme opérations
 * `occupancy.notice` / `occupancy.close` ; le serveur annule les loyers futurs et calcule
 * le décompte de caution (RG15 : caution − impayés − retenues). Les retenues portent un
 * motif obligatoire.
 */
export function SortieScreen({ occupancyId }: { occupancyId: string }) {
  const { units } = useSiteData();
  const { user } = useSession();
  const view = units.find((v) => v.occupancy?.id === occupancyId);
  const occ = view?.occupancy ?? null;

  const [day, setDay] = useState<'0' | '1' | '2'>('0');
  const [retenues, setRetenues] = useState<Retenue[]>([]);
  const [amountText, setAmountText] = useState('');
  const [reason, setReason] = useState('');
  const [noticeQueued, setNoticeQueued] = useState(false);
  const [busy, setBusy] = useState<null | 'notice' | 'close'>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!view || !occ) {
    return (
      <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
        <BackBar title="Sortie" />
        <Text style={[s.muted, { padding: 20 }]}>Occupation introuvable sur ce téléphone.</Text>
      </SafeAreaView>
    );
  }

  const siteId = view.unit.siteId;
  const tenantName = view.tenant?.name ?? 'Locataire';
  const retenuesTotal = retenues.reduce((sum, r) => sum + r.amount, 0);
  const amount = Number(amountText.replace(/\D/g, '')) || 0;
  const canAddRetenue = amount > 0 && reason.trim().length >= 2;
  const readOnly = !!user?.readOnly;

  const addRetenue = () => {
    if (!canAddRetenue) return;
    setRetenues((prev) => [...prev, { amount, reason: reason.trim() }]);
    setAmountText('');
    setReason('');
  };

  const enqueueNotice = async () => {
    setBusy('notice');
    setError(null);
    try {
      const { engine } = await getSync();
      await engine.enqueue({
        type: 'occupancy.notice',
        siteId,
        payload: { occupancyId, noticeDate: localDay(Number(day)) },
      });
      void engine.syncNow(siteId);
      setNoticeQueued(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible sur ce téléphone.');
    } finally {
      setBusy(null);
    }
  };

  const enqueueClose = async () => {
    setBusy('close');
    setError(null);
    try {
      const { engine } = await getSync();
      await engine.enqueue({
        type: 'occupancy.close',
        siteId,
        payload: { occupancyId, actualEndDate: localDay(Number(day)), retenues },
      });
      void engine.syncNow(siteId);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible sur ce téléphone.');
    } finally {
      setBusy(null);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
        <BackBar title="Sortie du locataire" />
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.doneIcon}>
            <Ionicons name="checkmark-circle" size={64} color={colors.success} />
          </View>
          <Text style={s.doneTitle}>Sortie enregistrée</Text>
          <Text style={s.doneText}>
            {tenantName} · chambre {view.unit.code}. La clôture part au serveur ; le décompte de
            caution (caution − impayés − retenues) sera calculé à la réception et visible sur la
            fiche du locataire.
          </Text>
          <PrimaryButton label="Retour" onPress={() => router.back()} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Occupation déjà clôturée : on montre le décompte renvoyé par le serveur, sans action.
  if (occ.status === 'CLOSED') {
    const cs = occ.closeSummary;
    return (
      <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
        <BackBar title="Sortie du locataire" />
        <ScrollView contentContainerStyle={s.content}>
          <Text style={s.subtitle}>
            {tenantName} · chambre {view.unit.code}
          </Text>
          <Card>
            <Text style={s.label}>
              Occupation clôturée{cs ? ` le ${shortDate(cs.actualEndDate)}` : ''}
            </Text>
            {cs ? (
              <>
                <Text style={[s.amount, { color: cs.refund >= 0 ? colors.success : colors.danger }]}>
                  {cs.refund >= 0 ? 'À rembourser ' : 'Reste dû '}
                  {formatFcfa(Math.abs(cs.refund))}
                </Text>
                <Text style={s.muted}>
                  Caution {formatFcfa(cs.depositPaid)} − impayés {formatFcfa(cs.unpaidTotal)} −
                  retenues {formatFcfa(cs.retenuesTotal)}
                </Text>
              </>
            ) : (
              <Text style={s.muted}>Décompte en attente de synchronisation.</Text>
            )}
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <BackBar title="Sortie du locataire" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <SyncBanner />

          <Text style={s.subtitle}>
            {tenantName} · chambre {view.unit.code} · depuis le {shortDate(occ.startDate)}
          </Text>
          {view.due > 0 ? (
            <Card tone="warning">
              <Text style={s.muted}>
                Impayés sur ce téléphone : <Text style={s.bold}>{formatFcfa(view.due)}</Text>. Ils
                seront déduits de la caution à la clôture.
              </Text>
            </Card>
          ) : null}

          <Text style={s.section}>Préavis (facultatif)</Text>
          {occ.status === 'NOTICE' ? (
            <Card>
              <Text style={s.muted}>
                Préavis déjà enregistré{occ.noticeDate ? ` le ${shortDate(occ.noticeDate)}` : ''}.
              </Text>
            </Card>
          ) : noticeQueued ? (
            <Card>
              <Text style={[s.muted, { color: colors.success }]}>
                ✓ Préavis enregistré, en attente d’envoi.
              </Text>
            </Card>
          ) : (
            <PrimaryButton
              label="Enregistrer le préavis"
              tone="outline"
              busy={busy === 'notice'}
              disabled={readOnly || busy !== null}
              onPress={() => void enqueueNotice()}
            />
          )}

          <Text style={s.section}>Clôture</Text>
          <Choices label="Date de sortie" options={DAY_OPTIONS} value={day} onChange={setDay} />

          <Text style={s.label}>Retenues sur la caution (motif obligatoire)</Text>
          {retenues.length > 0 ? (
            <Card>
              {retenues.map((r, i) => (
                <View key={i} style={[s.retenue, i > 0 && s.border]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.bold}>{formatFcfa(r.amount)}</Text>
                    <Text style={s.muted}>{r.reason}</Text>
                  </View>
                  <Pressable
                    onPress={() => setRetenues((prev) => prev.filter((_, j) => j !== i))}
                    accessibilityRole="button"
                    accessibilityLabel="Retirer cette retenue"
                    style={s.iconBtn}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </Pressable>
                </View>
              ))}
            </Card>
          ) : null}
          <Field
            label="Montant (FCFA)"
            value={amountText}
            onChangeText={(t) => setAmountText(t.replace(/\D/g, ''))}
            keyboardType="number-pad"
            placeholder="Ex. 5000"
          />
          <Field
            label="Motif"
            value={reason}
            onChangeText={setReason}
            placeholder="Ex. réparation mur, ménage"
          />
          <PrimaryButton
            label="Ajouter la retenue"
            tone="outline"
            disabled={!canAddRetenue}
            onPress={addRetenue}
          />

          <Card>
            <Text style={s.muted}>
              Total des retenues : <Text style={s.bold}>{formatFcfa(retenuesTotal)}</Text>. Le
              décompte final (caution − impayés − retenues) est calculé par le serveur.
            </Text>
          </Card>

          {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
          <PrimaryButton
            label="Clôturer la sortie"
            busy={busy === 'close'}
            disabled={readOnly || busy !== null}
            onPress={() => void enqueueClose()}
          />
          <Text style={s.hint}>Sans réseau : la sortie part dès le retour de la connexion.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  content: { padding: 20, gap: 14, paddingBottom: 48 },
  subtitle: { fontSize: 15, color: colors.textSecondary },
  section: { fontSize: 16, fontWeight: '600', color: colors.text, marginTop: 4 },
  label: { fontSize: 14, color: colors.textSecondary },
  amount: { fontSize: 26, fontWeight: '700', marginVertical: 4 },
  muted: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  bold: { fontWeight: '700', color: colors.text },
  retenue: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  border: { borderTopWidth: 1, borderTopColor: colors.border },
  iconBtn: {
    width: touch.min,
    height: touch.min,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
  doneIcon: { alignItems: 'center', marginTop: 24 },
  doneTitle: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center' },
  doneText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginBottom: 8 },
});
