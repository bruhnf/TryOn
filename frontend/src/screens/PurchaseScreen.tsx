import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { useUserStore } from '../store/useUserStore';
import { UserTier } from '../types';
import api from '../config/api';

interface TierInfo {
  id: UserTier;
  name: string;
  tagline: string;
  features: string[];
  creditPrice: number;
  badge?: string;
}

const TIERS: TierInfo[] = [
  {
    id: 'FREE',
    name: 'Free',
    tagline: 'Get started with monthly free credits',
    features: [
      '10 free credits at the start of every month',
      'Buy more credits at $0.50 each',
      'Full access to community feed',
    ],
    creditPrice: 0.5,
  },
  {
    id: 'BASIC',
    name: 'Basic',
    tagline: '4 try-ons every day',
    features: [
      '4 daily try-on sessions included',
      'Buy more credits at $0.40 each',
      'Priority queue',
    ],
    creditPrice: 0.4,
  },
  {
    id: 'PREMIUM',
    name: 'Premium',
    tagline: '6 try-ons every day, best per-credit pricing',
    features: [
      '6 daily try-on sessions included',
      'Buy more credits at $0.30 each',
      'Top-priority queue',
    ],
    creditPrice: 0.3,
    badge: 'BEST VALUE',
  },
];

const CREDIT_AMOUNTS = [10, 25, 50, 100];

