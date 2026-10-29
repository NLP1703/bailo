import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Icône d'onglet : pleine quand l'onglet est actif, en contour sinon. */
export function tabIcon(name: IconName) {
  return {
    tabBarIcon: ({
      color,
      size,
      focused,
    }: {
      color: ColorValue;
      size: number;
      focused: boolean;
    }) => (
      <Ionicons
        name={(focused ? name : `${name}-outline`) as IconName}
        size={size}
        color={color as string}
      />
    ),
  };
}
