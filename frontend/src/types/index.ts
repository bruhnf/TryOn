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
  liked?: boolean;
  errorMessage?: string;
  createdAt: string;
  user?: { username: string; firstName?: string; lastName?: string; avatarUrl?: string };
}

export interface PublicUser {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  bio?: string;
}

export type NotificationType = 'FOLLOW' | 'LIKE' | 'TRYON_COMPLETE';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  actorId?: string | null;
  jobId?: string | null;
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
