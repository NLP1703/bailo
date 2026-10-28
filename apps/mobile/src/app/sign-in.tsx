import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { ApiError } from '../lib/api';
import { DeviceLimitError, useSession } from '../lib/session';
import type { RegisteredDevice } from '../sync/engine';
import { PrimaryButton, Screen, styles, Title } from '../ui/components';
import { colors } from '../ui/theme';

/** Première connexion sur ce téléphone : téléphone ou e-mail + mot de passe (décision D4). */
export default function SignIn() {
  const { signIn, notice } = useSession();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<RegisteredDevice[] | null>(null);

  const submit = async (replaceDeviceId?: string) => {
    setError(null);
    if (!identifier.trim() || password.length < 8) {
      setError(
        'Saisissez votre téléphone ou e-mail et votre mot de passe (8 caractères au moins).',
      );
      return;
    }
    setBusy(true);
    try {
      await signIn(identifier, password, replaceDeviceId);
    } catch (e) {
      if (e instanceof DeviceLimitError) {
        setDevices(e.devices);
      } else if (e instanceof ApiError && (e.status === 401 || e.status === 400)) {
        setError('Identifiant ou mot de passe incorrect.');
      } else if (e instanceof ApiError && e.status === 429) {
        setError('Trop d’essais. Patientez quelques minutes.');
      } else {
        setError('Connexion impossible. Vérifiez votre réseau et réessayez.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, gap: 20, justifyContent: 'center' }}
      >
        <View style={{ alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              backgroundColor: colors.brand,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 30, fontWeight: '700' }}>B</Text>
          </View>
          <Title subtitle="Espace des bailleurs et de leurs équipes">Connexion à Bailo</Title>
        </View>
        {notice ? <Text style={[styles.cardText, { textAlign: 'center' }]}>{notice}</Text> : null}
        <View style={{ gap: 6 }}>
          <Text style={styles.label} nativeID="id-label">
            Téléphone ou e-mail
          </Text>
          <TextInput
            accessibilityLabelledBy="id-label"
            style={styles.input}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            autoComplete="username"
            keyboardType="email-address"
            placeholder="6 90 00 00 00"
          />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={styles.label} nativeID="pw-label">
            Mot de passe
          </Text>
          <TextInput
            accessibilityLabelledBy="pw-label"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            onSubmitEditing={() => void submit()}
          />
        </View>
        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        {devices ? (
          <View style={[styles.card, { gap: 10 }]}>
            <Text style={styles.label}>Deux téléphones sont déjà actifs sur ce compte</Text>
            <Text style={styles.cardText}>
              Choisissez celui à déconnecter pour utiliser celui-ci :
            </Text>
            {devices.map((d) => (
              <PrimaryButton
                key={d.id}
                tone="outline"
                label={`Déconnecter ${d.model ?? d.platform} (vu le ${new Date(d.lastSeenAt).toLocaleDateString('fr-FR')})`}
                onPress={() => void submit(d.id)}
                busy={busy}
              />
            ))}
          </View>
        ) : null}
        <PrimaryButton label="Se connecter" onPress={() => void submit()} busy={busy} />
        <Text style={[styles.subtitle, { textAlign: 'center' }]}>
          Les comptes sont créés par le bailleur. Mot de passe oublié : depuis le site Bailo.
        </Text>
      </KeyboardAvoidingView>
    </Screen>
  );
}
