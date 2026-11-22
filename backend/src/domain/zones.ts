/** Zonas jerárquicas flexibles: Provincia → Ciudad → Sector/Parroquia → Barrio (puedes parar en cualquier nivel). */

export type ZoneParts = {
  province?: string;
  city?: string;
  sector?: string;
  neighborhood?: string;
};

/** Catálogo base Ecuador (se puede ampliar). Niveles inferiores quedan libres. */
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

/**
 * ¿El vehículo puede atender esta zona?
 * - allowed vacío = sin restricción
 * - "Pichincha" cubre todo lo que empiece con Pichincha
 * - "Pichincha / Quito" cubre Quito y debajo
 * - "Carcelén" (plano legacy) coincide si algún nivel del cliente es Carcelén
 */
export function vehicleAllowsZone(allowedZones: string[] | undefined, clientZone: string): boolean {
  const allowed = (allowedZones ?? []).map((z) => z.trim()).filter(Boolean);
  if (!allowed.length) return true;
  const clientPath = parseZonePath(clientZone).map((p) => p.toLowerCase());
  if (!clientPath.length) return true;

  return allowed.some((raw) => {
    const path = parseZonePath(raw).map((p) => p.toLowerCase());
    if (!path.length) return true;
    // Prefijo jerárquico: la regla del camión es ancestro o igual a la zona del cliente.
    if (path.length <= clientPath.length && path.every((part, i) => part === clientPath[i])) {
      return true;
    }
    // Legacy / etiqueta suelta: coincide con cualquier nivel del cliente.
    if (path.length === 1) {
      return clientPath.some((part) => part === path[0] || part.includes(path[0]) || path[0].includes(part));
    }
    return false;
  });
}

/** Alias histórico usado en flota. */
export function vehicleAllowsSector(allowedSectors: string[] | undefined, sector: string) {
  return vehicleAllowsZone(allowedSectors, sector);
}
