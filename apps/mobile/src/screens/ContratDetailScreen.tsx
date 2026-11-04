import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { PrimaryButton } from '../ui/components';
import { Card, Field } from '../ui/form';
import { formatFcfa, shortDate } from '../ui/format';
import { colors } from '../ui/theme';
import { BackBar } from './FicheChambreScreen';
import { StatusBadge, type ContractRow } from './ContratsScreen';

/**
 * LM5 — fiche d'un contrat (propriétaire et gérant) : état, parties, montants, et les
 * actions du cycle de vie en ligne : envoyer le code de signature au locataire (e-mail),
 * signer en saisissant le code qu'il a reçu (OTP), résilier. Rendu entièrement en ligne ;
 * chaque action rafraîchit la fiche depuis le serveur.
 */
export function ContratDetailScreen({ id, tenantName }: { id: string; tenantName?: string }) {
  const { user } = useSession();
  const [contract, setContract] = useState<ContractRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [otp, setOtp] = useState('');
  const [signName, setSignName] = useState(tenantName ?? '');
  const [reason, setReason] = useState('');
  const [showTerminate, setShowTerminate] = useState(false);
  const [busy, setBusy] = useState<null | 'send' | 'sign' | 'terminate'>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setContract(await api.get<ContractRow>(`/contracts/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion requise pour voir ce contrat.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const readOnly = !!user?.readOnly;

  const run = async (
    kind: 'send' | 'sign' | 'terminate',
    call: () => Promise<unknown>,
  ): Promise<void> => {
    setBusy(kind);
    setError(null);
    try {
      await call();
      await load();
      setOtp('');
      setReason('');
      setShowTerminate(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action impossible. Réessayez en ligne.');
    } finally {
      setBusy(null);
    }
  };

  if (loading && !contract) {
    return (
      <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
        <BackBar title="Contrat" />
        <Text style={[s.muted, { padding: 20 }]}>Chargement…</Text>
      </SafeAreaView>
    );
  }

  if (!contract) {
    return (
      <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
        <BackBar title="Contrat" />
        <Text style={[s.muted, { padding: 20 }]}>{error ?? 'Contrat introuvable.'}</Text>
      </SafeAreaView>
    );
  }

  const c = contract;
  const canManage = !readOnly && busy === null;

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <BackBar title={c.reference} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.head}>
          <Text style={s.name}>{tenantName || c.tenant?.name || 'Locataire'}</Text>
          <StatusBadge status={c.status} />
        </View>

        <Card>
          <Row label="Loyer mensuel" value={formatFcfa(c.monthlyRent)} />
          <Row label="Caution" value={formatFcfa(c.deposit)} />
          <Row label="Début" value={shortDate(c.startDate)} />
          <Row
            label="Durée"
            value={c.durationMonths ? `${c.durationMonths} mois` : 'indéterminée'}
          />
          <Row label="Préavis" value={`${c.noticeDays} jours`} />
          {c.signedAt ? <Row label="Signé le" value={shortDate(c.signedAt)} /> : null}
          {c.terminatedAt ? (
            <Row label="Résilié le" value={shortDate(c.terminatedAt)} />
          ) : null}
          {c.terminationReason ? <Row label="Motif" value={c.terminationReason} /> : null}
        </Card>

        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

        {/* DRAFT : envoyer le code de signature au locataire (e-mail). */}
        {c.status === 'DRAFT' ? (
          <PrimaryButton
            label="Envoyer pour signature"
            busy={busy === 'send'}
            disabled={!canManage}
            onPress={() =>
              void run('send', () =>
                api.post(`/contracts/${id}/send-for-signature`, { channel: 'EMAIL' }),
              )
            }
          />
        ) : null}

        {/* PENDING_SIGNATURE : le gérant saisit le code reçu par le locataire. */}
        {c.status === 'PENDING_SIGNATURE' ? (
          <Card>
            <Text style={s.label}>Signer le contrat</Text>
            <Text style={s.muted}>
              Le locataire a reçu un code par e-mail. Saisissez-le avec lui pour signer.
            </Text>
            <Field
              label="Code reçu"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              placeholder="Code à 6 chiffres"
            />
            <Field
              label="Nom du locataire (signature)"
              value={signName}
              onChangeText={setSignName}
              placeholder="Nom et prénom"
            />
            <PrimaryButton
              label="Signer"
              busy={busy === 'sign'}
              disabled={!canManage || otp.trim().length < 4 || signName.trim().length < 2}
              onPress={() =>
                void run('sign', () =>
                  api.post(`/contracts/${id}/sign`, {
                    otpCode: otp.trim(),
                    tenantSignatureName: signName.trim(),
                  }),
                )
              }
            />
            <PrimaryButton
              label="Renvoyer le code"
              tone="outline"
              busy={busy === 'send'}
              disabled={!canManage}
              onPress={() =>
                void run('send', () =>
                  api.post(`/contracts/${id}/send-for-signature`, { channel: 'EMAIL' }),
                )
              }
            />
          </Card>
        ) : null}

        {/* Résiliation possible tant que le contrat n'est pas déjà résilié. */}
        {c.status !== 'TERMINATED' ? (
          showTerminate ? (
            <Card tone="danger">
              <Text style={s.label}>Résilier le contrat</Text>
              <Field
                label="Motif"
                value={reason}
                onChangeText={setReason}
                placeholder="Ex. départ anticipé, accord mutuel"
              />
              <PrimaryButton
                label="Confirmer la résiliation"
                tone="danger"
                busy={busy === 'terminate'}
                disabled={!canManage || reason.trim().length < 2}
                onPress={() =>
                  void run('terminate', () =>
                    api.post(`/contracts/${id}/terminate`, { reason: reason.trim() }),
                  )
                }
              />
              <PrimaryButton
                label="Annuler"
                tone="outline"
                onPress={() => setShowTerminate(false)}
              />
            </Card>
          ) : (
            <PrimaryButton
              label="Résilier le contrat"
              tone="outline"
              disabled={readOnly}
              onPress={() => setShowTerminate(true)}
            />
          )
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  content: { padding: 20, gap: 14, paddingBottom: 48 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 18, fontWeight: '700', color: colors.text, flex: 1 },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  muted: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: 12 },
  rowLabel: { fontSize: 14, color: colors.textSecondary },
  rowValue: { fontSize: 14, fontWeight: '600', color: colors.text, flexShrink: 1, textAlign: 'right' },
});
