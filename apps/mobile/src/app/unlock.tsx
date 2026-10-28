import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { biometricAvailable, PIN_LENGTH } from '../lib/pin';
import { useSession } from '../lib/session';
import { PinPad } from '../ui/PinPad';
import { PrimaryButton, Screen, styles, Title } from '../ui/components';

const ROLE_LABEL = { OWNER: 'Propriétaire', MANAGER: 'Gérant', CARETAKER: 'Gardien' } as const;

/** Déverrouillage par PIN ou biométrie (maquette T1, RGM11). */
export default function Unlock() {
  const { unlock, unlockBiometric, user, signOut } = useSession();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [bio, setBio] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void biometricAvailable().then((ok) => {
      setBio(ok);
      if (ok) void unlockBiometric();
    });
  }, [unlockBiometric]);

  useEffect(() => {
    if (value.length < PIN_LENGTH || busy) return;
    setBusy(true);
    void unlock(value)
      .then(({ ok, remaining }) => {
        if (!ok) {
          setError(
            remaining > 0
              ? `Code incorrect. Encore ${remaining} essai${remaining > 1 ? 's' : ''}.`
              : null,
          );
          setValue('');
        }
      })
      .finally(() => setBusy(false));
  }, [value, busy, unlock]);

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', gap: 24, paddingTop: 40 }}>
        <Text style={styles.subtitle}>
          {user ? `Bonjour ${user.name.split(' ')[0]} · ${ROLE_LABEL[user.role]}` : ''}
        </Text>
        <Title>Entrez votre code PIN</Title>
        <PinPad
          value={value}
          onChange={(v) => {
            setError(null);
            setValue(v);
          }}
          onBiometric={bio ? () => void unlockBiometric() : undefined}
          disabled={busy}
        />
        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <View style={{ width: '100%', marginTop: 'auto', marginBottom: 24, gap: 8 }}>
          <PrimaryButton
            label="Code oublié ? Se reconnecter"
            tone="outline"
            onPress={() => void signOut()}
          />
          <Text style={[styles.subtitle, { textAlign: 'center' }]}>
            5 essais au plus. Le code ne fonctionne que sur ce téléphone.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
