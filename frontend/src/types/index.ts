export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';

export type UserTier = 'FREE' | 'BASIC' | 'PREMIUM';

export interface User {
  id: string;
  username: string;
  email: string;
  verified: boolean;
  tier: UserTier;
  credits: number;
  tryOnCount: number;
  firstName?: string;
  lastName?: string;
  bio?: string;
  avatarUrl?: string;
  fullBodyUrl?: string;
  mediumBodyUrl?: string;
  followingCount: number;
  followersCount: number;
  likesCount: number;
  city?: string;
  state?: string;
  createdAt: string;
  // Server-derived: true if this user's email is in the backend ADMIN_EMAILS allowlist.
  isAdmin?: boolean;
}

export interface TryOnJob {
  id: string;
  userId: string;
  status: JobStatus;
  isPrivate?: boolean;
  clothingPhoto1Url: string;
  clothingPhoto2Url?: string;
  resultFullBodyUrl?: string;
  resultMediumUrl?: string;
  bodyPhotoUrl?: string;
  perspectivesUsed: string[];
  likesCount?: number;
  commentsCount?: number;
  liked?: boolean;
  errorMessage?: string;
  createdAt: string;
  // ISO timestamp set when the backend's soft throttle deferred this
  // submission. Null/absent = the worker will pick it up immediately. The
  // TryOn screen uses this to render a "starts in X:XX" countdown while
  // the job sits in BullMQ's delayed set.
  scheduledStartAt?: string | null;
  user?: { username: string; firstName?: string; lastName?: string; avatarUrl?: string };
}

export interface Comment {
  id: string;
  jobId: string;
  userId: string;
  body: string;
  // null for top-level comments; set to a top-level comment's id for replies.
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  };
  likesCount: number;
  liked: boolean;
  // Only populated on top-level comments; replies have an empty array.
  replies?: Comment[];
}

export interface PublicUser {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  bio?: string;
}

export type NotificationType =
  | 'FOLLOW'
  | 'LIKE'
  | 'TRYON_COMPLETE'
  | 'COMMENT'
  | 'COMMENT_REPLY'
  | 'COMMENT_LIKE';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  actorId?: string | null;
  jobId?: string | null;
  // Set for COMMENT_REPLY (the parent comment that was replied to) and
  // COMMENT_LIKE (the comment that was liked). Used by the mobile app to
  // deep-link straight into the thread and auto-scroll to that comment.
  commentId?: string | null;
  read: boolean;
  createdAt: string;
  actor?: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  } | null;
  job?: {
    id: string;
    resultFullBodyUrl?: string;
    resultMediumUrl?: string;
  } | null;
}
