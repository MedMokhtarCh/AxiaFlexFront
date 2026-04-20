import crypto from 'node:crypto';
import { In } from 'typeorm';
import { AppDataSource } from '../data-source.js';
import { Product } from '../entity/Product.js';
import { Preorder } from '../entity/Preorder.js';
import { PreorderItem } from '../entity/PreorderItem.js';
import { PreorderUser } from '../entity/PreorderUser.js';
import { generateNextPrefixedCode } from './prefixService.js';

const hashPassword = (raw: string) =>
  crypto.createHash('sha256').update(String(raw || '')).digest('hex');
const newToken = () => crypto.randomBytes(24).toString('hex');

export async function signupPreorderUser(payload: {
  fullName: string;
  email: string;
  password: string;
  phone?: string | null;
}) {
  const repo = AppDataSource.getRepository(PreorderUser);
  const email = String(payload.email || '').trim().toLowerCase();
  const fullName = String(payload.fullName || '').trim();
  const password = String(payload.password || '');
  if (!email || !fullName || password.length < 4) {
    throw new Error('Informations invalides');
  }
  const exists = await repo.findOneBy({ email } as any);
  if (exists) throw new Error('Email déjà utilisé');
  const user = repo.create({
    email,
    fullName,
    passwordHash: hashPassword(password),
    phone: payload.phone ? String(payload.phone).trim() : null,
    createdAt: Date.now(),
  } as any);
  const saved = await repo.save(user as any);
  return {
    id: saved.id,
    email: saved.email,
    fullName: saved.fullName,
    phone: saved.phone || null,
  };
}

export async function signinPreorderUser(payload: {
  email: string;
  password: string;
}) {
  const repo = AppDataSource.getRepository(PreorderUser);
  const email = String(payload.email || '').trim().toLowerCase();
  const user = await repo.findOneBy({ email } as any);
  if (!user) throw new Error('Compte introuvable');
  if (String((user as any).passwordHash || '') !== hashPassword(payload.password || '')) {
    throw new Error('Mot de passe invalide');
  }
  const token = newToken();
  (user as any).authToken = token;
  await repo.save(user as any);
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone || null,
    token,
  };
}

export async function getPreorderUserByToken(tokenRaw: string) {
  const token = String(tokenRaw || '').trim();
  if (!token) return null;
  const repo = AppDataSource.getRepository(PreorderUser);
  const user = await repo.findOneBy({ authToken: token } as any);
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone || null,
  };
}

export async function listPreorderMenu() {
  const repo = AppDataSource.getRepository(Product);
  const products = await repo.find();
  return (products || [])
    .filter((p: any) => p.visibleInPos !== false)
    .map((p: any) => ({
      id: String(p.id || ''),
      name: String(p.name || ''),
      price: Number(p.promotionPrice ?? p.price ?? 0),
      category: String(p.category || ''),
      imageUrl: String(p.imageUrl || ''),
      available: true,
    }));
}

export async function createPreorder(payload: {
  preorderUserId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  mode: 'DELIVERY' | 'PICKUP' | 'DINE_LATER';
  scheduledAt?: number | null;
  note?: string | null;
  items: Array<{
    productId: string;
    quantity: number;
    note?: string | null;
  }>;
}) {
  return AppDataSource.transaction(async (manager) => {
    const preorderRepo = manager.getRepository(Preorder);
    const itemRepo = manager.getRepository(PreorderItem);
    const productRepo = manager.getRepository(Product);
    const items = Array.isArray(payload.items) ? payload.items : [];
    const cleanItems = items
      .map((it) => ({
        productId: String(it?.productId || '').trim(),
        quantity: Math.max(0, Math.floor(Number(it?.quantity || 0))),
        note: it?.note ? String(it.note).trim() : null,
      }))
      .filter((it) => it.productId && it.quantity > 0);
    if (!cleanItems.length) throw new Error('Aucun article valide');

    const modeRaw = String(payload.mode || '').toUpperCase();
    const mode =
      modeRaw === 'DELIVERY' || modeRaw === 'PICKUP' || modeRaw === 'DINE_LATER'
        ? (modeRaw as any)
        : 'PICKUP';
    const code = await generateNextPrefixedCode(manager, 'order', { pad: 6, prefixOverride: 'PRE-' } as any);
    const productIds = Array.from(new Set(cleanItems.map((it) => it.productId)));
    const products = await productRepo.findBy({ id: In(productIds) } as any);
    const productById = new Map(products.map((p) => [p.id, p]));
    let total = 0;
    const preorder = preorderRepo.create({
      code,
      preorderUserId: payload.preorderUserId ? String(payload.preorderUserId).trim() : null,
      customerName: String(payload.customerName || '').trim() || 'Client',
      customerPhone: payload.customerPhone ? String(payload.customerPhone).trim() : null,
      mode,
      status: 'PENDING',
      scheduledAt: payload.scheduledAt || null,
      note: payload.note ? String(payload.note).trim() : null,
      total: 0,
      createdAt: Date.now(),
    } as any);
    const savedPreorder = await preorderRepo.save(preorder as any);
    for (const line of cleanItems) {
      const p: any = productById.get(line.productId);
      if (!p) continue;
      const unitPrice = Number(p.promotionPrice ?? p.price ?? 0);
      const lineTotal = unitPrice * Number(line.quantity || 0);
      total += lineTotal;
      const row = itemRepo.create({
        preorderId: savedPreorder.id,
        productId: p.id,
        name: String(p.name || 'Article'),
        unitPrice,
        quantity: Number(line.quantity || 0),
        total: lineTotal,
        note: line.note || null,
        createdAt: Date.now(),
      } as any);
      await itemRepo.save(row as any);
    }
    (savedPreorder as any).total = total;
    await preorderRepo.save(savedPreorder as any);
    const savedItems = await itemRepo.find({ where: { preorderId: savedPreorder.id } as any });
    return { ...savedPreorder, items: savedItems };
  });
}

export async function listPreorders(params?: { preorderUserId?: string | null }) {
  const preorderRepo = AppDataSource.getRepository(Preorder);
  const itemRepo = AppDataSource.getRepository(PreorderItem);
  const where: any = {};
  if (params?.preorderUserId) where.preorderUserId = String(params.preorderUserId).trim();
  const rows = await preorderRepo.find({ where, order: { createdAt: 'DESC' } as any });
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const items = await itemRepo.find({ where: { preorderId: In(ids) } as any });
  const byPreorder = new Map<string, any[]>();
  for (const it of items as any[]) {
    const list = byPreorder.get(String(it.preorderId)) || [];
    list.push(it);
    byPreorder.set(String(it.preorderId), list);
  }
  return rows.map((r: any) => ({ ...r, items: byPreorder.get(String(r.id)) || [] }));
}

export async function updatePreorderStatus(payload: {
  preorderId: string;
  status: 'PENDING' | 'CONFIRMED' | 'READY' | 'COMPLETED' | 'CANCELLED';
}) {
  const preorderId = String(payload.preorderId || '').trim();
  if (!preorderId) throw new Error('Précommande invalide');
  const statusRaw = String(payload.status || '').trim().toUpperCase();
  const allowed = new Set(['PENDING', 'CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED']);
  if (!allowed.has(statusRaw)) throw new Error('Statut invalide');
  const repo = AppDataSource.getRepository(Preorder);
  const row = await repo.findOneBy({ id: preorderId } as any);
  if (!row) throw new Error('Précommande introuvable');
  (row as any).status = statusRaw;
  const saved = await repo.save(row as any);
  return saved;
}
