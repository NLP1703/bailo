import Ionicons from '@expo/vector-icons/Ionicons';
import type { MeterType } from '@bailo/shared';
import { useMemo, useState } from 'react';
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
import { isActive } from '../data/derive';
import type { MeterReadingRow, MeterRow, PendingMarker } from '../data/types';
import { useSiteData } from '../data/useSiteData';
import { useSession } from '../lib/session';
import { getSync } from '../sync/engine';
import { PhotoField } from '../ui/PhotoField';
import { queueShots, type Shot } from '../sync/photos';
import { PrimaryButton, SyncBanner } from '../ui/components';
import { Card, Choices, Field, PendingBadge } from '../ui/form';
import { amountShort, shortDate } from '../ui/format';
import { colors, touch } from '../ui/theme';
import { BackBar } from './FicheChambreScreen';

const TYPE_LABEL: Record<MeterType, string> = { WATER: 'Eau', ELECTRICITY: 'Électricité' };
const DEFAULT_UNIT: Record<MeterType, string> = { WATER: 'm³', ELECTRICITY: 'kWh' };

type Reading = MeterReadingRow & PendingMarker;

function unitOf(meter: MeterRow): string {
  return meter.unitLabel || DEFAULT_UNIT[meter.type];
}

function qty(value: number, meter: MeterRow): string {
  return `${amountShort(value)} ${unitOf(meter)}`;
}

/**
 * T10 — tournée de relevés : compteur par compteur dans l'ordre des chambres, index du
 * mois, contrôle RG19 (jamais inférieur au précédent), sans réseau.
 */
