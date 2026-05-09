import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as IAP from 'expo-iap';
import * as WebBrowser from 'expo-web-browser';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '../constants/legal';
import { useUserStore } from '../store/useUserStore';
import { UserTier } from '../types';
import {
  CREDITS_FOR_SKU,
  CREDIT_PACK_SKUS,
  DisplayProduct,
  MANAGE_SUBSCRIPTIONS_URL,
  endIap,
  fetchProducts,
  initIap,
  purchaseCreditPack,
  purchaseSubscription,
  restorePurchases,
  verifyAndFinish,
} from '../services/iap';
import Constants from 'expo-constants';

type AppleProductsConfig = {
  subscriptions: { basicMonthly: string; premiumMonthly: string };
  credits: { '10': string; '25': string; '50': string; '100': string };
};

const APPLE_PRODUCTS: AppleProductsConfig =
  (Constants.expoConfig?.extra as { appleProducts?: AppleProductsConfig })?.appleProducts ??
  ({} as AppleProductsConfig);

const TIER_FEATURES: Record<UserTier, { name: string; tagline: string; features: string[]; sku?: string; tier: UserTier; badge?: string }> = {
  FREE: {
    tier: 'FREE',
    name: 'Free',
    tagline: 'Get started with free credits',
    features: ['10 free credits when you join', 'Buy credits anytime', 'Full access to community feed'],
  },
  BASIC: {
    tier: 'BASIC',
    name: 'Basic',
    tagline: '2 try-ons every day',
    features: ['2 daily try-on sessions included', 'Cheaper credit pricing', 'Priority queue'],
    sku: APPLE_PRODUCTS.subscriptions?.basicMonthly,
  },
  PREMIUM: {
    tier: 'PREMIUM',
    name: 'Premium',
    tagline: '4 try-ons every day',
    features: ['4 daily try-on sessions included', 'Best credit pricing', 'Top-priority queue'],
    sku: APPLE_PRODUCTS.subscriptions?.premiumMonthly,
    badge: 'BEST VALUE',
  },
};

const CREDIT_TIERS: UserTier[] = ['FREE', 'BASIC', 'PREMIUM'];