export default function PurchaseScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user, refreshUser } = useUserStore();
  const [selectedTab, setSelectedTab] = useState<'tiers' | 'credits'>('tiers');
  const [loading, setLoading] = useState(false);
  const [busyAmount, setBusyAmount] = useState<number | null>(null);

  const currentTier: UserTier = user?.tier ?? 'FREE';
  const currentTierConfig = TIERS.find((t) => t.id === currentTier) ?? TIERS[0];

  async function handleSelectTier(tier: TierInfo) {
    if (tier.id === currentTier) return;

    const isUpgrade = tierRank(tier.id) > tierRank(currentTier);
    const message = tier.id === 'FREE'
      ? 'Cancel your subscription and switch to the Free tier?'
      : `Switch to the ${tier.name} tier?`;

    Alert.alert(isUpgrade ? `Upgrade to ${tier.name}` : `Switch to ${tier.name}`, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setLoading(true);
          try {
            if (tier.id === 'FREE') {
              await api.post('/credits/unsubscribe');
            } else {
              await api.post('/credits/subscribe', { tier: tier.id });
            }
            await refreshUser();
            Alert.alert('Success', `You are now on the ${tier.name} tier.`);
          } catch {
            Alert.alert('Error', 'Could not update your tier. Please try again.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  }

  async function handlePurchaseCredits(amount: number) {
    Alert.alert(
      'Purchase Credits',
      `Buy ${amount} credits for $${(amount * currentTierConfig.creditPrice).toFixed(2)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Purchase',
          onPress: async () => {
            setBusyAmount(amount);
            try {
              await api.post('/credits/purchase', { credits: amount });
              await refreshUser();
              Alert.alert('Success', `${amount} credits added to your account!`);
            } catch {
              Alert.alert('Error', 'Could not complete purchase. Please try again.');
            } finally {
              setBusyAmount(null);
            }
          },
        },
      ],
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Get More Try-Ons</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.statusCard}>
          <Ionicons name="wallet-outline" size={24} color={Colors.gray600} />
          <View style={styles.statusInfo}>
            <Text style={styles.statusLabel}>Current Tier</Text>
            <Text style={styles.statusValue}>{currentTierConfig.name} · {user?.credits ?? 0} credits</Text>
          </View>
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'tiers' && styles.tabActive]}
            onPress={() => setSelectedTab('tiers')}
          >
            <Text style={[styles.tabText, selectedTab === 'tiers' && styles.tabTextActive]}>Tiers</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'credits' && styles.tabActive]}
            onPress={() => setSelectedTab('credits')}
          >
            <Text style={[styles.tabText, selectedTab === 'credits' && styles.tabTextActive]}>Buy Credits</Text>
          </TouchableOpacity>
        </View>

        {selectedTab === 'tiers' ? (
          <View>
            {TIERS.map((tier) => {
              const isCurrent = tier.id === currentTier;
              return (
                <View
                  key={tier.id}
                  style={[styles.tierCard, isCurrent && styles.tierCardCurrent]}
                >
                  {tier.badge ? (
                    <View style={styles.tierBadge}>
                      <Ionicons name="star" size={11} color={Colors.white} />
                      <Text style={styles.tierBadgeText}>{tier.badge}</Text>
                    </View>
                  ) : null}

                  <Text style={styles.tierName}>{tier.name}</Text>
                  <Text style={styles.tierTagline}>{tier.tagline}</Text>

                  <View style={styles.tierFeatureList}>
                    {tier.features.map((f) => (
                      <View key={f} style={styles.tierFeatureItem}>
                        <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                        <Text style={styles.tierFeatureText}>{f}</Text>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={[styles.tierButton, isCurrent && styles.tierButtonCurrent]}
                    onPress={() => handleSelectTier(tier)}
                    disabled={loading || isCurrent}
                  >
                    {loading && !isCurrent ? (
                      <ActivityIndicator color={Colors.white} />
                    ) : (
                      <Text style={[styles.tierButtonText, isCurrent && styles.tierButtonTextCurrent]}>
                        {isCurrent ? 'Current Tier' : tier.id === 'FREE' ? 'Switch to Free' : `Choose ${tier.name}`}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ) : (
          <View>
            <Text style={styles.sectionTitle}>Buy Credits</Text>
            <Text style={styles.sectionSubtitle}>
              Your tier ({currentTierConfig.name}) gets credits at ${currentTierConfig.creditPrice.toFixed(2)} each.
              Credits never expire.
            </Text>

            {CREDIT_AMOUNTS.map((amount) => {
              const total = (amount * currentTierConfig.creditPrice).toFixed(2);
              return (
                <TouchableOpacity
                  key={amount}
                  style={styles.creditCard}
                  onPress={() => handlePurchaseCredits(amount)}
                  disabled={busyAmount !== null}
                >
                  <View style={styles.creditInfo}>
                    <View style={styles.creditAmountRow}>
                      <Ionicons name="flash" size={20} color={Colors.warning} />
                      <Text style={styles.creditCount}>{amount}</Text>
                      <Text style={styles.creditLabel}>credits</Text>
                    </View>
                    <Text style={styles.creditPrice}>${total}</Text>
                  </View>
                  <Text style={styles.perUnitText}>
                    ${currentTierConfig.creditPrice.toFixed(2)} per credit
                  </Text>
                  {busyAmount === amount && (
                    <ActivityIndicator style={styles.creditLoader} color={Colors.black} />
                  )}
                </TouchableOpacity>
              );
            })}

            <View style={styles.creditNote}>
              <Ionicons name="information-circle-outline" size={18} color={Colors.gray600} />
              <Text style={styles.creditNoteText}>
                Daily try-on allowance is used first; credits are spent only after the daily allowance runs out.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function tierRank(t: UserTier): number {
  return t === 'PREMIUM' ? 2 : t === 'BASIC' ? 1 : 0;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray100 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  closeButton: { padding: Spacing.xs },
  headerTitle: {
    fontSize: Typography.fontSizeXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
  },
  headerRight: { width: 36 },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  statusInfo: { flex: 1, marginLeft: Spacing.sm },
  statusLabel: { fontSize: Typography.fontSizeSM, color: Colors.gray600 },
  statusValue: {
    fontSize: Typography.fontSizeLG,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  tab: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: Radius.sm },
  tabActive: { backgroundColor: Colors.black },
  tabText: {
    fontSize: Typography.fontSizeMD,
    fontWeight: Typography.fontWeightMedium,
    color: Colors.gray600,
  },
  tabTextActive: { color: Colors.white },
  sectionTitle: {
    fontSize: Typography.fontSizeLG,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
    marginBottom: Spacing.xs,
  },
  sectionSubtitle: {
    fontSize: Typography.fontSizeSM,
    color: Colors.gray600,
    marginBottom: Spacing.md,
  },
  tierCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray200,
    position: 'relative',
  },
  tierCardCurrent: { borderColor: Colors.black, borderWidth: 2 },
  tierBadge: {
    position: 'absolute',
    top: -10,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.black,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    gap: 4,
  },
  tierBadgeText: {
    fontSize: Typography.fontSizeXS,
    fontWeight: Typography.fontWeightBold,
    color: Colors.white,
  },
  tierName: {
    fontSize: Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
  },
  tierTagline: {
    fontSize: Typography.fontSizeMD,
    color: Colors.gray600,
    marginBottom: Spacing.md,
  },
  tierFeatureList: { marginBottom: Spacing.md },
  tierFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  tierFeatureText: { fontSize: Typography.fontSizeSM, color: Colors.gray800, flex: 1 },
  tierButton: {
    backgroundColor: Colors.black,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  tierButtonCurrent: { backgroundColor: Colors.gray200 },
  tierButtonText: {
    fontSize: Typography.fontSizeMD,
    fontWeight: Typography.fontWeightBold,
    color: Colors.white,
  },
  tierButtonTextCurrent: { color: Colors.gray600 },
  creditCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  creditInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  creditAmountRow: { flexDirection: 'row', alignItems: 'center' },
  creditCount: {
    fontSize: Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
    marginLeft: Spacing.xs,
  },
  creditLabel: { fontSize: Typography.fontSizeMD, color: Colors.gray600, marginLeft: Spacing.xs },
  creditPrice: {
    fontSize: Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
  },
  perUnitText: { fontSize: Typography.fontSizeSM, color: Colors.gray600, marginTop: Spacing.xs },
  creditLoader: { position: 'absolute', right: Spacing.md, top: '50%', marginTop: -10 },
  creditNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
  },
  creditNoteText: {
    flex: 1,
    fontSize: Typography.fontSizeSM,
    color: Colors.gray600,
    marginLeft: Spacing.sm,
    lineHeight: 20,
  },
});
