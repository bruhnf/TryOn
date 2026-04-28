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

interface FeedJob extends TryOnJob {
  user: { username: string; avatarUrl?: string };
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [jobs, setJobs] = useState<FeedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

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
      <Text style={styles.header}>TryOn</Text>
      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <FeedCard job={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={hasMore ? <ActivityIndicator style={styles.footer} /> : null}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👕</Text>
            <Text style={styles.emptyTitle}>No try-ons yet</Text>
            <Text style={styles.emptySubtitle}>
              Follow people or create your first try-on using the camera button below.
            </Text>
          </View>
        }
        contentContainerStyle={jobs.length === 0 ? styles.emptyContainer : undefined}
      />
    </View>
  );
}

function FeedCard({ job }: { job: FeedJob }) {
  const displayUrl = job.resultFullBodyUrl ?? job.resultMediumUrl;

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
        <Text style={styles.username}>@{job.user.username}</Text>
      </View>

      <View style={styles.resultsRow}>
        {displayUrl ? (
          <Image source={{ uri: displayUrl }} style={styles.resultImage} resizeMode="cover" />
        ) : (
          <View style={[styles.resultImage, styles.resultPlaceholder]}>
            <ActivityIndicator color={Colors.gray400} />
          </View>
        )}
        <Image
          source={{ uri: job.clothingPhoto1Url }}
          style={styles.clothingThumb}
          resizeMode="cover"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    fontSize: Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
    padding: Spacing.md,
    paddingBottom: Spacing.sm,
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
  username: { fontSize: Typography.fontSizeMD, fontWeight: Typography.fontWeightSemiBold },
  resultsRow: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, paddingTop: 0 },
  resultImage: {
    flex: 1,
    aspectRatio: 3 / 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
  },
  resultPlaceholder: { alignItems: 'center', justifyContent: 'center' },
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
