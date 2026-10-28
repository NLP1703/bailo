import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PIN_LENGTH } from '../lib/pin';
import { colors } from './theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'] as const;

/** Clavier de PIN à 4 chiffres (maquette T1) : gros boutons, points de progression. */
export function PinPad({
  value,
  onChange,
  onBiometric,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  onBiometric?: () => void;
  disabled?: boolean;
}) {
  const press = (key: (typeof KEYS)[number]) => {
    if (disabled) return;
    if (key === 'del') onChange(value.slice(0, -1));
    else if (key === 'bio') onBiometric?.();
    else if (value.length < PIN_LENGTH) onChange(value + key);
  };
  return (
    <View style={{ gap: 28, alignItems: 'center', width: '100%' }}>
      <View
        style={styles.dots}
        accessible
        accessibilityLabel={`${value.length} chiffre${value.length > 1 ? 's' : ''} saisi${value.length > 1 ? 's' : ''} sur ${PIN_LENGTH}`}
      >
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <View key={i} style={[styles.dot, i < value.length && styles.dotOn]} />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map((key) => {
          if (key === 'bio' && !onBiometric) return <View key={key} style={styles.key} />;
          const label = key === 'del' ? '⌫' : key === 'bio' ? 'Empreinte' : key;
          return (
            <Pressable
              key={key}
              onPress={() => press(key)}
              accessibilityRole="button"
              accessibilityLabel={
                key === 'del' ? 'Effacer' : key === 'bio' ? 'Déverrouiller par biométrie' : key
              }
              style={({ pressed }) => [
                styles.key,
                styles.keyFace,
                pressed && { backgroundColor: colors.brandSoft },
              ]}
            >
              <Text style={[styles.keyText, key === 'bio' && styles.keySmall]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 18 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#94A3B8' },
  dotOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    width: '100%',
  },
  key: { width: '31%', height: 64 },
  keyFace: {
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontSize: 24, fontWeight: '600', color: colors.text },
  keySmall: { fontSize: 14, color: colors.brand },
});
