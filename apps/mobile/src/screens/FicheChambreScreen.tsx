import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { chargeView } from '../data/derive';
import { useSiteData } from '../data/useSiteData';
import { useSession } from '../lib/session';
import { PrimaryButton } from '../ui/components';
import {
  formatFcfa,
  monthLabel,
  PAYMENT_MODE_LABELS,
  shortDate,
  UNIT_COLOR_STYLE,
  whatsappNumber,
} from '../ui/format';
import { colors, touch } from '../ui/theme';

type MonthState = 'paid' | 'partial' | 'unpaid' | 'none';

const MONTH_STYLE: Record<MonthState, { bg: string; fg: string }> = {
  paid: { bg: '#DCFCE7', fg: '#14532D' },
  partial: { bg: '#FEF3C7', fg: '#78350F' },
  unpaid: { bg: '#FEE2E2', fg: '#7F1D1D' },
  none: { bg: '#F1F5F9', fg: '#94A3B8' },
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** T4 — fiche chambre : occupant, solde, mois couverts, derniers paiements, Encaisser. */
export function FicheChambreScreen({ unitId }: { unitId: string }) {
  const { units, tables } = useSiteData();
  const { user } = useSession();
  const view = units.find((v) => v.unit.id === unitId);

  if (!view) {
    return (
      <SafeAreaView style={s.screen}>
        <BackBar title="Chambre" />
        <Text style={[s.muted, { padding: 20 }]}>Chambre introuvable sur ce téléphone.</Text>
      </SafeAreaView>
    );
  }

  const c = UNIT_COLOR_STYLE[view.color];
  const graceDays = tables.sites[0]?.graceDays ?? 0;
  const today = new Date();

  // Six derniers mois de loyer (mois en cours compris).
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - 5 + i, 1);
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  }).map(({ month, year }) => {
    const charge = view.occupancy
      ? tables.charges.find(
          (ch) =>
            ch.occupancyId === view.occupancy!.id &&
            ch.type === 'LOYER' &&
            ch.periodMonth === month &&
            ch.periodYear === year,
        )
      : undefined;
    let state: MonthState = 'none';
    if (charge) {
      const cv = chargeView(charge, graceDays, today);
      state = cv.liveStatus === 'PAID' ? 'paid' : cv.paidNow > 0 ? 'partial' : 'unpaid';
    }
    return { month, year, state };
  });

  const phone = view.tenant?.phone ?? null;
  const whatsapp = view.tenant?.whatsapp ?? phone;

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right', 'bottom']}>
      <BackBar title={`Chambre ${view.unit.code}`} />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.headRow}>
          <Text style={s.subtitle}>
            {[
              view.block?.name,
              `Loyer ${formatFcfa(view.occupancy?.monthlyRent ?? view.unit.baseRent)} / mois`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <View style={[s.pill, { backgroundColor: c.bg }]}>
            <Text style={[s.pillText, { color: c.fg }]}>{c.label}</Text>
          </View>
        </View>

        {view.tenant && view.occupancy ? (
          <Pressable style={s.card} accessibilityRole="summary">
            <View style={s.tenantRow}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{initials(view.tenant.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.tenantName}>{view.tenant.name}</Text>
                <Text style={s.muted}>
                  {[view.tenant.occupation, `entré le ${shortDate(view.occupancy.startDate)}`]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </View>
          </Pressable>
        ) : (
          <View style={s.card}>
            <Text style={s.tenantName}>
              {view.color === 'BLUE'
                ? `Réservée${view.unit.reservedFor ? ` · ${view.unit.reservedFor}` : ''}`
                : 'Chambre libre'}
            </Text>
            <Text style={s.muted}>Aucun occupant en ce moment.</Text>
          </View>
        )}

        {view.occupancy ? (
          <>
            <View
              style={[
                s.card,
                view.due > 0 && { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
              ]}
            >
              <Text style={s.label}>Solde dû</Text>
              <Text style={[s.amount, { color: view.due > 0 ? '#B91C1C' : colors.success }]}>
                {formatFcfa(view.due)}
              </Text>
              {view.paidThrough ? (
                <Text style={s.muted}>
                  Loyer payé jusqu’à fin {monthLabel(view.paidThrough.month, view.paidThrough.year)}
                </Text>
              ) : null}
            </View>

            <View style={{ gap: 8 }}>
              <Text style={s.section}>Mois couverts</Text>
              <View style={s.months}>
                {months.map((m) => (
                  <View
                    key={`${m.year}-${m.month}`}
                    style={[s.month, { backgroundColor: MONTH_STYLE[m.state].bg }]}
                    accessibilityLabel={`${monthLabel(m.month, m.year)} : ${
                      {
                        paid: 'payé',
                        partial: 'partiel',
                        unpaid: 'non payé',
                        none: 'pas de loyer',
                      }[m.state]
                    }`}
                  >
                    <Text style={[s.monthText, { color: MONTH_STYLE[m.state].fg }]}>
                      {monthLabel(m.month)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={s.section}>Derniers paiements</Text>
              {view.payments.length === 0 ? (
                <Text style={s.muted}>Aucun paiement récent sur ce téléphone.</Text>
              ) : (
                <View style={s.card}>
                  {view.payments.slice(0, 5).map((p, i) => (
                    <View key={p.id} style={[s.payRow, i > 0 && s.payBorder]}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.payMain}>
                          {shortDate(p.paidAt)} · {PAYMENT_MODE_LABELS[p.mode]}
                        </Text>
                        <Text style={s.mutedSmall}>
                          {p.pending ? 'En attente d’envoi' : `Reçu ${p.receiptNumber}`}
                        </Text>
                      </View>
                      <Text style={s.payAmount}>{formatFcfa(p.amount)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>

      <View style={s.footer}>
        {phone && user?.role !== 'CARETAKER' ? (
          <View style={s.contactRow}>
            <ContactButton
              icon="call"
              label="Appeler"
              onPress={() => void Linking.openURL(`tel:${phone}`)}
            />
            {whatsapp ? (
              <ContactButton
                icon="logo-whatsapp"
                label="WhatsApp"
                onPress={() => void Linking.openURL(`https://wa.me/${whatsappNumber(whatsapp)}`)}
              />
            ) : null}
          </View>
        ) : null}
        {view.occupancy ? (
          <PrimaryButton
            label="Encaisser"
            onPress={() =>
              router.push({ pathname: '/encaisser', params: { unitId: view.unit.id } })
            }
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

export function BackBar({ title }: { title: string }) {
  return (
    <View style={s.backBar}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Retour"
        hitSlop={12}
        style={s.backBtn}
      >
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </Pressable>
      <Text style={s.backTitle} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

function ContactButton({
  icon,
  label,
  onPress,
}: {
  icon: 'call' | 'logo-whatsapp';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={s.contact}>
      <Ionicons name={icon} size={20} color={colors.brand} />
      <Text style={s.contactText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  backBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    minHeight: 56,
  },
  backBtn: { width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center' },
  backTitle: { flex: 1, fontSize: 22, fontWeight: '700', color: colors.text },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  subtitle: { flex: 1, fontSize: 15, color: colors.textSecondary },
  pill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 13, fontWeight: '700' },
  card: {
    padding: 16,
    gap: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tenantRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 17, fontWeight: '700', color: colors.brandDark },
  tenantName: { fontSize: 18, fontWeight: '600', color: colors.text },
  label: { fontSize: 14, color: colors.textSecondary },
  amount: { fontSize: 28, fontWeight: '700' },
  section: { fontSize: 16, fontWeight: '600', color: colors.text },
  months: { flexDirection: 'row', gap: 6 },
  month: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthText: { fontSize: 13, fontWeight: '600' },
  payRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  payBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  payMain: { fontSize: 15, color: colors.text },
  payAmount: { fontSize: 16, fontWeight: '600', color: colors.text },
  muted: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  mutedSmall: { fontSize: 12, color: colors.textSecondary },
  footer: {
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  contactRow: { flexDirection: 'row', gap: 10 },
  contact: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touch.min,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  contactText: { fontSize: 16, fontWeight: '600', color: colors.brand },
});
