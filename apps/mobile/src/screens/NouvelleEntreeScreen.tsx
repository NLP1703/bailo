import Ionicons from '@expo/vector-icons/Ionicons';
import type { PaymentMode } from '@bailo/shared';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import type { UnitView } from '../data/types';
import { useSiteData } from '../data/useSiteData';
import { useSession } from '../lib/session';
import { getSync } from '../sync/engine';
import { queueShots, type Shot } from '../sync/photos';
import { PhotoField } from '../ui/PhotoField';
import { PrimaryButton, SyncBanner } from '../ui/components';
import { Card, Choices, Field } from '../ui/form';
import { formatFcfa } from '../ui/format';
import { colors, touch } from '../ui/theme';
import { BackBar } from './FicheChambreScreen';

const MODES: PaymentMode[] = ['ESPECES', 'ORANGE_MONEY', 'MTN_MOMO', 'VIREMENT'];

const ID_TYPES = [
  { value: 'CNI', label: 'CNI' },
  { value: 'Passeport', label: 'Passeport' },
  { value: 'Autre', label: 'Autre' },
] as const;

/** Date locale AAAA-MM-JJ, `daysAgo` jours avant aujourd'hui. */
function localDay(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface Done {
  unitCode: string;
  tenantName: string;
}

/**
 * T6 — nouvelle entrée (gérant et propriétaire) : créer le locataire puis son occupation
 * sur une chambre libre, avec ou sans réseau. Les deux opérations partent à la suite ; la
 * photo de la pièce d'identité suit le locataire (§ 6). L'affectation à l'entrée (caution
 * et avance) et les échéances sont calculées par le serveur à la réception.
 */
export function NouvelleEntreeScreen({ unitId }: { unitId?: string }) {
  const { units, siteId } = useSiteData();
  const { user } = useSession();
  const free = useMemo(() => units.filter((v) => !v.occupancy), [units]);
  const [selectedId, setSelectedId] = useState<string | null>(unitId ?? null);
  const [query, setQuery] = useState('');

  // Locataire
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [job, setJob] = useState('');
  const [idType, setIdType] = useState<(typeof ID_TYPES)[number]['value'] | null>(null);
  const [idNumber, setIdNumber] = useState('');
  const [idShots, setIdShots] = useState<Shot[]>([]);

  // Bail
  const [rentText, setRentText] = useState('');
  const [dueDayText, setDueDayText] = useState('5');
  const [depositText, setDepositText] = useState('');
  const [advanceText, setAdvanceText] = useState('');
  const [mode, setMode] = useState<PaymentMode>('ESPECES');
  const [day, setDay] = useState<'0' | '1' | '2'>('0');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const view: UnitView | undefined = free.find((v) => v.unit.id === selectedId);

  // Loyer proposé : le loyer de référence de la chambre, au choix de la chambre seulement.
  const viewId = view?.unit.id;
  const baseRent = view?.unit.baseRent ?? 0;
  useEffect(() => {
    if (viewId) setRentText(baseRent > 0 ? String(baseRent) : '');
  }, [viewId]);

  const rent = Number(rentText.replace(/\D/g, '')) || 0;
  const dueDay = Number(dueDayText) || 0;
  const deposit = Number(depositText.replace(/\D/g, '')) || 0;
  const advanceMonths = Number(advanceText.replace(/\D/g, '')) || 0;
  const opening = deposit + advanceMonths * rent;

  const validTenant = name.trim().length >= 2;
  const validLease = !!view && rent > 0 && dueDay >= 1 && dueDay <= 28;
  const valid = validTenant && validLease;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? free.filter(
          (v) =>
            v.unit.code.toLowerCase().includes(q) ||
            (v.block?.name.toLowerCase().includes(q) ?? false),
        )
      : free;
    return [...list].sort((a, b) => a.unit.code.localeCompare(b.unit.code)).slice(0, 30);
  }, [free, query]);

  const submit = async () => {
    if (!siteId || !view || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const { engine } = await getSync();
      // 1. Le locataire. La photo de la pièce le suit (rattachée par son opId).
      const tenantOp = await engine.enqueue({
        type: 'tenant.create',
        siteId,
        payload: {
          name: name.trim(),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          ...(job.trim() ? { occupation: job.trim() } : {}),
          ...(idType ? { idDocType: idType } : {}),
          ...(idNumber.trim() ? { idDocNumber: idNumber.trim() } : {}),
        },
      });
      // 2. L'occupation, qui référence le locataire par son opId (pas encore d'id serveur).
      await engine.enqueue({
        type: 'occupancy.create',
        siteId,
        payload: {
          unitId: view.unit.id,
          tenantOpId: tenantOp.opId,
          startDate: localDay(Number(day)),
          monthlyRent: rent,
          dueDay,
          deposit,
          ...(advanceMonths > 0 ? { advance: { months: advanceMonths } } : {}),
          paymentMode: mode,
        },
      });
      queueShots(tenantOp.opId, siteId, 'tenant-id', idShots);
      void engine.syncNow(siteId);
      setDone({ unitCode: view.unit.code, tenantName: name.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible sur ce téléphone.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setDone(null);
    setSelectedId(null);
    setQuery('');
    setName('');
    setPhone('');
    setJob('');
    setIdType(null);
    setIdNumber('');
    setIdShots([]);
    setRentText('');
    setDueDayText('5');
    setDepositText('');
    setAdvanceText('');
    setMode('ESPECES');
    setDay('0');
  };

  if (done) {
    return (
      <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
        <BackBar title="Nouvelle entrée" />
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.doneIcon}>
            <Ionicons name="checkmark-circle" size={64} color={colors.success} />
          </View>
          <Text style={s.doneTitle}>Entrée enregistrée</Text>
          <Text style={s.doneText}>
            {done.tenantName} · chambre {done.unitCode}. L’occupation et les échéances partent au
            serveur ; vous pourrez encaisser dès qu’elle est acceptée.
          </Text>
          <PrimaryButton label="Nouvelle entrée" onPress={reset} />
          <PrimaryButton label="Retour" tone="outline" onPress={() => router.back()} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <BackBar title="Nouvelle entrée" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <SyncBanner />

          <Text style={s.section}>Chambre</Text>
          {view ? (
            <Pressable style={s.selected} onPress={() => setSelectedId(null)}>
              <View style={{ flex: 1 }}>
                <Text style={s.selectedCode}>
                  {view.unit.code}
                  {view.block ? ` · ${view.block.name}` : ''}
                </Text>
                <Text style={s.muted}>
                  Loyer de référence {formatFcfa(view.unit.baseRent)} / mois
                </Text>
              </View>
              <Text style={s.change}>Changer</Text>
            </Pressable>
          ) : (
            <>
              <Field
                label=""
                value={query}
                onChangeText={setQuery}
                placeholder="Numéro de chambre ou bloc"
              />
              <Card>
                {matches.length === 0 ? (
                  <Text style={s.muted}>Aucune chambre libre.</Text>
                ) : (
                  matches.map((v, i) => (
                    <Pressable
                      key={v.unit.id}
                      style={[s.row, i > 0 && s.rowBorder]}
                      onPress={() => setSelectedId(v.unit.id)}
                    >
                      <Text style={s.rowCode}>{v.unit.code}</Text>
                      <Text style={s.muted}>{v.block?.name ?? '—'}</Text>
                    </Pressable>
                  ))
                )}
              </Card>
            </>
          )}

          {view ? (
            <>
              <Text style={s.section}>Locataire</Text>
              <Field label="Nom" value={name} onChangeText={setName} placeholder="Nom et prénom" />
              <Field
                label="Téléphone (facultatif)"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="6 90 00 00 00"
              />
              <Field
                label="Profession ou école (facultatif)"
                value={job}
                onChangeText={setJob}
                placeholder="Ex. étudiant, commerçant"
              />
              <Choices
                label="Type de pièce (facultatif)"
                options={ID_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                value={idType}
                onChange={setIdType}
              />
              <Field
                label="N° de pièce (facultatif)"
                value={idNumber}
                onChangeText={setIdNumber}
                placeholder="Numéro de la pièce"
              />
              <PhotoField
                label="Photo de la pièce d’identité (facultatif)"
                shots={idShots}
                onChange={setIdShots}
              />

              <Text style={s.section}>Bail</Text>
              <Field
                label="Loyer mensuel (FCFA)"
                value={rentText}
                onChangeText={(t) => setRentText(t.replace(/\D/g, ''))}
                keyboardType="number-pad"
                big
              />
              <Field
                label="Jour d’échéance (1 à 28)"
                value={dueDayText}
                onChangeText={(t) => setDueDayText(t.replace(/\D/g, '').slice(0, 2))}
                keyboardType="number-pad"
              />
              <Field
                label="Caution (FCFA, facultatif)"
                value={depositText}
                onChangeText={(t) => setDepositText(t.replace(/\D/g, ''))}
                keyboardType="number-pad"
              />
              <Field
                label="Avance (mois de loyer, facultatif)"
                value={advanceText}
                onChangeText={(t) => setAdvanceText(t.replace(/\D/g, '').slice(0, 2))}
                keyboardType="number-pad"
              />
              <Choices
                label="Date d’entrée"
                options={[
                  { value: '0', label: 'Aujourd’hui' },
                  { value: '1', label: 'Hier' },
                  { value: '2', label: 'Avant-hier' },
                ]}
                value={day}
                onChange={setDay}
              />
              {opening > 0 ? (
                <>
                  <Choices
                    label="Mode de paiement (à l’entrée)"
                    options={MODES.map((m) => ({ value: m, label: PAYMENT_MODE_SHORT[m] }))}
                    value={mode}
                    onChange={setMode}
                  />
                  <Card>
                    <Text style={s.muted}>
                      À encaisser à l’entrée (caution + avance) :{' '}
                      <Text style={s.openingAmount}>{formatFcfa(opening)}</Text>
                    </Text>
                  </Card>
                </>
              ) : null}

              {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
              <PrimaryButton
                label="Enregistrer l’entrée"
                onPress={() => void submit()}
                busy={busy}
                disabled={!valid || !!user?.readOnly}
              />
              <Text style={s.hint}>
                Sans réseau : l’entrée part dès le retour de la connexion.
              </Text>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const PAYMENT_MODE_SHORT: Record<PaymentMode, string> = {
  ESPECES: 'Espèces',
  ORANGE_MONEY: 'Orange Money',
  MTN_MOMO: 'MTN MoMo',
  VIREMENT: 'Virement',
  AUTRE: 'Autre',
};

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  content: { padding: 20, gap: 14, paddingBottom: 48 },
  section: { fontSize: 16, fontWeight: '600', color: colors.text, marginTop: 4 },
  muted: { fontSize: 13, color: colors.textSecondary },
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.brand,
    backgroundColor: '#ECFDF5',
  },
  selectedCode: { fontSize: 18, fontWeight: '700', color: colors.text },
  change: { fontSize: 15, fontWeight: '600', color: colors.brand },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    minHeight: touch.min,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowCode: { fontSize: 16, fontWeight: '700', color: colors.text },
  openingAmount: { fontWeight: '700', color: colors.text },
  hint: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
  doneIcon: { alignItems: 'center', marginTop: 24 },
  doneTitle: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center' },
  doneText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginBottom: 8 },
});