export function RelevesScreen({ standalone }: { standalone?: boolean }) {
  const { tables, siteId } = useSiteData();
  const { user } = useSession();
  const types = useMemo(
    () =>
      (['WATER', 'ELECTRICITY'] as MeterType[]).filter((t) =>
        tables.meters.some((m) => m.type === t && m.active),
      ),
    [tables.meters],
  );
  const [type, setType] = useState<MeterType | null>(null);
  const current = type ?? types[0] ?? null;
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [valueText, setValueText] = useState('');
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const month = new Date().toISOString().slice(0, 7);
  const units = useMemo(() => new Map(tables.units.map((u) => [u.id, u])), [tables.units]);
  const occupiedUnits = useMemo(
    () => new Set(tables.occupancies.filter(isActive).map((o) => o.unitId)),
    [tables.occupancies],
  );

  const tour = useMemo(() => {
    const meters = tables.meters
      .filter((m) => m.active && m.type === current)
      .sort((a, b) =>
        (units.get(a.unitId)?.code ?? '').localeCompare(units.get(b.unitId)?.code ?? '', 'fr', {
          numeric: true,
        }),
      );
    const last = new Map<string, Reading>();
    for (const r of [...tables.meter_readings].sort((a, b) => a.readAt.localeCompare(b.readAt))) {
      last.set(r.meterId, r);
    }
    const doneIds = new Set(
      meters.filter((m) => last.get(m.id)?.readAt.slice(0, 7) === month).map((m) => m.id),
    );
    return { meters, last, doneIds };
  }, [tables.meters, tables.meter_readings, current, units, month]);

  const meter =
    tour.meters.find((m) => m.id === pickedId) ??
    tour.meters.find((m) => !tour.doneIds.has(m.id)) ??
    null;
  const previous = meter ? tour.last.get(meter.id) : undefined;
  const value = valueText === '' ? null : Number(valueText);
  const decreased = value !== null && previous !== undefined && value < previous.value;
  const upcoming = tour.meters
    .filter((m) => m.id !== meter?.id && !tour.doneIds.has(m.id))
    .slice(0, 5);

  const submit = async () => {
    if (!meter || !siteId || value === null || decreased) return;
    setBusy(true);
    setError(null);
    try {
      const { engine } = await getSync();
      const op = await engine.enqueue({
        type: 'meterReading.create',
        siteId,
        payload: {
          meterId: meter.id,
          value,
          readAt: new Date().toISOString(),
          billOccupancy: true,
        },
      });
      queueShots(op.opId, siteId, 'meter-photo', shots);
      void engine.syncNow(siteId);
      setValueText('');
      setShots([]);
      setPickedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <SyncBanner />
      {!standalone ? (
        <Text style={s.title} accessibilityRole="header">
          Relevés
        </Text>
      ) : null}
      {types.length === 0 ? (
        <Card>
          <Text style={s.muted}>
            Aucun compteur sur ce site. Les compteurs se créent depuis le site Bailo (fiche de la
            chambre).
          </Text>
        </Card>
      ) : (
        <>
          {types.length > 1 ? (
            <Choices
              options={types.map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
              value={current}
              onChange={(t) => {
                setType(t);
                setPickedId(null);
                setValueText('');
              }}
            />
          ) : null}
          <View style={s.progressRow}>
            <Text style={s.section}>Tournée · {current ? TYPE_LABEL[current] : ''}</Text>
            <Text style={s.progress}>
              {tour.doneIds.size} / {tour.meters.length}
            </Text>
          </View>
          <View style={s.bar}>
            <View
              style={[
                s.barFill,
                {
                  width: `${tour.meters.length ? (tour.doneIds.size / tour.meters.length) * 100 : 0}%`,
                },
              ]}
            />
          </View>

          {meter ? (
            <Card>
              <Text style={s.meterTitle}>Chambre {units.get(meter.unitId)?.code ?? '—'}</Text>
              <Text style={s.muted}>
                {[TYPE_LABEL[meter.type], meter.identifier ? `n° ${meter.identifier}` : null]
                  .filter(Boolean)
                  .join(' · ')}
                {occupiedUnits.has(meter.unitId) ? '' : ' · chambre libre'}
              </Text>
              <View style={s.prevRow}>
                <Text style={s.muted}>
                  {previous
                    ? `Précédent (${shortDate(previous.readAt)})`
                    : 'Premier relevé de ce compteur'}
                </Text>
                {previous ? <Text style={s.prevValue}>{qty(previous.value, meter)}</Text> : null}
              </View>
              <Field
                label={`Nouvel index (${unitOf(meter)})`}
                value={valueText}
                onChangeText={(t) => setValueText(t.replace(/\D/g, ''))}
                keyboardType="number-pad"
                big
                error={
                  decreased && previous
                    ? `Index inférieur au précédent (${qty(previous.value, meter)}). Vérifiez le compteur avant de valider.`
                    : null
                }
                hint={
                  value !== null && previous && !decreased
                    ? `Consommation : ${qty(value - previous.value, meter)}`
                    : undefined
                }
              />
              <PhotoField
                label="Photo du compteur (facultatif)"
                shots={shots}
                onChange={setShots}
              />
              {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
              <PrimaryButton
                label="Valider et passer au suivant"
                onPress={() => void submit()}
                busy={busy}
                disabled={value === null || decreased || !!user?.readOnly}
              />
            </Card>
          ) : (
            <Card>
              <View style={{ alignItems: 'center', gap: 6, paddingVertical: 8 }}>
                <Ionicons name="checkmark-circle" size={44} color={colors.success} />
                <Text style={s.meterTitle}>Tournée terminée</Text>
                <Text style={s.muted}>
                  Tous les compteurs ont un relevé ce mois-ci. Les relevés partent dès que le réseau
                  est là ; la refacturation est calculée par le serveur.
                </Text>
              </View>
            </Card>
          )}

          {upcoming.length > 0 ? (
            <View style={{ gap: 8 }}>
              <Text style={s.section}>Ensuite</Text>
              <Card>
                {upcoming.map((m, i) => {
                  const r = tour.last.get(m.id);
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => {
                        setPickedId(m.id);
                        setValueText('');
                      }}
                      style={[s.nextRow, i > 0 && s.rowBorder]}
                      accessibilityRole="button"
                    >
                      <Text style={s.nextCode}>{units.get(m.unitId)?.code ?? '—'}</Text>
                      <Text style={s.nextInfo}>
                        {r ? `dernier ${qty(r.value, m)}` : 'jamais relevé'}
                        {occupiedUnits.has(m.unitId) ? '' : ' · libre'}
                      </Text>
                    </Pressable>
                  );
                })}
              </Card>
            </View>
          ) : null}

          {tour.doneIds.size > 0 ? (
            <View style={{ gap: 8 }}>
              <Text style={s.section}>Relevés de ce mois</Text>
              <Card>
                {tour.meters
                  .filter((m) => tour.doneIds.has(m.id))
                  .map((m, i) => {
                    const r = tour.last.get(m.id)!;
                    return (
                      <View key={m.id} style={[s.nextRow, i > 0 && s.rowBorder]}>
                        <Text style={s.nextCode}>{units.get(m.unitId)?.code ?? '—'}</Text>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={s.nextInfo}>
                            {qty(r.value, m)} · conso {qty(r.consumption, m)}
                          </Text>
                          {r.pending ? <PendingBadge /> : null}
                        </View>
                      </View>
                    );
                  })}
              </Card>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      {standalone ? <BackBar title="Relevés de compteurs" /> : null}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {body}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  section: { fontSize: 16, fontWeight: '600', color: colors.text },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progress: { fontSize: 16, fontWeight: '700', color: colors.brand },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: colors.brand },
  meterTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  prevRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 6,
  },
  prevValue: { fontSize: 18, fontWeight: '600', color: colors.text },
  muted: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: touch.min },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  nextCode: { width: 56, fontSize: 16, fontWeight: '700', color: colors.text },
  nextInfo: { flex: 1, fontSize: 15, color: colors.textSecondary },
});
