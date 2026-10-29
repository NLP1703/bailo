import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSiteData } from '../data/useSiteData';
import { PrimaryButton } from '../ui/components';
import { Card } from '../ui/form';
import { formatFcfa, PAYMENT_MODE_LABELS, shortDate, whatsappNumber } from '../ui/format';
import { colors, touch } from '../ui/theme';
import { BackBar } from './FicheChambreScreen';

function displayPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 9)
    return `+237 ${d[0]} ${d.slice(1, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7)}`;
  return phone;
}

/** T5 — fiche locataire : coordonnées, payeur et garants, solde, historique, appel et WhatsApp. */
export function LocataireScreen({ tenantId }: { tenantId: string }) {
  const { tables, units } = useSiteData();
  const tenant = tables.tenants.find((t) => t.id === tenantId);
  const view = units.find((v) => v.tenant?.id === tenantId);
  const guarantors = tables.guarantors
    .filter((g) => g.tenantId === tenantId)
    .sort((a, b) => Number(b.isPrimaryPayer) - Number(a.isPrimaryPayer));

  if (!tenant) {
    return (
      <SafeAreaView style={s.screen}>
        <BackBar title="Locataire" />
        <Text style={[s.muted, { padding: 20 }]}>Locataire introuvable sur ce téléphone.</Text>
      </SafeAreaView>
    );
  }

  const contacts = [
    {
      key: 'tenant',
      name: tenant.name,
      role: 'Locataire',
      detail: null as string | null,
      phone: tenant.phone,
      whatsapp: tenant.whatsapp ?? tenant.phone,
    },
    ...guarantors.map((g) => ({
      key: g.id,
      name: g.name,
      role: g.isPrimaryPayer ? 'Payeur' : 'Garant',
      detail: g.relationship,
      phone: g.phone,
      whatsapp: g.whatsapp ?? g.phone,
    })),
    ...(tenant.emergencyName
      ? [
          {
            key: 'emergency',
            name: tenant.emergencyName,
            role: 'Urgence',
            detail: null,
            phone: tenant.emergencyPhone,
            whatsapp: tenant.emergencyPhone,
          },
        ]
      : []),
  ];

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right', 'bottom']}>
      <BackBar title={tenant.name} />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.subtitle}>
          {view?.occupancy
            ? `Chambre ${view.unit.code} · depuis le ${shortDate(view.occupancy.startDate)}`
            : 'Pas d’occupation en cours sur ce site'}
          {tenant.occupation ? ` · ${tenant.occupation}` : ''}
        </Text>

        {view?.occupancy ? (
          <Card tone={view.due > 0 ? 'danger' : undefined}>
            <Text style={s.label}>Solde dû</Text>
            <Text style={[s.amount, { color: view.due > 0 ? colors.danger : colors.success }]}>
              {formatFcfa(view.due)}
            </Text>
            <PrimaryButton
              label="Encaisser"
              onPress={() =>
                router.push({ pathname: '/encaisser', params: { unitId: view.unit.id } })
              }
            />
          </Card>
        ) : null}

        <Card>
          {contacts.map((c, i) => (
            <View key={c.key} style={[s.contact, i > 0 && s.border]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.role}>{c.role}</Text>
                <Text style={s.name}>{c.name}</Text>
                <Text style={s.muted}>
                  {[c.detail, c.phone ? displayPhone(c.phone) : 'pas de numéro']
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {c.phone ? (
                <Pressable
                  onPress={() => void Linking.openURL(`tel:${c.phone}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Appeler ${c.name}`}
                  style={s.iconBtn}
                >
                  <Ionicons name="call" size={20} color={colors.brand} />
                </Pressable>
              ) : null}
              {c.whatsapp ? (
                <Pressable
                  onPress={() =>
                    void Linking.openURL(`https://wa.me/${whatsappNumber(c.whatsapp!)}`)
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`WhatsApp ${c.name}`}
                  style={s.iconBtn}
                >
                  <Ionicons name="logo-whatsapp" size={20} color={colors.brand} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </Card>

        <Text style={s.section}>Historique</Text>
        {view && view.payments.length > 0 ? (
          <Card>
            {view.payments.slice(0, 10).map((p, i) => (
              <View key={p.id} style={[s.histRow, i > 0 && s.border]}>
                <Text style={s.histText}>
                  Paiement {PAYMENT_MODE_LABELS[p.mode].toLowerCase()} · {formatFcfa(p.amount)}
                  {p.pending ? ' · en attente d’envoi' : ''}
                </Text>
                <Text style={s.small}>{shortDate(p.paidAt).slice(0, 5)}</Text>
              </View>
            ))}
          </Card>
        ) : (
          <Text style={s.muted}>Aucun paiement des 90 derniers jours sur ce téléphone.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  subtitle: { fontSize: 15, color: colors.textSecondary },
  label: { fontSize: 14, color: colors.textSecondary },
  amount: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
  section: { fontSize: 16, fontWeight: '600', color: colors.text },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  border: { borderTopWidth: 1, borderTopColor: colors.border },
  role: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  iconBtn: {
    width: touch.min,
    height: touch.min,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  histText: { flex: 1, fontSize: 15, color: colors.text },
  muted: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  small: { fontSize: 12, color: colors.textSecondary },
});
