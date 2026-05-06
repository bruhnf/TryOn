import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import api from '../config/api';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { RootStackParams } from '../navigation';
import FullScreenImageModal from '../components/FullScreenImageModal';

type Nav = NativeStackNavigationProp<RootStackParams, 'PublicProfile'>;
type Route = RouteProp<RootStackParams, 'PublicProfile'>;

interface PublicProfileData {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  avatarUrl?: string;
  tryOnCount: number;
  followingCount: number;
  followersCount: number;
  likesCount: number;
  createdAt: string;
  isFollowing: boolean;
  isSelf: boolean;
  jobs: Array<{
    id: string;
    resultFullBodyUrl?: string;
    resultMediumUrl?: string;
    likesCount: number;
    createdAt: string;
  }>;
}

export default function PublicProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { username } = route.params;

  const [profile, setProfile] = useState<PublicProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [fullScreenImages, setFullScreenImages] = useState<string[]>([]);
  const [fullScreenIndex, setFullScreenIndex] = useState(0);

  async function load() {
    try {
      const { data } = await api.get<PublicProfileData>(`/profile/${encodeURIComponent(username)}`);
      setProfile(data);
    } catch {
      Alert.alert('Error', 'Could not load profile.');
      navigation.goBack();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, [username]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [username]);

  async function toggleFollow() {
    if (!profile || profile.isSelf || followBusy) return;
    setFollowBusy(true);
    // Optimistic update
    const prevFollowing = profile.isFollowing;
    setProfile({
      ...profile,
      isFollowing: !prevFollowing,
      followersCount: profile.followersCount + (prevFollowing ? -1 : 1),
    });
    try {
      if (prevFollowing) {
        await api.delete(`/friends/unfollow/${profile.id}`);
      } else {
        await api.post(`/friends/follow/${profile.id}`);
      }
    } catch {
      // Roll back
      setProfile((p) => p ? {
        ...p,
        isFollowing: prevFollowing,
        followersCount: p.followersCount + (prevFollowing ? 1 : -1),
      } : p);
      Alert.alert('Error', 'Could not update follow status.');
    } finally {
      setFollowBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.black} />
      </View>
    );
  }

  if (!profile) return null;

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>@{profile.username}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.profileSection}>
          <View style={styles.avatar}>
            {profile.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarInitial}>{profile.username[0].toUpperCase()}</Text>
            )}
          </View>
          <View style={styles.userInfo}>
            {fullName ? <Text style={styles.fullName}>{fullName}</Text> : null}
            <Text style={styles.username}>@{profile.username}</Text>
            {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{profile.tryOnCount}</Text>
            <Text style={styles.statLabel}>Try-Ons</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{profile.followersCount}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{profile.followingCount}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{profile.likesCount}</Text>
            <Text style={styles.statLabel}>Likes</Text>
          </View>
        </View>

        {!profile.isSelf && (
          <TouchableOpacity
            style={[styles.followBtn, profile.isFollowing && styles.followingBtn]}
            onPress={toggleFollow}
            disabled={followBusy}
          >
            {followBusy ? (
              <ActivityIndicator color={profile.isFollowing ? Colors.black : Colors.white} />
            ) : (
              <Text style={[styles.followBtnText, profile.isFollowing && styles.followingBtnText]}>
                {profile.isFollowing ? 'Following' : 'Follow'}
              </Text>
            )}
          </TouchableOpacity>
        )}

        <View style={styles.gridSection}>
          <Text style={styles.sectionTitle}>Public Try-Ons</Text>
          {profile.jobs.length === 0 ? (
            <Text style={styles.emptyText}>No public try-on sessions.</Text>
          ) : (
            <FlatList
              data={profile.jobs}
              numColumns={3}
              scrollEnabled={false}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const url = item.resultFullBodyUrl ?? item.resultMediumUrl;
                if (!url) return <View style={styles.gridItem} />;
                const allUrls = [item.resultFullBodyUrl, item.resultMediumUrl].filter(Boolean) as string[];
                return (
                  <TouchableOpacity
                    style={styles.gridItem}
                    onPress={() => {
                      setFullScreenImages(allUrls);
                      setFullScreenIndex(0);
                    }}
                    activeOpacity={0.85}
                  >
                    <Image source={{ uri: url }} style={styles.gridImage} resizeMode="cover" />
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </ScrollView>

      <FullScreenImageModal
        visible={fullScreenImages.length > 0}
        imageUrls={fullScreenImages}
        initialIndex={fullScreenIndex}
        onClose={() => setFullScreenImages([])}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  backButton: { width: 44, padding: Spacing.xs },
  headerTitle: {
    flex: 1,
    fontSize: Typography.fontSizeLG,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
    textAlign: 'center',
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitial: {
    fontSize: 40,
    fontWeight: Typography.fontWeightBold,
    color: Colors.gray600,
  },
  userInfo: { alignItems: 'center' },
  fullName: {
    fontSize: Typography.fontSizeXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
  },
  username: {
    fontSize: Typography.fontSizeMD,
    color: Colors.gray600,
    marginTop: 2,
  },
  bio: {
    fontSize: Typography.fontSizeMD,
    color: Colors.gray800,
    textAlign: 'center',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    lineHeight: 22,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.md,
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
  followBtn: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.black,
    alignItems: 'center',
  },
  followingBtn: {
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.gray200,
  },
  followBtnText: {
    fontSize: Typography.fontSizeMD,
    fontWeight: Typography.fontWeightBold,
    color: Colors.white,
  },
  followingBtnText: { color: Colors.black },
  gridSection: {
    padding: Spacing.md,
    marginTop: Spacing.md,
    borderTopWidth: 1,
    borderColor: Colors.gray200,
  },
  sectionTitle: {
    fontSize: Typography.fontSizeLG,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    fontSize: Typography.fontSizeMD,
    color: Colors.gray400,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  gridItem: { flex: 1 / 3, aspectRatio: 1, padding: 1 },
  gridImage: { width: '100%', height: '100%', borderRadius: 4 },
});
