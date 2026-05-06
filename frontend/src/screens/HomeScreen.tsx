import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Image,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import api from '../config/api';
import { useUserStore } from '../store/useUserStore';
import { TryOnJob } from '../types';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { RootStackParams } from '../navigation';
import FullScreenImageModal from '../components/FullScreenImageModal';
import CreditDisplay from '../components/CreditDisplay';
import HeaderMenu from '../components/HeaderMenu';

type Nav = NativeStackNavigationProp<RootStackParams>;

interface FeedJob extends TryOnJob {
  user: { username: string; firstName?: string; lastName?: string; avatarUrl?: string };
  liked?: boolean;
  likesCount?: number;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user, refreshUser } = useUserStore();
  const [jobs, setJobs] = useState<FeedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [fullScreenImages, setFullScreenImages] = useState<string[]>([]);
  const [fullScreenInitialIndex, setFullScreenInitialIndex] = useState(0);

  async function fetchFeed(p = 1, refresh = false) {
    try {
      const { data } = await api.get<{ jobs: FeedJob[]; page: number }>(`/feed?page=${p}`);
      setJobs((prev) => (refresh ? data.jobs : [...prev, ...data.jobs]));
      setHasMore(data.jobs.length === 20);
      setPage(p);
    } catch {
      // silently fail; user sees empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { fetchFeed(1, true); }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refreshUser();
    fetchFeed(1, true);
  }, []);

  const loadMore = () => {
    if (hasMore && !loading) fetchFeed(page + 1);
  };

  // Optimistic toggle of `liked` state on a feed item
  async function toggleLike(jobId: string) {
    const target = jobs.find((j) => j.id === jobId);
    if (!target) return;
    // Don't allow self-likes (server enforces too)
    if (user && target.user.username === user.username) return;

    const wasLiked = !!target.liked;
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? { ...j, liked: !wasLiked, likesCount: Math.max(0, (j.likesCount ?? 0) + (wasLiked ? -1 : 1)) }
          : j,
      ),
    );

    try {
      if (wasLiked) await api.delete(`/likes/${jobId}`);
      else await api.post(`/likes/${jobId}`);
    } catch {
      // Roll back on failure
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, liked: wasLiked, likesCount: Math.max(0, (j.likesCount ?? 0) + (wasLiked ? 1 : -1)) }
            : j,
        ),
      );
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.black} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <HeaderMenu
        title="TryOn"
        leftComponent={<CreditDisplay />}
        rightComponent={
          <TouchableOpacity
            onPress={() => navigation.navigate('Friends', { initialTab: 'following', openSearch: true })}
            style={styles.searchIconButton}
            accessibilityLabel="Search users"
          >
            <Ionicons name="search" size={22} color={Colors.black} />
          </TouchableOpacity>
        }
      />
      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <FeedCard
            job={item}
            onResultPress={(urls, index) => {
              setFullScreenImages(urls);
              setFullScreenInitialIndex(index);
            }}
            onClothingPress={(url) => {
              setFullScreenImages([url]);
              setFullScreenInitialIndex(0);
            }}
            onUsernamePress={() =>
              navigation.navigate('PublicProfile', { username: item.user.username })
            }
            onLikePress={() => toggleLike(item.id)}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={hasMore ? <ActivityIndicator style={styles.footer} /> : null}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👕</Text>
            <Text style={styles.emptyTitle}>No try-ons yet</Text>
            <Text style={styles.emptySubtitle}>
              Be the first to create a try-on using the camera button below!
            </Text>
          </View>
        }
        contentContainerStyle={jobs.length === 0 ? styles.emptyContainer : undefined}
      />
      <FullScreenImageModal
        visible={fullScreenImages.length > 0}
        imageUrls={fullScreenImages}
        initialIndex={fullScreenInitialIndex}
        onClose={() => setFullScreenImages([])}
      />
    </View>
  );
}

