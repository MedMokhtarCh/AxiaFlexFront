import request from 'supertest';
import { createApp } from '../app.js';

/** Client Supertest sur l’app Express (sans serveur HTTP). */
export function api() {
  return request(createApp());
}

export function unique(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
