import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import api from '../config/api';
import { useUserStore } from '../store/useUserStore';
import * as WebBrowser from 'expo-web-browser';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import { Colors, Typography, Spacing } from '../constants/theme';
import { RootStackParams } from '../navigation';
import { MANAGE_SUBSCRIPTIONS_URL, restorePurchases } from '../services/iap';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '../constants/legal';

type SettingsNavProp = NativeStackNavigationProp<RootStackParams, 'Settings'>;

export default function SettingsScreen() {
  const navigation = useNavigation<SettingsNavProp>();
  const { user, logout, refreshUser } = useUserStore();
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [restoring, setRestoring] = useState(false);

  async function handleRestorePurchases() {
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
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not restore purchases.');
    } finally {
      setRestoring(false);
    }
  }

  function handleManageSubscription() {
    Linking.openURL(MANAGE_SUBSCRIPTIONS_URL).catch(() =>
      Alert.alert('Could not open', 'Open the App Store app and go to your account settings.'),
    );
  }

  function handleLogout() {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account, all body photos, try-on results, and personal data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: async () => {
            setDeletingAccount(true);
            try {
              await api.delete('/profile/me');
              await logout();
            } catch {
              Alert.alert('Error', 'Could not delete account. Please try again or contact support.');
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ],
    );
  }

  const [exporting, setExporting] = useState(false);

  async function handleExportData() {
    Alert.alert(
      'Export Your Data',
      'A JSON file containing your profile, try-on history, location records, credit transactions, and other account data will be generated. You can save it or share it with another app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          onPress: async () => {
            setExporting(true);
            try {
              const { data } = await api.get('/profile/me/export', { responseType: 'json' });
              const filename = `tryon-export-${user?.username ?? 'me'}-${new Date().toISOString().slice(0, 10)}.json`;
              const fileUri = `${FileSystem.documentDirectory}${filename}`;
              await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(data, null, 2), {
                encoding: FileSystem.EncodingType.UTF8,
              });
              const canShare = await Sharing.isAvailableAsync();
              if (canShare) {
                await Sharing.shareAsync(fileUri, {
                  mimeType: 'application/json',
                  dialogTitle: 'Save your TryOn data export',
                  UTI: 'public.json',
                });
              } else {
                Alert.alert('Saved', `Export written to ${fileUri}`);
              }
            } catch {
              Alert.alert('Error', 'Could not export your data. Please try again later.');
            } finally {
              setExporting(false);
            }
          },
        },
      ],
    );
  }

  function handleDeletePhotos() {
    Alert.alert(
      'Delete All Body Photos',
      'This will remove all your body photos and they will no longer be available for try-on. Try-on results already generated will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Photos',
          style: 'destructive',
          onPress: async () => {
            try {
              await Promise.all([
                api.delete('/upload/avatar').catch(() => {}),
                api.delete('/upload/full-body').catch(() => {}),
                api.delete('/upload/medium-body').catch(() => {}),
              ]);
              Alert.alert('Done', 'Your body photos have been removed.');
            } catch {
              Alert.alert('Error', 'Some photos could not be removed.');
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView style={styles.container}>
      <SectionHeader label="Account" />
      <SettingRow label="Email" value={user?.email} />
      <SettingRow label="Username" value={`@${user?.username}`} />
      <SettingRow label="Tier" value={user?.tier ?? 'FREE'} />
      <SettingRow label="Credits" value={String(user?.credits ?? 0)} />
      <SettingButton label="Change Password" onPress={() => navigation.navigate('ChangePassword')} />

      <SectionHeader label="Subscription" />
      <SettingButton
        label={restoring ? 'Restoring…' : 'Restore Purchases'}
        onPress={handleRestorePurchases}
        disabled={restoring}
      />
      {Platform.OS === 'ios' ? (
        <SettingButton label="Manage Subscription" onPress={handleManageSubscription} />
      ) : null}

      <SectionHeader label="Privacy & Data" />
      <SettingButton label="Blocked Users" onPress={() => navigation.navigate('BlockedUsers')} />
      <SettingButton label="Delete All Body Photos" onPress={handleDeletePhotos} />
      <SettingButton
        label={exporting ? 'Exporting…' : 'Export My Data (GDPR/CCPA)'}
        onPress={handleExportData}
        disabled={exporting}
      />

      <SectionHeader label="Legal" />
      <SettingButton label="Privacy Policy" onPress={() => WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)} />
      <SettingButton label="Terms of Service" onPress={() => WebBrowser.openBrowserAsync(TERMS_OF_SERVICE_URL)} />

      {user?.isAdmin ? (
        <>
          <SectionHeader label="Admin" />
          <SettingButton label="Admin Console" onPress={() => navigation.navigate('AdminConsole')} />
        </>
      ) : null}

      <SectionHeader label="Session" />
      <SettingButton label="Log Out" onPress={handleLogout} />

      <View style={styles.dangerSection}>
        <SectionHeader label="Danger Zone" danger />
        <SettingButton
          label={deletingAccount ? 'Deleting...' : 'Delete Account'}
          danger
          onPress={handleDeleteAccount}
          disabled={deletingAccount}
        />
      </View>

      <Text style={styles.version}>
        TryOn v{Constants.expoConfig?.version ?? ''}
        {Constants.expoConfig?.ios?.buildNumber ? ` (${Constants.expoConfig.ios.buildNumber})` : ''}
      </Text>
    </ScrollView>
  );
}

function SectionHeader({ label, danger }: { label: string; danger?: boolean }) {
  return (
    <Text style={[styles.sectionHeader, danger && styles.dangerText]}>{label}</Text>
  );
}

function SettingRow({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingValue}>{value ?? '—'}</Text>
    </View>
  );
}

function SettingButton({
  label,
  onPress,
  danger,
  disabled,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.settingButton, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.settingButtonText, danger && styles.dangerText]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  sectionHeader: {
    fontSize: Typography.fontSizeSM,
    fontWeight: Typography.fontWeightSemiBold,
    color: Colors.gray400,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.gray100,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderColor: Colors.gray100,
  },
  settingLabel: { fontSize: Typography.fontSizeMD, color: Colors.black },
  settingValue: { fontSize: Typography.fontSizeMD, color: Colors.gray600 },
  settingButton: { padding: Spacing.md, borderBottomWidth: 1, borderColor: Colors.gray100 },
  settingButtonText: { fontSize: Typography.fontSizeMD, color: Colors.black },
  dangerSection: { marginTop: Spacing.xl },
  dangerText: { color: Colors.danger },
  disabled: { opacity: 0.5 },
  version: {
    fontSize: Typography.fontSizeSM,
    color: Colors.gray400,
    textAlign: 'center',
    padding: Spacing.xl,
  },
});
