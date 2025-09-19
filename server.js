import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(morgan('dev'));
app.use(cors());

const PORT = Number(process.env.PORT) || 8080;

// تقديم ملفات public
app.use(express.static(path.join(__dirname, 'public')));

// تقديم مكتبة LiveKit من node_modules
app.use('/vendor', express.static(
  path.join(__dirname, 'node_modules', 'livekit-client', 'dist'),
  { immutable: true, maxAge: '1y' }
));

// health check
app.get('/health', (_, res) => res.send('ok'));

app.listen(PORT, () => console.log('listening on', PORT));
