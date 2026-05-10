import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActionSheetIOS,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import api from '../config/api';
import { useUserStore } from '../store/useUserStore';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { Comment, TryOnJob } from '../types';
import { RootStackParams } from '../navigation';
import AiGeneratedBadge from '../components/AiGeneratedBadge';
import ReportSheet from '../components/ReportSheet';

type Nav = NativeStackNavigationProp<RootStackParams, 'TryOnComments'>;
type Rt = RouteProp<RootStackParams, 'TryOnComments'>;

interface JobWithUser extends TryOnJob {
  user?: { username: string; firstName?: string; lastName?: string; avatarUrl?: string };
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString();
}

export default function TryOnCommentsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { jobId } = route.params;
  const { user } = useUserStore();

  const [job, setJob] = useState<JobWithUser | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [body, setBody] = useState('');
  const [reportTargetId, setReportTargetId] = useState<string | null>(null);
  const listRef = useRef<FlatList<Comment>>(null);

  const loadAll = useCallback(async () => {
    try {
      const [jobRes, commentsRes] = await Promise.all([
        api.get<JobWithUser>(`/tryon/${jobId}`),
        api.get<{ comments: Comment[] }>(`/tryon/${jobId}/comments`),
      ]);
      setJob(jobRes.data);
      setComments(commentsRes.data.comments);
    } catch {
      Alert.alert('Error', 'Could not load this try-on.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [jobId, navigation]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    try {
      const { data: created } = await api.post<Comment>(`/tryon/${jobId}/comments`, {
        body: trimmed,
      });
      setComments((prev) => [...prev, created]);
      setBody('');
      // Scroll to bottom so the new comment is visible.
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (err: unknown) {
      const response = (err as { response?: { data?: { error?: unknown; message?: string } } })?.response?.data;
      let msg = response?.message ?? 'Could not post comment.';
      if (typeof response?.error === 'string') msg = response.error;
      else if (response?.error && typeof response.error === 'object') {
        const fieldErrors = (response.error as { fieldErrors?: Record<string, string[]> }).fieldErrors;
        if (fieldErrors) {
          msg = Object.values(fieldErrors).flat().join('\n') || msg;
        }
      }
      Alert.alert('Could not post comment', String(msg));
    } finally {
      setPosting(false);
    }
  }

  async function deleteComment(commentId: string) {
    try {
      await api.delete(`/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      Alert.alert('Error', 'Could not delete comment.');
    }
  }

  function openCommentMenu(comment: Comment) {
    const isAuthor = comment.userId === user?.id;
    const isPostOwner = job?.userId === user?.id;
    const canDelete = isAuthor || isPostOwner;
    const canReport = !isAuthor;

    const actions: { label: string; destructive?: boolean; onPress: () => void }[] = [];
    if (canDelete) {
      actions.push({
        label: 'Delete',
        destructive: true,
        onPress: () =>
          Alert.alert('Delete Comment', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteComment(comment.id) },
          ]),
      });
    }
    if (canReport) {
      actions.push({
        label: 'Report',
        onPress: () => setReportTargetId(comment.id),
      });
    }
    if (actions.length === 0) return;

    const options = [...actions.map((a) => a.label), 'Cancel'];
    const cancelButtonIndex = options.length - 1;
    const destructiveButtonIndex = actions.findIndex((a) => a.destructive);

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex,
          destructiveButtonIndex: destructiveButtonIndex >= 0 ? destructiveButtonIndex : undefined,
        },
        (idx) => {
          if (idx >= 0 && idx < actions.length) actions[idx].onPress();
        },
      );
    } else {
      Alert.alert(
        '',
        '',
        [
          ...actions.map((a) => ({
            text: a.label,
            style: a.destructive ? ('destructive' as const) : ('default' as const),
            onPress: a.onPress,
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ],
      );
    }
  }

  if (loading || !job) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.black} />
      </View>
    );
  }

  const displayUrl = job.resultFullBodyUrl || job.resultMediumUrl;
  const ownerName =
    [job.user?.firstName, job.user?.lastName].filter(Boolean).join(' ') ||
    (job.user?.username ? `@${job.user.username}` : 'Unknown');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Comments</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        ref={listRef}
        data={comments}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <View style={styles.tryonCard}>
              <View style={styles.ownerRow}>
                <View style={styles.avatar}>
                  {job.user?.avatarUrl ? (
                    <Image source={{ uri: job.user.avatarUrl }} style={styles.avatarImg} />
                  ) : (
                    <Text style={styles.avatarInitial}>
                      {(job.user?.username ?? '?')[0].toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ownerName}>{ownerName}</Text>
                  {job.user?.username ? (
                    <Text style={styles.ownerHandle}>@{job.user.username}</Text>
                  ) : null}
                </View>
              </View>
              {displayUrl ? (
                <View style={styles.imageWrap}>
                  <Image source={{ uri: displayUrl }} style={styles.image} resizeMode="cover" />
                  <AiGeneratedBadge />
                </View>
              ) : null}
            </View>
            {comments.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="chatbubble-outline" size={36} color={Colors.gray400} />
                <Text style={styles.emptyText}>No comments yet. Be the first.</Text>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <CommentRow comment={item} onMenu={() => openCommentMenu(item)} />
        )}
        contentContainerStyle={styles.listContent}
      />

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
        <TextInput
          style={styles.input}
          placeholder="Add a comment…"
          placeholderTextColor={Colors.gray400}
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!body.trim() || posting) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!body.trim() || posting}
        >
          {posting ? (
            <ActivityIndicator color={Colors.white} size="small" />
          ) : (
            <Ionicons name="arrow-up" size={18} color={Colors.white} />
          )}
        </TouchableOpacity>
      </View>

      <ReportSheet
        visible={reportTargetId !== null}
        targetType="COMMENT"
        targetId={reportTargetId ?? ''}
        onClose={() => setReportTargetId(null)}
      />
    </KeyboardAvoidingView>
  );
}

function CommentRow({
  comment,
  onMenu,
}: {
  comment: Comment;
  onMenu: () => void;
}) {
  const fullName = [comment.user.firstName, comment.user.lastName].filter(Boolean).join(' ');
  return (
    <View style={styles.commentRow}>
      <View style={styles.commentAvatar}>
        {comment.user.avatarUrl ? (
          <Image source={{ uri: comment.user.avatarUrl }} style={styles.commentAvatarImg} />
        ) : (
          <Text style={styles.avatarInitial}>{comment.user.username[0].toUpperCase()}</Text>
        )}
      </View>
      <View style={styles.commentBody}>
        <Text style={styles.commentMeta}>
          <Text style={styles.commentAuthor}>{fullName || `@${comment.user.username}`}</Text>
          <Text style={styles.commentTime}>{'  '}{timeAgo(comment.createdAt)}</Text>
        </Text>
        <Text style={styles.commentText}>{comment.body}</Text>
      </View>
      <TouchableOpacity onPress={onMenu} hitSlop={10} style={styles.commentMenu}>
        <Ionicons name="ellipsis-horizontal" size={18} color={Colors.gray600} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  closeButton: { padding: Spacing.xs, width: 36 },
  headerTitle: {
    fontSize: Typography.fontSizeXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
  },
  headerSpacer: { width: 36 },
  listContent: { paddingBottom: Spacing.md },
  tryonCard: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  ownerName: {
    fontSize: Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemiBold,
    color: Colors.black,
  },
  ownerHandle: { fontSize: Typography.fontSizeSM, color: Colors.gray600 },
  imageWrap: {
    position: 'relative',
    borderRadius: Radius.md,
    overflow: 'hidden',
    aspectRatio: 3 / 4,
    backgroundColor: Colors.gray100,
  },
  image: { width: '100%', height: '100%' },
  emptyState: {
    alignItems: 'center',
    padding: Spacing.xxl,
    gap: Spacing.sm,
  },
  emptyText: { fontSize: Typography.fontSizeSM, color: Colors.gray600 },
  commentRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  commentAvatarImg: { width: '100%', height: '100%' },
  commentBody: { flex: 1 },
  commentMeta: { fontSize: Typography.fontSizeSM },
  commentAuthor: {
    fontWeight: Typography.fontWeightSemiBold,
    color: Colors.black,
  },
  commentTime: { color: Colors.gray600 },
  commentText: {
    fontSize: Typography.fontSizeMD,
    color: Colors.black,
    marginTop: 2,
    lineHeight: 20,
  },
  commentMenu: { padding: 4 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    padding: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 100,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.gray100,
    borderRadius: Radius.full,
    fontSize: Typography.fontSizeMD,
    color: Colors.black,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: Colors.gray200 },
});
