import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSyncState } from '../sync/useSync';
import { colors, touch } from './theme';

export function Screen({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={[styles.body, padded && styles.padded]}>{children}</View>
    </SafeAreaView>
  );
}

export function Title({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={styles.title} accessibilityRole="header">
        {children}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
  tone = 'brand',
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: 'brand' | 'outline' | 'danger';
}) {
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        tone === 'outline' && styles.buttonOutline,
        tone === 'danger' && styles.buttonDanger,
        inactive && styles.buttonDisabled,
        pressed && { opacity: 0.85 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={tone === 'brand' ? '#fff' : colors.brand} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            tone === 'outline' && { color: colors.brand },
            tone === 'danger' && { color: colors.danger },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** Bandeau hors-ligne et opérations en attente, visible sur tous les écrans de terrain. */
export function SyncBanner() {
  const { phase, pendingCount, lastError } = useSyncState();
  if (phase !== 'offline' && pendingCount === 0) return null;
  const offline = phase === 'offline';
  const text = offline
    ? `Hors-ligne · ${pendingCount} opération${pendingCount > 1 ? 's' : ''} en attente d’envoi`
    : `${pendingCount} opération${pendingCount > 1 ? 's' : ''} en cours d’envoi`;
  return (
    <View
      style={[styles.banner, offline ? styles.bannerOffline : styles.bannerPending]}
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.bannerText}>{text}</Text>
      {offline && lastError ? (
        <Text style={styles.bannerSmall}>
          {__DEV__ ? `Nouvel essai automatique. (${lastError})` : 'Nouvel essai automatique.'}
        </Text>
      ) : null}
    </View>
  );
}

/** Écran prévu dans un lot ultérieur : montre ce qui viendra, pour naviguer dès maintenant. */
export function Placeholder({
  title,
  lot,
  children,
  footer,
}: {
  title: string;
  lot: string;
  /** Texte décrivant ce qui viendra (texte seulement). */
  children?: string;
  footer?: ReactNode;
}) {
  return (
    <Screen>
      <SyncBanner />
      <Title subtitle={`Arrive avec le lot ${lot}`}>{title}</Title>
      <View style={styles.card}>
        <Text style={styles.cardText}>{children ?? 'Écran en préparation.'}</Text>
      </View>
      {footer}
    </Screen>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  body: { flex: 1, gap: 16 },
  padded: { paddingHorizontal: 20, paddingTop: 16 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textSecondary },
  button: {
    minHeight: touch.button,
    borderRadius: 14,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonOutline: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.brand },
  buttonDanger: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.danger },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: { color: '#fff', fontSize: 17, fontWeight: '600' },
  banner: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  bannerOffline: { backgroundColor: colors.warningSoft },
  bannerPending: { backgroundColor: colors.brandSoft },
  bannerText: { color: colors.warning, fontSize: 14, fontWeight: '500' },
  bannerSmall: { color: colors.warning, fontSize: 12, marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardText: { fontSize: 15, color: colors.textSecondary, lineHeight: 22 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  input: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
  },
  error: { color: colors.danger, fontSize: 14 },
});
