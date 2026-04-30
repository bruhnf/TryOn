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
import api from '../config/api';

interface CreditPackage {
  id: string;
  credits: number;
  price: number;
  popular?: boolean;
}

const CREDIT_PACKAGES: CreditPackage[] = [
  { id: 'credits_10', credits: 10, price: 5 },
  { id: 'credits_50', credits: 50, price: 45, popular: true },
  { id: 'credits_100', credits: 100, price: 85 },
];

const SUBSCRIPTION_PRICE = 20;
const SUBSCRIPTION_TRYONS_PER_DAY = 15;

export default function PurchaseScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user, refreshUser } = useUserStore();
  const [selectedTab, setSelectedTab] = useState<'subscription' | 'credits'>('subscription');
  const [loading, setLoading] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      // In a real app, this would open a payment sheet (Stripe, RevenueCat, etc.)
      // For now, we'll simulate the purchase flow
      Alert.alert(
        'Subscribe',
        `Subscribe for $${SUBSCRIPTION_PRICE}/month?\n\nIncludes ${SUBSCRIPTION_TRYONS_PER_DAY} try-ons per day.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Subscribe',
            onPress: async () => {
              try {
                // This would integrate with your payment provider
                // For demo, we'll call a mock endpoint
                await api.post('/credits/subscribe');
                await refreshUser();
                Alert.alert('Success', 'You are now subscribed!', [
                  { text: 'OK', onPress: () => navigation.goBack() },
                ]);
              } catch (err) {
                Alert.alert('Error', 'Could not complete subscription. Please try again.');
              }
            },
          },
        ],
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePurchaseCredits = async (pkg: CreditPackage) => {
    setLoading(true);
    setSelectedPackage(pkg.id);
    try {
      Alert.alert(
        'Purchase Credits',
        `Buy ${pkg.credits} credits for $${pkg.price}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Purchase',
            onPress: async () => {
              try {
                // This would integrate with your payment provider
                await api.post('/credits/purchase', { packageId: pkg.id, credits: pkg.credits });
                await refreshUser();
                Alert.alert('Success', `${pkg.credits} credits added to your account!`, [
                  { text: 'OK', onPress: () => navigation.goBack() },
                ]);
              } catch (err) {
                Alert.alert('Error', 'Could not complete purchase. Please try again.');
              }
            },
          },
        ],
      );
    } finally {
      setLoading(false);
      setSelectedPackage(null);
    }
  };

  const isSubscribed = user?.isSubscribed ?? false;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Get More Try-Ons</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Current Status */}
        <View style={styles.statusCard}>
          <Ionicons name="wallet-outline" size={24} color={Colors.gray600} />
          <View style={styles.statusInfo}>
            <Text style={styles.statusLabel}>Current Balance</Text>
            <Text style={styles.statusValue}>{user?.credits ?? 0} credits</Text>
          </View>
          {isSubscribed && (
            <View style={styles.subscribedBadge}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
              <Text style={styles.subscribedText}>Subscribed</Text>
            </View>
          )}
        </View>

        {/* Tab Selector */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'subscription' && styles.tabActive]}
            onPress={() => setSelectedTab('subscription')}
          >
            <Text style={[styles.tabText, selectedTab === 'subscription' && styles.tabTextActive]}>
              Subscription
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'credits' && styles.tabActive]}
            onPress={() => setSelectedTab('credits')}
          >
            <Text style={[styles.tabText, selectedTab === 'credits' && styles.tabTextActive]}>
              Credits
            </Text>
          </TouchableOpacity>
        </View>

        {selectedTab === 'subscription' ? (
          /* Subscription Section */
          <View style={styles.section}>
            <View style={styles.subscriptionCard}>
              <View style={styles.subscriptionHeader}>
                <View style={styles.bestValueBadge}>
                  <Ionicons name="star" size={12} color={Colors.white} />
                  <Text style={styles.bestValueText}>BEST VALUE</Text>
                </View>
              </View>
              
              <Text style={styles.subscriptionTitle}>Monthly Subscription</Text>
              <View style={styles.priceRow}>
                <Text style={styles.priceAmount}>${SUBSCRIPTION_PRICE}</Text>
                <Text style={styles.pricePeriod}>/month</Text>
              </View>

              <View style={styles.featureList}>
                <View style={styles.featureItem}>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                  <Text style={styles.featureText}>
                    {SUBSCRIPTION_TRYONS_PER_DAY} try-ons per day included
                  </Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                  <Text style={styles.featureText}>Priority processing</Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                  <Text style={styles.featureText}>Unlimited outfit saves</Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                  <Text style={styles.featureText}>Cancel anytime</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.subscribeButton, isSubscribed && styles.subscribedButton]}
                onPress={handleSubscribe}
                disabled={loading || isSubscribed}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.subscribeButtonText}>
                    {isSubscribed ? 'Already Subscribed' : 'Subscribe Now'}
                  </Text>
                )}
              </TouchableOpacity>

              <Text style={styles.termsText}>
                Subscription renews automatically. Cancel anytime in settings.
              </Text>
            </View>
          </View>
        ) : (
          /* Credits Section */
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Credit Packages</Text>
            <Text style={styles.sectionSubtitle}>
              Credits never expire. Use them anytime for try-ons.
            </Text>

            {CREDIT_PACKAGES.map((pkg) => (
              <TouchableOpacity
                key={pkg.id}
                style={[styles.creditCard, pkg.popular && styles.creditCardPopular]}
                onPress={() => handlePurchaseCredits(pkg)}
                disabled={loading}
              >
                {pkg.popular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>POPULAR</Text>
                  </View>
                )}
                <View style={styles.creditInfo}>
                  <View style={styles.creditAmount}>
                    <Ionicons name="flash" size={20} color={Colors.warning} />
                    <Text style={styles.creditCount}>{pkg.credits}</Text>
                    <Text style={styles.creditLabel}>credits</Text>
                  </View>
                  <Text style={styles.creditPrice}>${pkg.price}</Text>
                </View>
                <View style={styles.creditPerUnit}>
                  <Text style={styles.perUnitText}>
                    ${(pkg.price / pkg.credits).toFixed(2)}/credit
                  </Text>
                </View>
                {loading && selectedPackage === pkg.id && (
                  <ActivityIndicator style={styles.creditLoader} color={Colors.black} />
                )}
              </TouchableOpacity>
            ))}

            <View style={styles.creditNote}>
              <Ionicons name="information-circle-outline" size={18} color={Colors.gray600} />
              <Text style={styles.creditNoteText}>
                Each try-on uses 1 credit. Subscribers get {SUBSCRIPTION_TRYONS_PER_DAY} free daily.
              </Text>
            </View>
          </View>
        )}

        {/* FAQ Section */}
        <View style={styles.faqSection}>
          <Text style={styles.faqTitle}>Frequently Asked Questions</Text>
          
          <View style={styles.faqItem}>
            <Text style={styles.faqQuestion}>How do credits work?</Text>
            <Text style={styles.faqAnswer}>
              Each virtual try-on uses 1 credit. Credits never expire and can be used anytime.
            </Text>
          </View>
          
          <View style={styles.faqItem}>
            <Text style={styles.faqQuestion}>What's included in the subscription?</Text>
            <Text style={styles.faqAnswer}>
              Subscribers get {SUBSCRIPTION_TRYONS_PER_DAY} try-ons per day included. If you need more, credits are used automatically.
            </Text>
          </View>
          
          <View style={styles.faqItem}>
            <Text style={styles.faqQuestion}>Can I cancel my subscription?</Text>
            <Text style={styles.faqAnswer}>
              Yes! You can cancel anytime from Settings. You'll keep access until the end of your billing period.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray100,
  },
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
  closeButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: Typography.fontSizeXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
  },
  headerRight: {
    width: 36,
  },
  content: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  statusInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  statusLabel: {
    fontSize: Typography.fontSizeSM,
    color: Colors.gray600,
  },
  statusValue: {
    fontSize: Typography.fontSizeLG,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
  },
  subscribedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  subscribedText: {
    fontSize: Typography.fontSizeXS,
    fontWeight: Typography.fontWeightSemiBold,
    color: Colors.success,
    marginLeft: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  tabActive: {
    backgroundColor: Colors.black,
  },
  tabText: {
    fontSize: Typography.fontSizeMD,
    fontWeight: Typography.fontWeightMedium,
    color: Colors.gray600,
  },
  tabTextActive: {
    color: Colors.white,
  },
  section: {
    marginBottom: Spacing.lg,
  },
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
  subscriptionCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 2,
    borderColor: Colors.black,
  },
  subscriptionHeader: {
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  bestValueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.black,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  bestValueText: {
    fontSize: Typography.fontSizeXS,
    fontWeight: Typography.fontWeightBold,
    color: Colors.white,
    marginLeft: 4,
  },
  subscriptionTitle: {
    fontSize: Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
    marginBottom: Spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: Spacing.md,
  },
  priceAmount: {
    fontSize: 36,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
  },
  pricePeriod: {
    fontSize: Typography.fontSizeLG,
    color: Colors.gray600,
    marginLeft: 4,
  },
  featureList: {
    marginBottom: Spacing.lg,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  featureText: {
    fontSize: Typography.fontSizeMD,
    color: Colors.gray800,
    marginLeft: Spacing.sm,
  },
  subscribeButton: {
    backgroundColor: Colors.black,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  subscribedButton: {
    backgroundColor: Colors.gray400,
  },
  subscribeButtonText: {
    fontSize: Typography.fontSizeLG,
    fontWeight: Typography.fontWeightBold,
    color: Colors.white,
  },
  termsText: {
    fontSize: Typography.fontSizeXS,
    color: Colors.gray600,
    textAlign: 'center',
  },
  creditCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  creditCardPopular: {
    borderColor: Colors.warning,
    borderWidth: 2,
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: Spacing.md,
    backgroundColor: Colors.warning,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  popularBadgeText: {
    fontSize: Typography.fontSizeXS,
    fontWeight: Typography.fontWeightBold,
    color: Colors.white,
  },
  creditInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  creditAmount: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  creditCount: {
    fontSize: Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
    marginLeft: Spacing.xs,
  },
  creditLabel: {
    fontSize: Typography.fontSizeMD,
    color: Colors.gray600,
    marginLeft: Spacing.xs,
  },
  creditPrice: {
    fontSize: Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
  },
  creditPerUnit: {
    marginTop: Spacing.xs,
  },
  perUnitText: {
    fontSize: Typography.fontSizeSM,
    color: Colors.gray600,
  },
  creditLoader: {
    position: 'absolute',
    right: Spacing.md,
    top: '50%',
    marginTop: -10,
  },
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
  faqSection: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  faqTitle: {
    fontSize: Typography.fontSizeLG,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
    marginBottom: Spacing.md,
  },
  faqItem: {
    marginBottom: Spacing.md,
  },
  faqQuestion: {
    fontSize: Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemiBold,
    color: Colors.black,
    marginBottom: Spacing.xs,
  },
  faqAnswer: {
    fontSize: Typography.fontSizeSM,
    color: Colors.gray600,
    lineHeight: 20,
  },
});
