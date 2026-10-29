import { Tabs } from 'expo-router';
import { tabIcon } from '../../ui/tabIcon';
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
      <Tabs.Screen
        name="vue-ensemble"
        options={{ title: 'Vue d’ensemble', ...tabIcon('stats-chart') }}
      />
      <Tabs.Screen name="chambres" options={{ title: 'Chambres', ...tabIcon('grid') }} />
      <Tabs.Screen name="equipe" options={{ title: 'Équipe', ...tabIcon('people') }} />
      <Tabs.Screen name="alertes" options={{ title: 'Alertes', ...tabIcon('warning') }} />
      <Tabs.Screen
        name="plus"
        options={{ title: 'Plus', ...tabIcon('ellipsis-horizontal-circle') }}
      />
    </Tabs>
  );
}
