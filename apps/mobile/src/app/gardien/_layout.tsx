import { Tabs } from 'expo-router';
import { tabIcon } from '../../ui/tabIcon';
import { colors } from '../../ui/theme';

/** Barre d'onglets du gardien : 4 onglets, gros boutons (maquettes T3, T7, T10, T11). */
export default function GardienTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarLabelStyle: { fontSize: 12 },
      }}
    >
      <Tabs.Screen name="chambres" options={{ title: 'Chambres', ...tabIcon('grid') }} />
      <Tabs.Screen name="encaisser" options={{ title: 'Encaisser', ...tabIcon('cash') }} />
      <Tabs.Screen name="compteurs" options={{ title: 'Compteurs', ...tabIcon('speedometer') }} />
      <Tabs.Screen name="pannes" options={{ title: 'Pannes', ...tabIcon('construct') }} />
    </Tabs>
  );
}