export default function PurchaseScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user, refreshUser } = useUserStore();
  const [selectedTab, setSelectedTab] = useState<'tiers' | 'credits'>('tiers');
  const [busy, setBusy] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<DisplayProduct[]>([]);
  const [creditPacks, setCreditPacks] = useState<DisplayProduct[]>([]);

  const currentTier: UserTier = user?.tier ?? 'FREE';

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        await initIap();
        const products = await fetchProducts();
        if (cancelled) return;
        setSubscriptions(products.subscriptions);
        setCreditPacks(products.credits);
        setProductsError(null);
      } catch (err) {
        if (!cancelled) {
          setProductsError(err instanceof Error ? err.message : 'Could not load products');
        }
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for purchase results from StoreKit. When a purchase completes we
  // verify the JWS with the backend, which is the actual entitlement grant.
  useEffect(() => {
    const updateSub = IAP.purchaseUpdatedListener(async (purchase: unknown) => {
      try {
        const result = await verifyAndFinish(purchase as never);
        await refreshUser();

        if (result.fastPathSkipped) {
          // Backend webhook is the source of truth. Poll a few times to pick up
          // the credit/tier update once Apple delivers the webhook.
          Alert.alert('Purchase confirmed', 'Your account is being updated — this can take a few seconds.');
          for (let i = 0; i < 5; i += 1) {
            await new Promise((r) => setTimeout(r, 2000));
            await refreshUser();
          }
        } else if (result.alreadyProcessed) {
          Alert.alert('Already on file', 'This purchase was already applied to your account.');
        } else {
          Alert.alert('Purchase complete', 'Your account has been updated.');
        }
      } catch (err) {
        Alert.alert(
          'Purchase verification failed',
          err instanceof Error ? err.message : 'Please try Restore Purchases.',
        );
      } finally {
        setBusy(null);
      }
    });
    const errSub = IAP.purchaseErrorListener((err: { code?: string; message?: string }) => {
      setBusy(null);
      // User-cancelled is not an error worth surfacing.
      if (err && err.code !== 'E_USER_CANCELLED') {
        Alert.alert('Purchase failed', err.message ?? 'Unknown error.');
      }
    });
    return () => {
      updateSub.remove();
      errSub.remove();
    };
  }, [refreshUser]);

  // Tear down the IAP connection when leaving the screen.
  useEffect(() => () => { void endIap(); }, []);

  function priceForSku(sku?: string): string {
    if (!sku) return '';
    const sub = subscriptions.find((p) => p.sku === sku);
    if (sub) return sub.displayPrice;
    const pack = creditPacks.find((p) => p.sku === sku);
    if (pack) return pack.displayPrice;
    return '';
  }

  async function handleSubscribe(tier: UserTier) {
    if (!user) return;
    const config = TIER_FEATURES[tier];
    if (!config.sku) {
      Alert.alert('Unavailable', 'This tier is not available for purchase.');
      return;
    }
    if (tier === currentTier) return;
    setBusy(config.sku);
    try {
      await purchaseSubscription(config.sku, user.id);
      // Result lands in the purchaseUpdatedListener.
    } catch (err) {
      setBusy(null);
      Alert.alert('Purchase failed', err instanceof Error ? err.message : 'Unknown error.');
    }
  }

  async function handleBuyCredits(sku: string) {
    if (!user) return;
    setBusy(sku);
    try {
      await purchaseCreditPack(sku, user.id);
    } catch (err) {
      setBusy(null);
      Alert.alert('Purchase failed', err instanceof Error ? err.message : 'Unknown error.');
    }
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      const { restoredCount } = await restorePurchases();
      await refreshUser();
      Alert.alert(
        restoredCount > 0 ? 'Purchases Restored' : 'No Purchases Found',
        restoredCount > 0
          ? `Restored ${restoredCount} purchase${restoredCount === 1 ? '' : 's'}.`
          : 'We did not find any prior purchases for this Apple ID.',
      );
    } catch (err) {
      Alert.alert('Restore failed', err instanceof Error ? err.message : 'Unknown error.');
    } finally {
      setRestoring(false);
    }
  }

  function handleManageSubscription() {
    Linking.openURL(MANAGE_SUBSCRIPTIONS_URL).catch(() =>
      Alert.alert('Could not open', 'Open the App Store app and go to your account settings.'),
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
            <Text style={styles.statusValue}>
              {TIER_FEATURES[currentTier].name} · {user?.credits ?? 0} credits
            </Text>
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

        {productsLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={Colors.black} />
            <Text style={styles.loadingText}>Loading prices from the App Store…</Text>
          </View>
        ) : productsError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{productsError}</Text>
          </View>
        ) : selectedTab === 'tiers' ? (
          <View>
            {CREDIT_TIERS.map((tierKey) => {
              const tier = TIER_FEATURES[tierKey];
              const isCurrent = tier.tier === currentTier;
              const localizedPrice = priceForSku(tier.sku);
              const isBusy = busy === tier.sku;
              return (
                <View key={tier.tier} style={[styles.tierCard, isCurrent && styles.tierCardCurrent]}>
                  {tier.badge ? (
                    <View style={styles.tierBadge}>
                      <Ionicons name="star" size={11} color={Colors.white} />
                      <Text style={styles.tierBadgeText}>{tier.badge}</Text>
                    </View>
                  ) : null}

                  <Text style={styles.tierName}>{tier.name}</Text>
                  <View style={styles.tierPriceRow}>
                    <Text style={styles.tierPriceAmount}>{localizedPrice || (tier.sku ? '—' : 'Free')}</Text>
                    {tier.sku ? <Text style={styles.tierPricePer}>/month</Text> : null}
                  </View>
                  <Text style={styles.tierTagline}>{tier.tagline}</Text>

                  <View style={styles.tierFeatureList}>
                    {tier.features.map((f) => (
                      <View key={f} style={styles.tierFeatureItem}>
                        <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                        <Text style={styles.tierFeatureText}>{f}</Text>
                      </View>
                    ))}
                  </View>

                  {tier.sku ? (
                    <>
                      <TouchableOpacity
                        style={[styles.tierButton, isCurrent && styles.tierButtonCurrent]}
                        onPress={() => handleSubscribe(tier.tier)}
                        disabled={isBusy || isCurrent || !localizedPrice}
                      >
                        {isBusy ? (
                          <ActivityIndicator color={Colors.white} />
                        ) : (
                          <Text style={[styles.tierButtonText, isCurrent && styles.tierButtonTextCurrent]}>
                            {isCurrent ? 'Current Tier' : `Subscribe for ${localizedPrice}/month`}
                          </Text>
                        )}
                      </TouchableOpacity>

                      {/* App Store Review Guideline 3.1.2(a): auto-renew disclosure
                          must appear adjacent to the subscribe action. */}
                      <Text style={styles.subscribeDisclosure}>
                        Auto-renews monthly at {localizedPrice || tier.name + ' price'}. Cancel anytime in
                        Settings &gt; Apple ID &gt; Subscriptions; cancellation takes effect at the end
                        of the current period. By subscribing you agree to our{' '}
                        <Text
                          style={styles.disclosureLink}
                          onPress={() => WebBrowser.openBrowserAsync(TERMS_OF_SERVICE_URL)}
                        >
                          Terms of Service
                        </Text>
                        {' '}and{' '}
                        <Text
                          style={styles.disclosureLink}
                          onPress={() => WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)}
                        >
                          Privacy Policy
                        </Text>
                        .
                      </Text>
                    </>
                  ) : (
                    <View style={[styles.tierButton, styles.tierButtonCurrent]}>
                      <Text style={[styles.tierButtonText, styles.tierButtonTextCurrent]}>
                        {isCurrent ? 'Current Tier' : 'Free'}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}

            <TouchableOpacity
              style={styles.restoreButton}
              onPress={handleRestore}
              disabled={restoring}
            >
              {restoring ? (
                <ActivityIndicator color={Colors.black} />
              ) : (
                <Text style={styles.restoreButtonText}>Restore Purchases</Text>
              )}
            </TouchableOpacity>

            {Platform.OS === 'ios' ? (
              <TouchableOpacity style={styles.manageButton} onPress={handleManageSubscription}>
                <Text style={styles.manageButtonText}>Manage Subscription</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View>
            <Text style={styles.sectionTitle}>Buy Credits</Text>
            <Text style={styles.sectionSubtitle}>
              Credits never expire. Daily try-on allowance is used first; credits are spent only
              after the daily allowance runs out.
            </Text>

            {CREDIT_PACK_SKUS.map((sku) => {
              const pack = creditPacks.find((p) => p.sku === sku);
              const credits = CREDITS_FOR_SKU[sku] ?? 0;
              const isBusy = busy === sku;
              if (!pack) return null;
              return (
                <TouchableOpacity
                  key={sku}
                  style={styles.creditCard}
                  onPress={() => handleBuyCredits(sku)}
                  disabled={isBusy}
                >
                  <View style={styles.creditInfo}>
                    <View style={styles.creditAmountRow}>
                      <Ionicons name="flash" size={20} color={Colors.warning} />
                      <Text style={styles.creditCount}>{credits}</Text>
                      <Text style={styles.creditLabel}>credits</Text>
                    </View>
                    <Text style={styles.creditPrice}>{pack.displayPrice}</Text>
                  </View>
                  {isBusy ? (
                    <ActivityIndicator style={styles.creditLoader} color={Colors.black} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
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
  loadingBox: { alignItems: 'center', padding: Spacing.xl, gap: Spacing.sm },
  loadingText: { color: Colors.gray600, fontSize: Typography.fontSizeSM },
  errorBox: {
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.danger,
  },
  errorText: { color: Colors.danger, fontSize: Typography.fontSizeSM },
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
  tierPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
    marginBottom: Spacing.xs,
  },
  tierPriceAmount: {
    fontSize: Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
  },
  tierPricePer: {
    fontSize: Typography.fontSizeSM,
    color: Colors.gray600,
    marginLeft: 2,
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
  subscribeDisclosure: {
    fontSize: Typography.fontSizeXS,
    color: Colors.gray600,
    lineHeight: 16,
    marginTop: Spacing.sm,
  },
  disclosureLink: {
    color: Colors.black,
    textDecorationLine: 'underline',
  },
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
  creditLoader: { position: 'absolute', right: Spacing.md, top: '50%', marginTop: -10 },
  restoreButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.black,
    backgroundColor: Colors.white,
  },
  restoreButtonText: {
    fontSize: Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemiBold,
    color: Colors.black,
  },
  manageButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },
  manageButtonText: {
    fontSize: Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemiBold,
    color: Colors.black,
    textDecorationLine: 'underline',
  },
});
