# minicore-rutas

Mini-core de planificación de rutas por calles. **OptiClean solo consume** esta API; no llama a OSRM directamente.

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/health` | Estado del servicio |
| `POST` | `/v1/routes/plan` | Planifica ruta por waypoints |
| `GET` | `/v1/routes/plan?points=lat,lng;lat,lng` | Mismo plan (query) |

### POST `/v1/routes/plan`

```json
{
  "points": [
    { "lat": -0.2532, "lng": -79.1754 },
    { "lat": -0.25, "lng": -79.17 }
  ],
  "profile": "driving",
  "geometry": true
}
```

Respuesta:

```json
{
  "route": {
    "id": "rt-…",
    "coordinates": [{ "lat": …, "lng": … }],
    "distanceM": 1433,
    "durationS": 186,
    "legs": [],
    "provider": "osrm",
    "cached": false
  }
}
```

## Desarrollo

```bash
cd /root/opticlean/minicore-rutas
npm run dev
```

## Producción

```bash
npm run build
systemctl restart minicore-rutas
```

Puerto interno: `127.0.0.1:3021`  
Nginx: `/routing/` → minicore  
Frontend OptiClean: `POST /routing/v1/routes/plan`
