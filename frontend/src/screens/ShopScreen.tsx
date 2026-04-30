import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import HeaderMenu from '../components/HeaderMenu';

export default function ShopScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <HeaderMenu title="Shop" />

      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Placeholder content */}
        <View style={styles.placeholder}>
          <View style={styles.iconContainer}>
            <Ionicons name="bag-outline" size={64} color={Colors.gray400} />
          </View>
          <Text style={styles.placeholderTitle}>Shop Coming Soon</Text>
          <Text style={styles.placeholderText}>
            Browse and shop clothing items directly from try-on results. Save your favorites and purchase with a tap.
          </Text>
        </View>

        {/* Feature preview cards */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>What's Coming</Text>
          
          <View style={styles.featureCard}>
            <View style={styles.featureIcon}>
              <Ionicons name="heart-outline" size={24} color={Colors.black} />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Save Favorites</Text>
              <Text style={styles.featureDescription}>
                Heart items from any try-on to save them to your wishlist
              </Text>
            </View>
          </View>

          <View style={styles.featureCard}>
            <View style={styles.featureIcon}>
              <Ionicons name="search-outline" size={24} color={Colors.black} />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Discover Styles</Text>
              <Text style={styles.featureDescription}>
                Browse trending outfits and clothing from the community
              </Text>
            </View>
          </View>

          <View style={styles.featureCard}>
            <View style={styles.featureIcon}>
              <Ionicons name="cart-outline" size={24} color={Colors.black} />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Easy Checkout</Text>
              <Text style={styles.featureDescription}>
                Purchase items directly from partnered retailers
              </Text>
            </View>
          </View>

          <View style={styles.featureCard}>
            <View style={styles.featureIcon}>
              <Ionicons name="notifications-outline" size={24} color={Colors.black} />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Price Alerts</Text>
              <Text style={styles.featureDescription}>
                Get notified when saved items go on sale
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  content: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  placeholder: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  placeholderTitle: {
    fontSize: Typography.fontSizeXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
    marginBottom: Spacing.sm,
  },
  placeholderText: {
    fontSize: Typography.fontSizeMD,
    color: Colors.gray600,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
    lineHeight: 22,
  },
  featuresSection: {
    marginTop: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.fontSizeLG,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
    marginBottom: Spacing.md,
  },
  featureCard: {
    flexDirection: 'row',
    backgroundColor: Colors.gray100,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemiBold,
    color: Colors.black,
    marginBottom: 2,
  },
  featureDescription: {
    fontSize: Typography.fontSizeSM,
    color: Colors.gray600,
    lineHeight: 18,
  },
});
