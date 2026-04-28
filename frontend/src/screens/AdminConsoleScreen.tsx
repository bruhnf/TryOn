import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  Switch,
  RefreshControl,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import axios from 'axios';
import { BASE_URL } from '../config/api';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { RootStackParams } from '../navigation';

type Props = { navigation: NativeStackNavigationProp<RootStackParams, 'AdminConsole'> };

interface AdminUser {
  id: string;
  username: string;
  email: string;
  verified: boolean;
  subscriptionLevel: 'BASIC' | 'PRO' | 'PREMIUM';
  createdAt: string;
}

interface Stats {
  userCount: number;
  jobCount: number;
  completedJobs: number;
}

export default function AdminConsoleScreen({ navigation }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const adminApi = axios.create({
    baseURL: BASE_URL,
    headers: { 'x-admin-key': apiKey },
  });

  async function authenticate() {
    if (!apiKey.trim()) {
      Alert.alert('Error', 'Please enter the admin API key');
      return;
    }
    setLoading(true);
    try {
      const [usersRes, statsRes] = await Promise.all([
        adminApi.get<AdminUser[]>('/admin/users'),
        adminApi.get<Stats>('/admin/stats'),
      ]);
      setUsers(usersRes.data);
      setStats(statsRes.data);
      setAuthenticated(true);
    } catch (err) {
      Alert.alert('Authentication Failed', 'Invalid admin API key');
    } finally {
      setLoading(false);
    }
  }

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [usersRes, statsRes] = await Promise.all([
        adminApi.get<AdminUser[]>('/admin/users'),
        adminApi.get<Stats>('/admin/stats'),
      ]);
      setUsers(usersRes.data);
      setStats(statsRes.data);
    } catch {
      Alert.alert('Error', 'Failed to refresh data');
    } finally {
      setRefreshing(false);
    }
  }, [apiKey]);

  async function toggleVerified(user: AdminUser) {
    try {
      const { data } = await adminApi.patch(`/admin/user/${user.id}/verify`, {
        verified: !user.verified,
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, verified: data.verified } : u))
      );
    } catch {
      Alert.alert('Error', 'Failed to update user');
    }
  }

  async function changeSubscription(user: AdminUser, level: 'BASIC' | 'PRO' | 'PREMIUM') {
    try {
      const { data } = await adminApi.patch(`/admin/user/${user.id}/subscription`, {
        subscriptionLevel: level,
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, subscriptionLevel: data.subscriptionLevel } : u))
      );
    } catch {
      Alert.alert('Error', 'Failed to update subscription');
    }
  }

  async function deleteUser(user: AdminUser) {
    Alert.alert(
      'Delete User',
      `Are you sure you want to delete ${user.username}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await adminApi.delete(`/admin/user/${user.id}`);
              setUsers((prev) => prev.filter((u) => u.id !== user.id));
              if (stats) setStats({ ...stats, userCount: stats.userCount - 1 });
            } catch {
              Alert.alert('Error', 'Failed to delete user');
            }
          },
        },
      ]
    );
  }

  function showSubscriptionOptions(user: AdminUser) {
    Alert.alert('Change Subscription', `Current: ${user.subscriptionLevel}`, [
      { text: 'BASIC', onPress: () => changeSubscription(user, 'BASIC') },
      { text: 'PRO', onPress: () => changeSubscription(user, 'PRO') },
      { text: 'PREMIUM', onPress: () => changeSubscription(user, 'PREMIUM') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function renderUser({ item }: { item: AdminUser }) {
    return (
      <View style={styles.userCard}>
        <View style={styles.userHeader}>
          <Text style={styles.username}>{item.username}</Text>
          <TouchableOpacity
            style={[styles.subscriptionBadge, styles[`sub${item.subscriptionLevel}`]]}
            onPress={() => showSubscriptionOptions(item)}
          >
            <Text style={styles.subscriptionText}>{item.subscriptionLevel}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.email}>{item.email}</Text>
        <Text style={styles.date}>
          Joined: {new Date(item.createdAt).toLocaleDateString()}
        </Text>
        <View style={styles.userActions}>
          <View style={styles.verifyRow}>
            <Text style={styles.verifyLabel}>Verified:</Text>
            <Switch
              value={item.verified}
              onValueChange={() => toggleVerified(item)}
              trackColor={{ false: Colors.gray300, true: Colors.black }}
              thumbColor={Colors.white}
            />
          </View>
          <TouchableOpacity style={styles.deleteButton} onPress={() => deleteUser(item)}>
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!authenticated) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.authContainer}>
          <Text style={styles.title}>Admin Console</Text>
          <Text style={styles.subtitle}>Enter your admin API key to continue</Text>
          <TextInput
            style={styles.input}
            placeholder="Admin API Key"
            placeholderTextColor={Colors.gray400}
            value={apiKey}
            onChangeText={setApiKey}
            secureTextEntry
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.disabled]}
            onPress={authenticate}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Access Console</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin Console</Text>
        <TouchableOpacity onPress={() => setAuthenticated(false)}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {stats && (
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{stats.userCount}</Text>
            <Text style={styles.statLabel}>Users</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{stats.jobCount}</Text>
            <Text style={styles.statLabel}>Jobs</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{stats.completedJobs}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>Users ({users.length})</Text>

      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        renderItem={renderUser}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No users found</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray100,
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: Spacing.md,
    zIndex: 10,
  },
  backText: {
    fontSize: Typography.body,
    color: Colors.black,
  },
  authContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  title: {
    fontSize: Typography.h1,
    fontWeight: '700',
    color: Colors.black,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.body,
    color: Colors.gray500,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  input: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: Typography.body,
    color: Colors.black,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  primaryButton: {
    backgroundColor: Colors.black,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: Typography.body,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: 60,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  headerTitle: {
    fontSize: Typography.h3,
    fontWeight: '700',
    color: Colors.black,
  },
  logoutText: {
    fontSize: Typography.body,
    color: Colors.gray500,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: Spacing.md,
    backgroundColor: Colors.white,
    marginBottom: Spacing.sm,
  },
  statBox: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: Typography.h2,
    fontWeight: '700',
    color: Colors.black,
  },
  statLabel: {
    fontSize: Typography.caption,
    color: Colors.gray500,
  },
  sectionTitle: {
    fontSize: Typography.body,
    fontWeight: '600',
    color: Colors.gray600,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  list: {
    padding: Spacing.md,
    paddingTop: 0,
  },
  userCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  username: {
    fontSize: Typography.body,
    fontWeight: '600',
    color: Colors.black,
  },
  email: {
    fontSize: Typography.caption,
    color: Colors.gray500,
    marginBottom: Spacing.xs,
  },
  date: {
    fontSize: Typography.caption,
    color: Colors.gray400,
    marginBottom: Spacing.sm,
  },
  userActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
    paddingTop: Spacing.sm,
  },
  verifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verifyLabel: {
    fontSize: Typography.caption,
    color: Colors.gray600,
    marginRight: Spacing.sm,
  },
  deleteButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  deleteText: {
    fontSize: Typography.caption,
    color: '#dc2626',
  },
  subscriptionBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  subBASIC: {
    backgroundColor: Colors.gray200,
  },
  subPRO: {
    backgroundColor: '#3b82f6',
  },
  subPREMIUM: {
    backgroundColor: '#f59e0b',
  },
  subscriptionText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.white,
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.gray400,
    marginTop: Spacing.xl,
  },
});
