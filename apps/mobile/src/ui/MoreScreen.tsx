import type { RejectedOperation } from '@bailo/sync';
import { useCallback, useEffect, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../lib/session';
import { getSync } from '../sync/engine';
import { useSyncState } from '../sync/useSync';
import { PrimaryButton, Screen, styles, SyncBanner, Title } from './components';
import { colors, touch } from './theme';

type Role = 'OWNER' | 'MANAGER' | 'CARETAKER';

/** Écrans de terrain ouverts depuis « Plus » (le gardien les a dans ses onglets). */
const LINKS: Array<{
  href: Href;
  label: string;
  icon:
    | 'wallet-outline'
    | 'speedometer-outline'
    | 'construct-outline'
    | 'receipt-outline'
    | 'notifications-outline';
  roles?: Role[];
}> = [
  { href: '/caisse', label: 'Ma caisse', icon: 'wallet-outline', roles: ['MANAGER', 'CARETAKER'] },
  {
    href: '/releves',
    label: 'Relevés de compteurs',
    icon: 'speedometer-outline',
    roles: ['MANAGER', 'CARETAKER'],
  },
  { href: '/pannes', label: 'Pannes', icon: 'construct-outline' },
  { href: '/relances', label: 'Relances du jour', icon: 'notifications-outline', roles: ['OWNER'] },
  {
    href: '/depense',
    label: 'Nouvelle dépense',
    icon: 'receipt-outline',
    roles: ['OWNER', 'MANAGER'],
  },
];

const linkStyle = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: touch.button },
  border: { borderTopWidth: 1, borderTopColor: colors.border },
  text: { flex: 1, fontSize: 16, color: colors.text },
});

const ROLE_LABEL = { OWNER: 'Propriétaire', MANAGER: 'Gérant', CARETAKER: 'Gardien' } as const;

function formatTime(ms: number | null): string {
  if (!ms) return 'jamais';
  return new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Compte, état de la synchronisation et opérations à corriger (T16, RGM6). */
export function MoreScreen() {
  const { user, signOut } = useSession();
  const sync = useSyncState();
  const [toFix, setToFix] = useState<RejectedOperation[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void getSync()
      .then(({ outbox }) => outbox.listToFix())
      .then(setToFix)
      .catch(() => setToFix([]));
  }, []);
  useEffect(load, [load, sync.pendingCount]);

  const syncNow = async () => {
    if (!user?.siteId) return;
    setBusy(true);
    try {
      const { engine } = await getSync();
      await engine.syncNow(user.siteId);
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
        <SyncBanner />
        <Title subtitle={user ? `${ROLE_LABEL[user.role]} · ${user.accountName}` : undefined}>
          {user?.name ?? 'Mon compte'}
        </Title>
        <View style={[styles.card, { paddingVertical: 4 }]}>
          {LINKS.filter((l) => !l.roles || (user && l.roles.includes(user.role))).map((l, i) => (
            <Pressable
              key={l.label}
              onPress={() => router.push(l.href)}
              accessibilityRole="button"
              style={[linkStyle.row, i > 0 && linkStyle.border]}
            >
              <Ionicons name={l.icon} size={22} color={colors.brand} />
              <Text style={linkStyle.text}>{l.label}</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </Pressable>
          ))}
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Synchronisation</Text>
          <Text style={styles.cardText}>
            Dernière réussite : {formatTime(sync.lastSuccessAt)}
            {'\n'}En attente d’envoi : {sync.pendingCount}
          </Text>
          <View style={{ marginTop: 12 }}>
            <PrimaryButton
              label="Synchroniser maintenant"
              tone="outline"
              onPress={syncNow}
              busy={busy}
            />
          </View>
        </View>
        <Pressable
          onPress={() => router.push('/a-corriger')}
          accessibilityRole="button"
          style={[
            styles.card,
            toFix.length > 0 && { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
          ]}
        >
          <Text style={styles.label}>À corriger · {toFix.length}</Text>
          <Text style={[styles.cardText, toFix.length > 0 && { color: colors.danger }]}>
            {toFix.length === 0
              ? 'Aucune opération refusée.'
              : 'Des saisies ont été refusées par le serveur : à refaire ou abandonner.'}
          </Text>
        </Pressable>
        <PrimaryButton
          label="Se déconnecter de ce téléphone"
          tone="danger"
          onPress={() => void signOut()}
        />
      </ScrollView>
    </Screen>
  );
}
