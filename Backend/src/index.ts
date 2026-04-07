import 'reflect-metadata';
import { createApp } from './app.js';
import { AppDataSource } from './data-source.js';
import dotenv from 'dotenv';
import http from 'http';
import { WebSocketServer } from 'ws';
import { setBroadcast } from './realtime.js';
import { listUsers } from './services/userService.js';

dotenv.config();

const PORT = process.env.PORT || 3001;

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

    server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
  } catch (err) {
    console.error('Error during Data Source initialization:', err);
    process.exit(1);
  }
}

start();
