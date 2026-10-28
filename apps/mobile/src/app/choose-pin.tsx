import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { PIN_LENGTH } from '../lib/pin';
import { useSession } from '../lib/session';
import { PinPad } from '../ui/PinPad';
import { PrimaryButton, Screen, styles, Title } from '../ui/components';

/** Choix du code PIN, une fois par téléphone, juste après la première connexion. */
export default function ChoosePin() {
  const { choosePin, user, signOut } = useSession();
  const [first, setFirst] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (value.length < PIN_LENGTH) return;
    if (first === null) {
      setFirst(value);
      setValue('');
      return;
    }
    if (value === first) {
      void choosePin(value).catch(() => setError('Impossible d’enregistrer le code. Réessayez.'));
    } else {
      setError('Les deux codes ne correspondent pas. Recommencez.');
      setFirst(null);
      setValue('');
    }
  }, [value, first, choosePin]);

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', gap: 28, paddingTop: 40 }}>
        <Title subtitle={user ? `${user.name} · ${user.accountName}` : undefined}>
          {first === null ? 'Choisissez votre code PIN' : 'Confirmez votre code'}
        </Title>
        <Text style={[styles.subtitle, { textAlign: 'center' }]}>
          {PIN_LENGTH} chiffres pour ouvrir Bailo sur ce téléphone, sans réseau.
        </Text>
        <PinPad
          value={value}
          onChange={(v) => {
            setError(null);
            setValue(v);
          }}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={{ width: '100%', marginTop: 'auto', marginBottom: 24 }}>
          <PrimaryButton
            label="Annuler et se déconnecter"
            tone="outline"
            onPress={() => void signOut()}
          />
        </View>
      </View>
    </Screen>
  );
}
