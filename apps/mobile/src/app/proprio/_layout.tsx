import { Tabs } from 'expo-router';
import { colors } from '../../ui/theme';

/** Barre d'onglets du propriétaire (maquettes T13, T15). */
export default function ProprioTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen name="vue-ensemble" options={{ title: 'Vue d’ensemble' }} />
      <Tabs.Screen name="chambres" options={{ title: 'Chambres' }} />
      <Tabs.Screen name="equipe" options={{ title: 'Équipe' }} />
      <Tabs.Screen name="alertes" options={{ title: 'Alertes' }} />
      <Tabs.Screen name="plus" options={{ title: 'Plus' }} />
    </Tabs>
  );
}
