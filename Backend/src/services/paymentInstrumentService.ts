import { AppDataSource } from '../data-source.js';
import { RestaurantVoucher } from '../entity/RestaurantVoucher.js';
import { RestaurantCard } from '../entity/RestaurantCard.js';
import { RestaurantCardMovement } from '../entity/RestaurantCardMovement.js';
import { getSettings } from './settingsService.js';

const parseNumeric = (value: any) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export async function createVoucher(input: any) {
  const repo = AppDataSource.getRepository(RestaurantVoucher);
  const code = String(input?.code || '').trim();
  if (!code) throw new Error('Voucher code is required');
  const amount = parseNumeric(input?.amount);
  if (amount <= 0) throw new Error('Voucher amount must be > 0');
  const exists = await repo.findOne({ where: { code } as any });
  if (exists) throw new Error('Voucher code already exists');
  const row = repo.create({
    code,
    amount,
    remainingAmount: amount,
    status: 'ACTIVE',
    issuedAt: Date.now(),
  } as any);
  return repo.save(row as any);
}

export async function getVoucherByCode(code: string) {
  const repo = AppDataSource.getRepository(RestaurantVoucher);
  return repo.findOne({ where: { code: String(code || '').trim() } as any });
}

export async function listVouchers() {
  const repo = AppDataSource.getRepository(RestaurantVoucher);
  return repo.find({ order: { issuedAt: 'DESC' } as any, take: 100 });
}

export async function createCard(input: any) {
  const repo = AppDataSource.getRepository(RestaurantCard);
  const code = String(input?.code || '').trim();
  if (!code) throw new Error('Card code is required');
  const exists = await repo.findOne({ where: { code } as any });
  if (exists) throw new Error('Card code already exists');
  const row = repo.create({
    code,
    holderName: input?.holderName ? String(input.holderName).trim() : null,
    balance: parseNumeric(input?.initialBalance),
    active: input?.active !== false,
    createdAt: Date.now(),
  } as any);
  const saved = await repo.save(row as any);
  if (parseNumeric(input?.initialBalance) > 0) {
    const mvRepo = AppDataSource.getRepository(RestaurantCardMovement);
    const mv = mvRepo.create({
      card: saved as any,
      type: 'CREDIT',
      amount: parseNumeric(input?.initialBalance),
      reference: 'INITIAL_LOAD',
      createdAt: Date.now(),
    } as any);
    await mvRepo.save(mv as any);
  }
  return saved;
}

export async function getCardByCode(code: string) {
  const repo = AppDataSource.getRepository(RestaurantCard);
  return repo.findOne({ where: { code: String(code || '').trim() } as any });
}

export async function listCards() {
  const repo = AppDataSource.getRepository(RestaurantCard);
  return repo.find({ order: { createdAt: 'DESC' } as any, take: 100 });
}

export async function topupCardByCode(code: string, input: any) {
  const repo = AppDataSource.getRepository(RestaurantCard);
  const mvRepo = AppDataSource.getRepository(RestaurantCardMovement);
  const card = await repo.findOne({ where: { code: String(code || '').trim() } as any });
  if (!card) throw new Error('Card not found');
  const amount = parseNumeric(input?.amount);
  if (amount <= 0) throw new Error('Topup amount must be > 0');
  (card as any).balance = parseNumeric((card as any).balance) + amount;
  const saved = await repo.save(card as any);
  const mv = mvRepo.create({
    card: saved as any,
    type: 'CREDIT',
    amount,
    reference: input?.reference ? String(input.reference).trim() : 'TOPUP',
    createdAt: Date.now(),
  } as any);
  await mvRepo.save(mv as any);
  return saved;
}

export async function listCardMovementsByCode(code: string) {
  const cardRepo = AppDataSource.getRepository(RestaurantCard);
  const mvRepo = AppDataSource.getRepository(RestaurantCardMovement);
  const card = await cardRepo.findOne({ where: { code: String(code || '').trim() } as any });
  if (!card) throw new Error('Card not found');
  return mvRepo.find({
    where: { card: { id: (card as any).id } } as any,
    order: { createdAt: 'DESC' } as any,
    take: 200,
    relations: ['payment'] as any,
  } as any);
}

export async function testExternalRestaurantCardApi(input: any) {
  const settings = (await getSettings()) as any;
  const cfg = {
    enabled: Boolean(input?.enabled ?? settings?.externalRestaurantCardApi?.enabled),
    url: String(input?.url ?? settings?.externalRestaurantCardApi?.url ?? '').trim(),
    token: String(input?.token ?? settings?.externalRestaurantCardApi?.token ?? '').trim(),
    timeoutMs: Number(input?.timeoutMs ?? settings?.externalRestaurantCardApi?.timeoutMs ?? 8000),
  };
  if (!cfg.enabled) throw new Error('External restaurant card API is disabled');
  if (!cfg.url) throw new Error('External restaurant card API URL is missing');

  const controller = new AbortController();
  const timeoutMs = Number.isFinite(cfg.timeoutMs) && cfg.timeoutMs > 0 ? cfg.timeoutMs : 8000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
      },
      body: JSON.stringify({
        cardCode: String(input?.cardCode || 'TEST_CARD'),
        amount: Number(input?.amount || 1),
        orderId: String(input?.orderId || 'TEST_ORDER'),
        paymentCode: String(input?.paymentCode || `TEST-${Date.now()}`),
        testMode: true,
      }),
      signal: controller.signal,
    });
    let payload: any = null;
    try {
      payload = await resp.json();
    } catch {
      payload = null;
    }
    if (!resp.ok) {
      throw new Error(
        String(payload?.error || payload?.message || `External API error (${resp.status})`),
      );
    }
    const ok = payload?.ok === true || payload?.status === 'OK' || payload?.success === true;
    return {
      ok,
      status: resp.status,
      message: ok ? 'External API test succeeded' : 'External API responded without explicit ok=true',
      response: payload,
    };
  } finally {
    clearTimeout(timer);
  }
}
