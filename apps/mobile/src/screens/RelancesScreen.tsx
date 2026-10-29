import Ionicons from '@expo/vector-icons/Ionicons';
import { isQuietHours } from '@bailo/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { remindersForToday, type ReminderItem } from '../data/reminders';
import { useSiteData } from '../data/useSiteData';
import { metaWithPrefix, setMeta } from '../db/meta';
import { SyncBanner } from '../ui/components';
import { Card } from '../ui/form';
import { formatFcfa, whatsappNumber } from '../ui/format';
import { colors, touch } from '../ui/theme';
import { BackBar } from './FicheChambreScreen';

type Channel = 'whatsapp' | 'sms';
interface Sent {
  at: string;
  channel: Channel;
}

const STAGE_LABEL = {
  J_MINUS_3: 'J−3',
  J_0: 'J0',
  J_PLUS_5: 'J+5',
  J_PLUS_15: 'J+15',
  END_OF_ADVANCE: 'fin d’avance',
} as const;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * T9 — relances du jour : rappels et retards avec message pré-rempli, envoyé par
 * WhatsApp ou SMS depuis le téléphone (sans réseau, le SMS part quand même).
 */
export function RelancesScreen({ standalone }: { standalone?: boolean }) {
  const { tables, units } = useSiteData();
  const [sent, setSent] = useState<Map<string, Sent>>(new Map());
  const [open, setOpen] = useState<string | null>(null);
  const day = todayKey();

  const items = useMemo(() => remindersForToday(tables, units, new Date()), [tables, units]);
  const groups = useMemo(
    () => [
      { title: 'Retards à relancer', items: items.filter((i) => i.kind === 'late' && i.stage) },
      { title: 'Rappels avant échéance', items: items.filter((i) => i.kind === 'upcoming') },
      { title: 'Autres chambres en retard', items: items.filter((i) => !i.stage) },
    ],
    [items],
  );

  const load = useCallback(() => {
    void metaWithPrefix(`reminder:${day}:`).then((rows) => {
      const map = new Map<string, Sent>();
      for (const [key, value] of rows) {
        try {
          map.set(key.slice(`reminder:${day}:`.length), JSON.parse(value) as Sent);
        } catch {
          /* valeur illisible : ignorée */
        }
      }
      setSent(map);
    });
  }, [day]);
  useEffect(load, [load]);

  const send = async (item: ReminderItem, channel: Channel) => {
    if (!item.recipient.phone) return;
    const text = encodeURIComponent(item.message);
    const url =
      channel === 'whatsapp'
        ? `https://wa.me/${whatsappNumber(item.recipient.phone)}?text=${text}`
        : `sms:${item.recipient.phone}?body=${text}`;
    await Linking.openURL(url);
    const mark: Sent = { at: new Date().toISOString(), channel };
    await setMeta(`reminder:${day}:${item.key}`, JSON.stringify(mark));
    setSent((prev) => new Map(prev).set(item.key, mark));
  };

  const sentCount = items.filter((i) => sent.has(i.key)).length;
  const dateLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      {standalone ? <BackBar title="Relances du jour" /> : null}
      <ScrollView contentContainerStyle={s.content}>
        <SyncBanner />
        {!standalone ? (
          <Text style={s.title} accessibilityRole="header">
            Relances du jour
          </Text>
        ) : null}
        <Text style={s.subtitle}>
          {dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)} · {sentCount} envoyée
          {sentCount > 1 ? 's' : ''} sur {items.length}
        </Text>
        {isQuietHours(new Date().getHours()) ? (
          <Card tone="warning">
            <Text style={{ color: colors.warning }}>
              Il est tard : les relances ne s’envoient pas entre 21 h et 7 h (RG12). Préparez-les et
              envoyez-les demain matin.
            </Text>
          </Card>
        ) : null}
        {items.length === 0 ? (
          <Card>
            <Text style={s.muted}>
              Aucune relance aujourd’hui : tout le monde est à jour ou hors palier.
            </Text>
          </Card>
        ) : null}

        {groups
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <View key={g.title} style={{ gap: 8 }}>
              <Text style={s.group}>
                {g.title.toUpperCase()} · {g.items.length}
              </Text>
              {g.items.map((item) => {
                const done = sent.get(item.key);
                const expanded = open === item.key;
                return (
                  <Card key={item.key}>
                    <Pressable
                      onPress={() => setOpen(expanded ? null : item.key)}
                      accessibilityRole="button"
                    >
                      <View style={s.head}>
                        <Text style={s.who} numberOfLines={1}>
                          {item.view.unit.code} · {item.view.tenant?.name}
                        </Text>
                        {item.stage ? <Text style={s.stage}>{STAGE_LABEL[item.stage]}</Text> : null}
                      </View>
                      <Text style={[s.muted, item.kind === 'late' && { color: colors.danger }]}>
                        {formatFcfa(item.amount)} {item.kind === 'late' ? 'dû' : 'attendu'} ·{' '}
                        {item.recipient.label}
                      </Text>
                      {expanded ? <Text style={s.message}>{item.message}</Text> : null}
                    </Pressable>
                    {done ? (
                      <View style={s.doneRow}>
                        <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                        <Text style={s.done}>
                          Envoyée à{' '}
                          {new Date(done.at).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          par {done.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}
                        </Text>
                      </View>
                    ) : item.recipient.phone ? (
                      <View style={s.actions}>
                        <Action
                          icon="logo-whatsapp"
                          label="WhatsApp"
                          onPress={() => void send(item, 'whatsapp')}
                        />
                        <Action
                          icon="chatbubble-outline"
                          label="SMS"
                          onPress={() => void send(item, 'sms')}
                        />
                      </View>
                    ) : (
                      <Text style={s.small}>
                        Pas de numéro enregistré pour {item.recipient.name}.
                      </Text>
                    )}
                  </Card>
                );
              })}
            </View>
          ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Action({
  icon,
  label,
  onPress,
}: {
  icon: 'logo-whatsapp' | 'chatbubble-outline';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={s.action}>
      <Ionicons name={icon} size={18} color={colors.brand} />
      <Text style={s.actionText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textSecondary },
  group: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.textSecondary,
    marginTop: 6,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  who: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  stage: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  muted: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  small: { fontSize: 12, color: colors.textSecondary },
  message: {
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.ground,
    padding: 10,
    borderRadius: 10,
    marginTop: 6,
    lineHeight: 20,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  action: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touch.min,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  actionText: { fontSize: 15, fontWeight: '600', color: colors.brand },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  done: { fontSize: 14, color: colors.success },
});
