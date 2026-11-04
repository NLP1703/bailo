import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { ApiError } from '../lib/api';
import { useSession } from '../lib/session';
import { PrimaryButton, Screen, styles, Title } from '../ui/components';
import { colors } from '../ui/theme';

/**
 * LM5 — Inscription d'un nouveau bailleur (F2.1) : crée le compte propriétaire et ouvre la
 * session, sans OTP. Le compte démarre vide ; l'utilisateur crée ensuite son premier site
 * depuis « Plus → Sites ». Accessible depuis l'écran de connexion.
 */
export default function SignUp() {
  const { signUp } = useSession();
  const [accountName, setAccountName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const valid =
    accountName.trim().length >= 2 &&
    ownerName.trim().length >= 2 &&
    email.includes('@') &&
    phone.replace(/\D/g, '').length >= 8 &&
    password.length >= 8;

  const submit = async () => {
    setError(null);
    if (!valid) {
      setError('Remplissez tous les champs. Mot de passe : 8 caractères au moins.');
      return;
    }
    setBusy(true);
    try {
      await signUp({
        accountName: accountName.trim(),
        ownerName: ownerName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
      });
      // La session bascule vers le choix du code PIN (géré par le contexte).
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError('Un compte existe déjà avec cet e-mail ou ce téléphone.');
      } else if (e instanceof ApiError && e.status === 400) {
        setError(e.message || 'Informations invalides. Vérifiez vos saisies.');
      } else {
        setError('Inscription impossible. Vérifiez votre réseau et réessayez.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ gap: 16, paddingVertical: 24 }} keyboardShouldPersistTaps="handled">
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
            <Title subtitle="Créez votre compte bailleur">Bienvenue sur Bailo</Title>
          </View>

          <Group label="Nom de votre activité">
            <TextInput
              style={styles.input}
              value={accountName}
              onChangeText={setAccountName}
              placeholder="Ex. Résidences Obélix"
            />
          </Group>
          <Group label="Votre nom">
            <TextInput
              style={styles.input}
              value={ownerName}
              onChangeText={setOwnerName}
              placeholder="Nom et prénom"
            />
          </Group>
          <Group label="E-mail">
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="vous@exemple.com"
            />
          </Group>
          <Group label="Téléphone">
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="6 90 00 00 00"
            />
          </Group>
          <Group label="Mot de passe (8 caractères au moins)">
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              onSubmitEditing={() => void submit()}
            />
          </Group>

          {error ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          <PrimaryButton label="Créer mon compte" onPress={() => void submit()} busy={busy} disabled={!valid} />
          <PrimaryButton
            label="J’ai déjà un compte"
            tone="outline"
            onPress={() => router.back()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}
