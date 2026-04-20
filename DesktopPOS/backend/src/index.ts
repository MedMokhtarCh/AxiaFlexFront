import 'dotenv/config';
import 'reflect-metadata';
import { createApp } from './app.js';
import { AppDataSource } from './data-source.js';
import http from 'http';
import { WebSocketServer } from 'ws';
import { setBroadcast } from './realtime.js';
import { listUsers } from './services/userService.js';

const DEFAULT_PORT = 3003;
const rawPort = String(process.env.PORT || '').trim();
const envPort = Number(rawPort);
const PORT = Number.isFinite(envPort) && envPort > 0 ? envPort : DEFAULT_PORT;

async function start() {
  try {
    await AppDataSource.initialize();
    console.log('DataSource initialized');

    await listUsers();

    const app = createApp();
    const server = http.createServer(app);
    const wss = new WebSocketServer({ server, path: '/ws' });

    wss.on('connection', (ws) => {
      ws.send(
        JSON.stringify({
          event: 'connected',
          data: { at: Date.now() },
        }),
      );
    });

    setBroadcast((event, data) => {
      const message = JSON.stringify({ event, data });
      wss.clients.forEach((client: any) => {
        if (client.readyState === 1) client.send(message);
      });
    });

    server.listen(PORT, () =>
      console.log(
        `Server listening on port ${PORT}${rawPort ? ' (from PORT env)' : ' (default backend port)'}`,
      ),
    );
  } catch (err) {
    console.error('Error during Data Source initialization:', err);
    process.exit(1);
  }
}

start();
