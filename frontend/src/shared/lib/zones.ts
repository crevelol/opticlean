/** Zonas jerárquicas flexibles: Provincia → Ciudad → Sector → Barrio (opcional en cada nivel). */

export type ZoneParts = {
  province?: string;
  city?: string;
  sector?: string;
  neighborhood?: string;
};

export const ZONE_TREE: Record<string, Record<string, string[]>> = {
  Pichincha: {
    Quito: [
      'Norte',
      'Centro',
      'Centro Histórico',
      'La Mariscal',
      'La Floresta',
      'Carcelén',
      'Cumbayá',
      'Tumbaco',
      'Calderón',
      'Quitumbe',
    ],
    'Santo Domingo': ['Centro', 'Norte', 'Sur'],
  },
  Guayas: {
    Guayaquil: ['Norte', 'Centro', 'Sur', 'Urdesa', 'Sauces', 'Alborada', 'Via a Daule'],
    Durán: ['Centro', 'Recreo'],
  },
  Azuay: {
    Cuenca: ['El Centro', 'Yanuncay', 'El Batán', 'Totoracocha', 'Ricaurte'],
  },
  Manabí: {
    Manta: ['Centro', 'Tarqui', 'Los Esteros'],
    Portoviejo: ['Centro', 'Picoazá'],
  },
};

export function parseZonePath(raw: string): string[] {
  return String(raw || '')
    .split(/\s*[/>|,]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function formatZonePath(parts: Array<string | undefined | null>): string {
  return parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' / ');
}

function provinceOfCity(city?: string): string | undefined {
  const name = String(city || '').trim().toLowerCase();
  if (!name) return undefined;
  for (const [province, cities] of Object.entries(ZONE_TREE)) {
    if (Object.keys(cities).some((c) => c.toLowerCase() === name)) return province;
  }
  return undefined;
}

export function zonePathOf(client: {
  province?: string;
  city?: string;
  sector?: string;
  neighborhood?: string;
  address?: string;
}): string {
  const province = client.province?.trim() || provinceOfCity(client.city);
  const path = formatZonePath([
    province,
    client.city,
    client.sector,
    client.neighborhood,
  ]);
  if (path) return path;
  const address = String(client.address || '').trim();
  return address || 'Sin zona';
}

export function vehicleAllowsZone(allowedZones: string[] | undefined, clientZone: string): boolean {
  const allowed = (allowedZones ?? []).map((z) => z.trim()).filter(Boolean);
  if (!allowed.length) return true;
  const clientPath = parseZonePath(clientZone).map((p) => p.toLowerCase());
  if (!clientPath.length) return true;

  return allowed.some((raw) => {
    const path = parseZonePath(raw).map((p) => p.toLowerCase());
    if (!path.length) return true;
    if (path.length <= clientPath.length && path.every((part, i) => part === clientPath[i])) {
      return true;
    }
    if (path.length === 1) {
      return clientPath.some(
        (part) => part === path[0] || part.includes(path[0]!) || path[0]!.includes(part),
      );
    }
    return false;
  });
}

export function vehicleAllowsSector(allowedSectors: string[] | undefined, sector: string) {
  return vehicleAllowsZone(allowedSectors, sector);
}

export function provinces() {
  return Object.keys(ZONE_TREE).sort((a, b) => a.localeCompare(b, 'es'));
}

export function citiesOf(province: string) {
  const node = ZONE_TREE[province];
  return node ? Object.keys(node).sort((a, b) => a.localeCompare(b, 'es')) : [];
}

export function sectorsOf(province: string, city: string) {
  return [...(ZONE_TREE[province]?.[city] ?? [])].sort((a, b) => a.localeCompare(b, 'es'));
}
