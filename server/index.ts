// Express 入口：API 路由 + 生产环境静态资源托管。
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config';
import { createApiRouter } from './routes/api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', createApiRouter(config));

if (process.env.NODE_ENV === 'production') {
  const staticDir = config.staticDir ?? path.join(__dirname, '..', 'client');
  app.use(express.static(staticDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

app.listen(config.port, () => {
  console.log(`[polya] API 服务 http://localhost:${config.port}`);
});
