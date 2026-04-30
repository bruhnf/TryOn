import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../constants/theme';
import HeaderMenu from '../components/HeaderMenu';

export default function InboxScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <HeaderMenu title="Inbox" />
      <View style={styles.emptyState}>
        <Ionicons name="mail-outline" size={56} color={Colors.gray200} />
        <Text style={styles.emptyTitle}>No messages yet</Text>
        <Text style={styles.emptySubtitle}>
          Notifications and messages from friends will appear here.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: Typography.fontSizeXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
  },
  emptySubtitle: {
    fontSize: Typography.fontSizeMD,
    color: Colors.gray600,
    textAlign: 'center',
    lineHeight: 22,
  },
});
