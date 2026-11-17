import cors from 'cors';
import express from 'express';
import { createRouter } from './routes.js';

const PORT = Number(process.env.PORT || 3021);
const app = express();

app.use(cors());
app.use(express.json({ limit: '256kb' }));
app.use(createRouter());

app.use((_req, res) => {
  res.status(404).json({ error: 'No encontrado. Usa GET /health o POST /v1/routes/plan' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`minicore-rutas en http://127.0.0.1:${PORT}`);
});
