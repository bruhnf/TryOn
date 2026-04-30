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
import api from '../config/api';
import { TryOnJob } from '../types';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import FullScreenImageModal from '../components/FullScreenImageModal';
import CreditDisplay from '../components/CreditDisplay';

interface FeedJob extends TryOnJob {
  user: { username: string; firstName?: string; lastName?: string; avatarUrl?: string };
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
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
    fetchFeed(1, true);
  }, []);

  const loadMore = () => {
    if (hasMore && !loading) fetchFeed(page + 1);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.black} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <CreditDisplay />
        <Text style={styles.header}>TryOn</Text>
        <View style={{ width: 50 }} />
      </View>
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
}: {
  job: FeedJob;
  onResultPress: (urls: string[], index: number) => void;
  onClothingPress: (url: string) => void;
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
        <TouchableOpacity
          onPress={() => onClothingPress(job.clothingPhoto1Url)}
          activeOpacity={0.9}
        >
          <Image
            source={{ uri: job.clothingPhoto1Url }}
            style={styles.clothingThumb}
            resizeMode="cover"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  header: {
    fontSize: Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
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
    padding: Spacing.md,
    gap: Spacing.sm,
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
  clothingThumb: {
    width: 90,
    aspectRatio: 3 / 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
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
