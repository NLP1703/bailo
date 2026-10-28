import { Tabs } from 'expo-router';
import { colors } from '../../ui/theme';

/** Barre d'onglets du gérant, Encaisser au centre (maquettes T2, T3, T7, T9). */
export default function GerantTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarLabelStyle: { fontSize: 12 },
      }}
    >
      <Tabs.Screen name="accueil" options={{ title: 'Accueil' }} />
      <Tabs.Screen name="chambres" options={{ title: 'Chambres' }} />
      <Tabs.Screen name="encaisser" options={{ title: 'Encaisser' }} />
      <Tabs.Screen name="relances" options={{ title: 'Relances' }} />
      <Tabs.Screen name="plus" options={{ title: 'Plus' }} />
    </Tabs>
  );
}
