import type { MapWallSettings } from '../types';

export const DEFAULT_MAP_WALL_SETTINGS: MapWallSettings = {
  id: 'map_wall',
  videoAUrl: '/brand/map-wall-route.mp4',
  videoALabel: 'Video A (~6 s)',
  videoBUrl: '/brand/map-wall-tracking.mp4',
  videoBLabel: 'Video B (~8 s)',
  mapDurationMs: 8000,
  updatedAt: new Date(0).toISOString(),
};

export function mergeMapWallSettings(raw: Partial<MapWallSettings> | null | undefined): MapWallSettings {
  if (!raw) return { ...DEFAULT_MAP_WALL_SETTINGS, updatedAt: new Date().toISOString() };
  return {
    ...DEFAULT_MAP_WALL_SETTINGS,
    ...raw,
    id: 'map_wall',
    videoAUrl: raw.videoAUrl?.trim() || DEFAULT_MAP_WALL_SETTINGS.videoAUrl,
    videoBUrl: raw.videoBUrl?.trim() || DEFAULT_MAP_WALL_SETTINGS.videoBUrl,
    mapDurationMs:
      typeof raw.mapDurationMs === 'number' && raw.mapDurationMs >= 3000
        ? raw.mapDurationMs
        : DEFAULT_MAP_WALL_SETTINGS.mapDurationMs,
  };
}

export type MapWallPhase = 'video-a' | 'map' | 'video-b';
