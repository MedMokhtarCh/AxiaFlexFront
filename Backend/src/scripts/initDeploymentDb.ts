import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { Client } from 'pg';
import { AppDataSource } from '../data-source.js';
import { listUsers } from '../services/userService.js';
import { getSettings } from '../services/settingsService.js';

const DEFAULT_ENV = `DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=posdb
PORT=3000
`;

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

async function ensureEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  try {
    await fs.access(envPath);
    console.log('[db:init] .env déjà présent');
    return;
  } catch {
    // File missing, create it.
  }

  const examplePath = path.resolve(process.cwd(), '.env.example');
  try {
    const content = await fs.readFile(examplePath, 'utf8');
    await fs.writeFile(envPath, content, 'utf8');
    console.log('[db:init] .env créé depuis .env.example');
    return;
  } catch {
    // .env.example missing/unreadable; use defaults.
  }

  await fs.writeFile(envPath, DEFAULT_ENV, 'utf8');
  console.log('[db:init] .env créé avec paramètres par défaut');
}

async function ensureDatabaseExists() {
  dotenv.config();
  const host = process.env.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT || 5432);
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || 'postgres';
  const dbName = process.env.DB_NAME || 'posdb';

  const adminClient = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
  });

  await adminClient.connect();
  try {
    const check = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1 LIMIT 1',
      [dbName],
    );
    if (check.rowCount && check.rowCount > 0) {
      console.log(`[db:init] Base déjà existante: ${dbName}`);
      return;
    }

    await adminClient.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
    console.log(`[db:init] Base créée: ${dbName}`);
  } finally {
    await adminClient.end();
  }
}

async function bootstrapDefaults() {
  await AppDataSource.initialize();
  try {
    // Triggers lazy default users creation when table is empty.
    await listUsers();
    // Materializes normalized default settings snapshot.
    await getSettings();
    console.log('[db:init] Schéma synchronisé + paramètres par défaut initialisés');
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

async function main() {
  await ensureEnvFile();
  await ensureDatabaseExists();
  await bootstrapDefaults();
  console.log('[db:init] Initialisation terminée');
}

main().catch((error) => {
  console.error('[db:init] Échec:', error);
  process.exit(1);
});