function FeedCard({
  job,
  onResultPress,
  onClothingPress,
  onUsernamePress,
  onLikePress,
}: {
  job: FeedJob;
  onResultPress: (urls: string[], index: number) => void;
  onClothingPress: (url: string) => void;
  onUsernamePress: () => void;
  onLikePress: () => void;
}) {
  // Collect all available result images
  const resultImages: string[] = [];
  if (job.resultFullBodyUrl) resultImages.push(job.resultFullBodyUrl);
  if (job.resultMediumUrl) resultImages.push(job.resultMediumUrl);

  const displayUrl = resultImages[0];
  const fullName = [job.user.firstName, job.user.lastName].filter(Boolean).join(' ');

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <TouchableOpacity
          style={styles.headerUserRow}
          onPress={onUsernamePress}
          activeOpacity={0.7}
        >
          <View style={styles.avatar}>
            {job.user.avatarUrl ? (
              <Image source={{ uri: job.user.avatarUrl }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarInitial}>
                {job.user.username[0].toUpperCase()}
              </Text>
            )}
          </View>
          <View>
            {fullName ? (
              <>
                <Text style={styles.displayName}>{fullName}</Text>
                <Text style={styles.username}>@{job.user.username}</Text>
              </>
            ) : (
              <Text style={styles.displayName}>@{job.user.username}</Text>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.likeButton}
          onPress={onLikePress}
          accessibilityLabel={job.liked ? 'Unlike' : 'Like'}
          hitSlop={10}
        >
          <Ionicons
            name={job.liked ? 'heart' : 'heart-outline'}
            size={24}
            color={job.liked ? Colors.danger : Colors.black}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.resultsRow}>
        {displayUrl ? (
          <TouchableOpacity
            style={styles.resultImageContainer}
            onPress={() => onResultPress(resultImages, 0)}
            activeOpacity={0.9}
          >
            <Image source={{ uri: displayUrl }} style={styles.resultImage} resizeMode="cover" />
            {resultImages.length > 1 && (
              <View style={styles.multiImageBadge}>
                <Text style={styles.multiImageText}>1/{resultImages.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        ) : (
          <View style={[styles.resultImage, styles.resultPlaceholder]}>
            <ActivityIndicator color={Colors.gray400} />
          </View>
        )}

        <View style={styles.thumbColumn}>
          {job.bodyPhotoUrl ? (
            <TouchableOpacity onPress={() => onClothingPress(job.bodyPhotoUrl!)} activeOpacity={0.9}>
              <Image source={{ uri: job.bodyPhotoUrl }} style={styles.sideThumb} resizeMode="cover" />
            </TouchableOpacity>
          ) : (
            <View style={[styles.sideThumb, styles.sideThumbPlaceholder]} />
          )}
          <TouchableOpacity onPress={() => onClothingPress(job.clothingPhoto1Url)} activeOpacity={0.9}>
            <Image source={{ uri: job.clothingPhoto1Url }} style={styles.sideThumb} resizeMode="cover" />
          </TouchableOpacity>
        </View>
      </View>

      {(job.likesCount ?? 0) > 0 && (
        <Text style={styles.likesCount}>
          {job.likesCount} {job.likesCount === 1 ? 'like' : 'likes'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchIconButton: {
    padding: Spacing.sm,
    marginRight: Spacing.xs,
  },
  card: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray200,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  headerUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitial: {
    fontSize: Typography.fontSizeMD,
    fontWeight: Typography.fontWeightBold,
    color: Colors.gray600,
  },
  displayName: { fontSize: Typography.fontSizeMD, fontWeight: Typography.fontWeightSemiBold, color: Colors.black },
  username: { fontSize: Typography.fontSizeSM, color: Colors.gray600 },
  likeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultsRow: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, paddingTop: 0 },
  resultImageContainer: {
    flex: 1,
    position: 'relative',
  },
  resultImage: {
    flex: 1,
    aspectRatio: 3 / 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
  },
  resultPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  multiImageBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  multiImageText: {
    color: Colors.white,
    fontSize: Typography.fontSizeXS,
    fontWeight: Typography.fontWeightSemiBold,
  },
  thumbColumn: {
    width: 90,
    gap: Spacing.sm,
    justifyContent: 'flex-start',
  },
  sideThumb: {
    width: 90,
    aspectRatio: 3 / 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
  },
  sideThumbPlaceholder: {
    backgroundColor: Colors.gray100,
  },
  likesCount: {
    fontSize: Typography.fontSizeSM,
    fontWeight: Typography.fontWeightSemiBold,
    color: Colors.black,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  footer: { padding: Spacing.lg },
  emptyContainer: { flex: 1 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
    marginTop: 80,
  },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyTitle: {
    fontSize: Typography.fontSizeXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: Typography.fontSizeMD,
    color: Colors.gray600,
    textAlign: 'center',
    lineHeight: 22,
  },
});
