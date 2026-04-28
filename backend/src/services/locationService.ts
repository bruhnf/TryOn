import prisma from '../lib/prisma';
import { haversineDistance } from '../utils/haversine';
import { sendSuspiciousLoginAlert } from './emailService';

interface GeoData {
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}

async function lookupIp(ip: string): Promise<GeoData> {
  try {
    // ip-api.com free tier: no key needed, rate limit 45 req/min
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,regionName,city,lat,lon,timezone`,
    );
    const data = (await res.json()) as Record<string, unknown>;
    if (data.status !== 'success') return {};
    return {
      country: data.country as string,
      region: data.regionName as string,
      city: data.city as string,
      latitude: data.lat as number,
      longitude: data.lon as number,
      timezone: data.timezone as string,
    };
  } catch {
    return {};
  }
}

const SUSPICIOUS_DISTANCE_KM = 500;
const SUSPICIOUS_WINDOW_HOURS = 2;

export async function recordLoginLocation(
  userId: string,
  ip: string,
  trigger: string,
  userEmail: string,
): Promise<void> {
  const geo = await lookupIp(ip);

  // Fetch the most recent location for distance calculation
  const last = await prisma.userLocation.findFirst({
    where: { userId },
    orderBy: { timestamp: 'desc' },
  });

  let distanceFromLast: number | undefined;
  let suspicious = false;

  if (
    last &&
    last.latitude != null && last.longitude != null &&
    geo.latitude != null && geo.longitude != null
  ) {
    distanceFromLast = haversineDistance(
      last.latitude, last.longitude,
      geo.latitude, geo.longitude,
    );

    const hoursElapsed =
      (Date.now() - new Date(last.timestamp).getTime()) / (1000 * 60 * 60);

    if (distanceFromLast > SUSPICIOUS_DISTANCE_KM && hoursElapsed < SUSPICIOUS_WINDOW_HOURS) {
      suspicious = true;
    }
  }

  await prisma.userLocation.create({
    data: {
      userId,
      ip,
      ...geo,
      trigger,
      suspiciousLocation: suspicious,
      distanceFromLast,
    },
  });

  // Prune to keep only last 10 locations
  const allLocations = await prisma.userLocation.findMany({
    where: { userId },
    orderBy: { timestamp: 'desc' },
    select: { id: true },
  });
  if (allLocations.length > 10) {
    const idsToDelete = allLocations.slice(10).map((l) => l.id);
    await prisma.userLocation.deleteMany({ where: { id: { in: idsToDelete } } });
  }

  if (suspicious) {
    sendSuspiciousLoginAlert(
      userEmail,
      geo.city ?? 'Unknown',
      geo.country ?? 'Unknown',
      new Date(),
    ).catch(console.error);
  }
}
