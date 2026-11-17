export type LatLng = { lat: number; lng: number };

export type RouteProfile = 'driving' | 'walking' | 'cycling';

export type RouteLeg = {
  fromIndex: number;
  toIndex: number;
  distanceM: number;
  durationS: number;
  summary?: string;
};

export type PlannedRoute = {
  id: string;
  profile: RouteProfile;
  points: LatLng[];
  coordinates: LatLng[];
  distanceM: number;
  durationS: number;
  legs: RouteLeg[];
  provider: 'osrm' | 'fallback';
  cached: boolean;
  plannedAt: string;
};

export type PlanRequest = {
  points: LatLng[];
  profile?: RouteProfile;
  /** Incluir geometría por calles (default true). */
  geometry?: boolean;
};
