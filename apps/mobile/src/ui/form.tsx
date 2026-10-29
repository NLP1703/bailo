import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, touch } from './theme';

/** Libellé + champ de saisie aux dimensions du terrain (48 dp au moins, NFM11). */
export function Field({
  label,
  hint,
  error,
  big,
  ...input
}: TextInputProps & { label: string; hint?: string; error?: string | null; big?: boolean }) {
  return (
    <View style={f.field}>
      <Text style={f.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textSecondary}
        {...input}
        style={[f.input, big && f.big, !!error && { borderColor: colors.danger }, input.style]}
        accessibilityLabel={label}
      />
      {error ? (
        <Text style={f.error}>{error}</Text>
      ) : hint ? (
        <Text style={f.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Choix unique en pastilles (mode de paiement, urgence, catégorie…). */
export function Choices<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: Array<{ value: T; label: string; tone?: 'danger' }>;
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <View style={f.field}>
      {label ? <Text style={f.label}>{label}</Text> : null}
      <View style={f.chips}>
        {options.map((o) => {
          const active = o.value === value;
          const danger = o.tone === 'danger';
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              style={[f.chip, active && (danger ? f.chipDanger : f.chipActive)]}
            >
              <Text style={[f.chipText, active && { color: '#fff' }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Pastille « En attente d'envoi » sur une saisie pas encore confirmée par le serveur. */
export function PendingBadge() {
  return (
    <View style={f.badge}>
      <Text style={f.badgeText}>En attente d’envoi</Text>
    </View>
  );
}

export function Card({ children, tone }: { children: ReactNode; tone?: 'warning' | 'danger' }) {
  return (
    <View
      style={[
        f.card,
        tone === 'warning' && { backgroundColor: colors.warningSoft, borderColor: '#FDE68A' },
        tone === 'danger' && { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
      ]}
    >
      {children}
    </View>
  );
}

export const f = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  input: {
    minHeight: touch.button,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontSize: 17,
    color: colors.text,
  },
  big: { fontSize: 26, fontWeight: '700' },
  hint: { fontSize: 13, color: colors.textSecondary },
  error: { fontSize: 13, color: colors.danger },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: touch.min,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipDanger: { backgroundColor: colors.danger, borderColor: colors.danger },
  chipText: { fontSize: 15, fontWeight: '600', color: colors.text },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.warningSoft,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: colors.warning },
  card: {
    padding: 14,
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
