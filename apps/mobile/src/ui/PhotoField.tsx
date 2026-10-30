import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Shot } from '../sync/photos';
import { colors, touch } from './theme';

/**
 * Photo(s) prise(s) à l'appareil, jamais depuis la galerie : la preuve est faite sur
 * place. Facultatives : elles partent après la saisie, sans la retarder (§ 6).
 */
export function PhotoField({
  label,
  shots,
  onChange,
  max = 1,
}: {
  label: string;
  shots: Shot[];
  onChange: (shots: Shot[]) => void;
  max?: number;
}) {
  const [denied, setDenied] = useState(false);

  const take = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setDenied(true);
      return;
    }
    setDenied(false);
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      exif: false,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset)
      onChange(
        [...shots, { uri: asset.uri, width: asset.width, height: asset.height }].slice(0, max),
      );
  };

  return (
    <View style={p.field}>
      <Text style={p.label}>{label}</Text>
      <View style={p.row}>
        {shots.map((shot, i) => (
          <View key={shot.uri} style={p.thumbWrap}>
            <Image
              source={{ uri: shot.uri }}
              style={p.thumb}
              accessibilityLabel={`Photo ${i + 1}`}
            />
            <Pressable
              onPress={() => onChange(shots.filter((_, j) => j !== i))}
              accessibilityRole="button"
              accessibilityLabel="Retirer la photo"
              style={p.remove}
              hitSlop={8}
            >
              <Ionicons name="close" size={16} color="#fff" />
            </Pressable>
          </View>
        ))}
        {shots.length < max ? (
          <Pressable onPress={() => void take()} accessibilityRole="button" style={p.add}>
            <Ionicons name="camera-outline" size={26} color={colors.brand} />
            <Text style={p.addText}>{shots.length === 0 ? 'Prendre une photo' : 'Une autre'}</Text>
          </Pressable>
        ) : null}
      </View>
      {denied ? (
        <Pressable onPress={() => void Linking.openSettings()} accessibilityRole="button">
          <Text style={p.denied}>
            L’appareil photo est refusé pour Bailo. Touchez ici pour l’autoriser dans les réglages.
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const p = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: { width: 88, height: 88 },
  thumb: { width: 88, height: 88, borderRadius: 12, backgroundColor: colors.border },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    minWidth: 88,
    height: 88,
    minHeight: touch.min,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.brandSoft,
  },
  addText: { fontSize: 12, fontWeight: '600', color: colors.brand, textAlign: 'center' },
  denied: { fontSize: 13, color: colors.danger },
});
