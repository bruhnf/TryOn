import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import api from '../config/api';
import { useUserStore } from '../store/useUserStore';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { RootStackParams } from '../navigation';

type SettingsNavProp = NativeStackNavigationProp<RootStackParams, 'Settings'>;

export default function SettingsScreen() {
  const navigation = useNavigation<SettingsNavProp>();
  const { user, logout } = useUserStore();
  const [deletingAccount, setDeletingAccount] = useState(false);

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

  function handleExportData() {
    Alert.alert(
      'Export Your Data',
      'We will email you a copy of your personal data including your profile, body photo metadata, and try-on history within 72 hours.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request Export',
          onPress: () =>
            Alert.alert('Request Submitted', 'You will receive an email within 72 hours.'),
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
      <SettingRow label="Subscription" value={user?.subscriptionLevel} />

      <SectionHeader label="Privacy & Data" />
      <SettingButton label="Delete All Body Photos" onPress={handleDeletePhotos} />
      <SettingButton label="Export My Data (GDPR/CCPA)" onPress={handleExportData} />

      <SectionHeader label="Legal" />
      <SettingButton label="Privacy Policy" onPress={() => Alert.alert('Privacy Policy', 'Open privacy policy URL')} />
      <SettingButton label="Terms of Service" onPress={() => Alert.alert('Terms of Service', 'Open ToS URL')} />

      <SectionHeader label="Developer" />
      <SettingButton label="Admin Console" onPress={() => navigation.navigate('AdminConsole')} />

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

      <Text style={styles.version}>TryOn v1.0.0</Text>
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
