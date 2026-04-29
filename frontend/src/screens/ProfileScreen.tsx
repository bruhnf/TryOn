import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import api from '../config/api';
import { useUserStore } from '../store/useUserStore';
import { TryOnJob } from '../types';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { RootStackParams } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParams>;

const MENU_ITEMS = [
  { key: 'edit', label: 'Edit Profile' },
  { key: 'settings', label: 'Settings' },
  { key: 'logout', label: 'Log Out', danger: true },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user, updateUser, logout } = useUserStore();
  const [menuVisible, setMenuVisible] = useState(false);
  const [history, setHistory] = useState<TryOnJob[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  React.useEffect(() => {
    if (!historyLoaded) loadHistory();
  }, []);

  async function loadHistory() {
    try {
      const { data } = await api.get<{ jobs: TryOnJob[] }>('/tryon/history');
      setHistory(data.jobs);
    } catch {}
    setHistoryLoaded(true);
  }

  async function handlePhotoUpload(
    field: 'avatar' | 'fullBody' | 'medium',
    endpoint: string,
    aspect: [number, number],
  ) {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: field === 'avatar',
      aspect: field === 'avatar' ? aspect : undefined,
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(field);
    try {
      const formData = new FormData();
      formData.append('photo', {
        uri: result.assets[0].uri,
        type: result.assets[0].mimeType ?? 'image/jpeg',
        name: `${field}.jpg`,
      } as unknown as Blob);
      const { data } = await api.post<{ url: string }>(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (field === 'avatar') updateUser({ avatarUrl: data.url });
      if (field === 'fullBody') updateUser({ fullBodyUrl: data.url });
      if (field === 'medium') updateUser({ mediumBodyUrl: data.url });
    } catch {
      Alert.alert('Upload Failed', 'Could not upload photo. Please try again.');
    } finally {
      setUploading(null);
    }
  }

  async function handlePhotoDelete(field: 'avatar' | 'fullBody' | 'medium', endpoint: string) {
    Alert.alert('Remove Photo', 'Are you sure you want to remove this photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(endpoint);
            if (field === 'avatar') updateUser({ avatarUrl: undefined });
            if (field === 'fullBody') updateUser({ fullBodyUrl: undefined });
            if (field === 'medium') updateUser({ mediumBodyUrl: undefined });
          } catch {
            Alert.alert('Error', 'Could not remove photo.');
          }
        },
      },
    ]);
  }

  function handleMenuAction(key: string) {
    setMenuVisible(false);
    if (key === 'edit') navigation.navigate('EditProfile');
    if (key === 'settings') navigation.navigate('Settings');
    if (key === 'logout') {
      Alert.alert('Log Out', 'Are you sure you want to log out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', style: 'destructive', onPress: logout },
      ]);
    }
  }

  if (!user) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuButton}>
          <Ionicons name="ellipsis-vertical" size={22} color={Colors.black} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity
            style={styles.avatarWrap}
            onPress={() => handlePhotoUpload('avatar', '/upload/avatar', [1, 1])}
            onLongPress={() => user.avatarUrl && handlePhotoDelete('avatar', '/upload/avatar')}
          >
            {uploading === 'avatar' ? (
              <ActivityIndicator color={Colors.gray400} />
            ) : user.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarPlaceholder}>{user.username[0].toUpperCase()}</Text>
            )}
            <View style={styles.avatarEditBadge}>
              <Ionicons name="add" size={18} color={Colors.white} />
            </View>
          </TouchableOpacity>

          <View style={styles.userInfo}>
            <Text style={styles.username}>{user.username}</Text>
            <Text style={styles.handle}>@{user.username}</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { label: 'Following', value: user.followingCount },
            { label: 'Followers', value: user.followersCount },
            { label: 'Likes', value: user.likesCount },
          ].map((s) => (
            <View key={s.label} style={styles.stat}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}

        {/* Body Photos Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Body Photos</Text>
          <Text style={styles.sectionHint}>
            These are used for try-on. Tap to change. Long-press to remove.
          </Text>
          <View style={styles.bodyPhotosRow}>
            <BodyPhotoSlot
              label="Full Body"
              url={user.fullBodyUrl}
              loading={uploading === 'fullBody'}
              onPress={() => handlePhotoUpload('fullBody', '/upload/full-body', [3, 4])}
              onLongPress={() => user.fullBodyUrl && handlePhotoDelete('fullBody', '/upload/full-body')}
            />
            <BodyPhotoSlot
              label="Waist Up"
              url={user.mediumBodyUrl}
              loading={uploading === 'medium'}
              onPress={() => handlePhotoUpload('medium', '/upload/medium-body', [3, 4])}
              onLongPress={() => user.mediumBodyUrl && handlePhotoDelete('medium', '/upload/medium-body')}
            />
          </View>
        </View>

        {/* Try-On History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Try-On History</Text>
          {!historyLoaded ? (
            <ActivityIndicator color={Colors.gray400} style={{ marginTop: Spacing.lg }} />
          ) : history.length === 0 ? (
            <Text style={styles.emptyHistory}>No try-ons yet. Create your first one!</Text>
          ) : (
            <FlatList
              data={history}
              numColumns={3}
              scrollEnabled={false}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const url = item.resultFullBodyUrl ?? item.resultMediumUrl;
                return (
                  <View style={styles.historyItem}>
                    {url ? (
                      <Image source={{ uri: url }} style={styles.historyImage} resizeMode="cover" />
                    ) : (
                      <View style={[styles.historyImage, styles.historyPlaceholder]}>
                        <Text style={styles.historyStatus}>{item.status}</Text>
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>
      </ScrollView>

      {/* Hamburger dropdown menu */}
      <Modal transparent visible={menuVisible} animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuSheet}>
            {MENU_ITEMS.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={styles.menuItem}
                onPress={() => handleMenuAction(item.key)}
              >
                <Text style={[styles.menuItemText, item.danger && styles.menuItemDanger]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function BodyPhotoSlot({
  label,
  url,
  loading,
  onPress,
  onLongPress,
}: {
  label: string;
  url?: string;
  loading: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.bodyPhotoSlot}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      {loading ? (
        <ActivityIndicator color={Colors.gray400} />
      ) : url ? (
        <Image source={{ uri: url }} style={styles.bodyPhotoImage} resizeMode="cover" />
      ) : (
        <View style={styles.bodyPhotoEmpty}>
          <Text style={styles.bodyPhotoPlusIcon}>+</Text>
          <Text style={styles.bodyPhotoEmptyLabel}>{label}</Text>
        </View>
      )}
      {url && (
        <View style={styles.bodyPhotoLabel}>
          <Text style={styles.bodyPhotoLabelText}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  menuButton: { padding: Spacing.sm },
  avatarSection: { alignItems: 'center', paddingVertical: Spacing.lg },
  avatarWrap: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    position: 'relative',
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: 45 },
  avatarPlaceholder: {
    fontSize: 36,
    fontWeight: Typography.fontWeightBold,
    color: Colors.gray600,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  userInfo: { alignItems: 'center' },
  username: {
    fontSize: Typography.fontSizeLG,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
  },
  handle: { fontSize: Typography.fontSizeSM, color: Colors.gray600, marginTop: 2 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.gray200,
    marginHorizontal: Spacing.md,
  },
  stat: { alignItems: 'center' },
  statValue: {
    fontSize: Typography.fontSizeLG,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
  },
  statLabel: { fontSize: Typography.fontSizeXS, color: Colors.gray600, marginTop: 2 },
  bio: {
    fontSize: Typography.fontSizeMD,
    color: Colors.gray800,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    lineHeight: 22,
  },
  section: { padding: Spacing.md, borderTopWidth: 1, borderColor: Colors.gray200 },
  sectionTitle: {
    fontSize: Typography.fontSizeLG,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
    marginBottom: 4,
  },
  sectionHint: { fontSize: Typography.fontSizeXS, color: Colors.gray400, marginBottom: Spacing.md },
  bodyPhotosRow: { flexDirection: 'row', gap: Spacing.md },
  bodyPhotoSlot: {
    flex: 1,
    aspectRatio: 3 / 4,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.gray100,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Colors.gray200,
    position: 'relative',
  },
  bodyPhotoImage: { width: '100%', height: '100%' },
  bodyPhotoEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyPhotoPlusIcon: { fontSize: 28, color: Colors.gray400 },
  bodyPhotoEmptyLabel: { fontSize: Typography.fontSizeSM, color: Colors.gray600, marginTop: 4 },
  bodyPhotoLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: 4,
  },
  bodyPhotoLabelText: {
    color: Colors.white,
    fontSize: Typography.fontSizeXS,
    textAlign: 'center',
  },
  emptyHistory: { fontSize: Typography.fontSizeMD, color: Colors.gray400, fontStyle: 'italic', marginTop: Spacing.sm },
  historyItem: { flex: 1 / 3, aspectRatio: 1, padding: 1 },
  historyImage: { width: '100%', height: '100%', borderRadius: 4 },
  historyPlaceholder: { backgroundColor: Colors.gray100, alignItems: 'center', justifyContent: 'center' },
  historyStatus: { fontSize: 9, color: Colors.gray400 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  menuSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingBottom: 40,
    paddingTop: Spacing.md,
  },
  menuItem: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderBottomWidth: 1,
    borderColor: Colors.gray100,
  },
  menuItemText: { fontSize: Typography.fontSizeMD, color: Colors.black },
  menuItemDanger: { color: Colors.danger },
});
