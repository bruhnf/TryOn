export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';

export interface User {
  id: string;
  username: string;
  email: string;
  verified: boolean;
  isSubscribed: boolean;
  credits: number;
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
  clothingPhoto1Url: string;
  clothingPhoto2Url?: string;
  resultFullBodyUrl?: string;
  resultMediumUrl?: string;
  perspectivesUsed: string[];
  errorMessage?: string;
  createdAt: string;
  user?: { username: string; avatarUrl?: string };
}

export interface PublicUser {
  id: string;
  username: string;
  avatarUrl?: string;
  bio?: string;
}
