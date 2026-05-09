import { getPresignedUrl } from './s3Service';

const READ_TTL_SECONDS = 3600;

async function presignMaybe(key: string | null | undefined): Promise<string | null> {
  if (!key) return null;
  if (key.startsWith('http')) {
    // Legacy row written before the lockdown — pull the key out of the URL.
    try {
      const parsed = new URL(key);
      key = parsed.pathname.replace(/^\//, '');
    } catch {
      return key;
    }
  }
  return getPresignedUrl(key, READ_TTL_SECONDS);
}

export async function presignUserPhotos<T extends {
  avatarUrl?: string | null;
  fullBodyUrl?: string | null;
  mediumBodyUrl?: string | null;
}>(user: T): Promise<T> {
  const [avatarUrl, fullBodyUrl, mediumBodyUrl] = await Promise.all([
    presignMaybe(user.avatarUrl),
    presignMaybe(user.fullBodyUrl),
    presignMaybe(user.mediumBodyUrl),
  ]);
  return { ...user, avatarUrl, fullBodyUrl, mediumBodyUrl };
}

export async function presignTryOnJob<T extends {
  clothingPhoto1Url?: string | null;
  clothingPhoto2Url?: string | null;
  bodyPhotoUrl?: string | null;
  resultFullBodyUrl?: string | null;
  resultMediumUrl?: string | null;
}>(job: T): Promise<T> {
  const [
    clothingPhoto1Url,
    clothingPhoto2Url,
    bodyPhotoUrl,
    resultFullBodyUrl,
    resultMediumUrl,
  ] = await Promise.all([
    presignMaybe(job.clothingPhoto1Url),
    presignMaybe(job.clothingPhoto2Url),
    presignMaybe(job.bodyPhotoUrl),
    presignMaybe(job.resultFullBodyUrl),
    presignMaybe(job.resultMediumUrl),
  ]);
  return {
    ...job,
    clothingPhoto1Url,
    clothingPhoto2Url,
    bodyPhotoUrl,
    resultFullBodyUrl,
    resultMediumUrl,
  };
}

export async function presignTryOnJobs<T extends Parameters<typeof presignTryOnJob>[0]>(
  jobs: T[],
): Promise<T[]> {
  return Promise.all(jobs.map((j) => presignTryOnJob(j)));
}

export async function presignAvatarOnly<T extends { avatarUrl?: string | null }>(
  user: T,
): Promise<T> {
  return { ...user, avatarUrl: await presignMaybe(user.avatarUrl) };
}
