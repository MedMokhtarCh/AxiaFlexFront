import crypto from 'crypto';
import { AppDataSource } from '../data-source.js';
import { TerminalNode } from '../entity/TerminalNode.js';
import { TerminalPrinter } from '../entity/TerminalPrinter.js';
import { Printer } from '../entity/Printer.js';
import * as saas from './saasLicenseService.js';

const AGENT_MASTER_TOKEN = String((process.env as any).AGENT_MASTER_TOKEN || '').trim();

export function verifyAgentMasterToken(token?: string | null) {
  const t = String(token || '').trim();
  if (!AGENT_MASTER_TOKEN) return false;
  return t.length > 0 && t === AGENT_MASTER_TOKEN;
}

export function signTerminalToken() {
  return crypto.randomBytes(32).toString('hex');
}

export async function registerTerminal(input: {
  alias: string;
  fingerprintHash: string;
  siteName?: string | null;
  osInfo?: string | null;
  agentVersion?: string | null;
  capabilities?: unknown;
  assignedPlan?: string | null;
}) {
  const repo = AppDataSource.getRepository(TerminalNode);
  const now = Date.now();
  const fingerprintHash = String(input.fingerprintHash || '').trim().slice(0, 128);
  if (!fingerprintHash) throw new Error('fingerprintHash requis');
  const alias = String(input.alias || 'Terminal').trim().slice(0, 120) || 'Terminal';
  let row: TerminalNode | null = await repo.findOne({ where: { fingerprintHash } as any });
  const desiredPlan = String(input.assignedPlan || 'BASIC').trim().toUpperCase();
  const planAllowed = await saas.isTerminalPlanAllowed(desiredPlan);
  if (!planAllowed) throw new Error(`Plan terminal non autorisé: ${desiredPlan}`);
  const apiToken = signTerminalToken();
  if (!row) {
    await saas.assertTerminalQuota(1);
    row = repo.create({
      alias,
      fingerprintHash,
      siteName: input.siteName ? String(input.siteName).slice(0, 120) : null,
      osInfo: input.osInfo ? String(input.osInfo).slice(0, 120) : null,
      agentVersion: input.agentVersion
        ? String(input.agentVersion).slice(0, 40)
        : null,
      capabilities: input.capabilities ?? null,
      apiToken,
      assignedPlan: desiredPlan,
      accessEnabled: true,
      online: true,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    } as TerminalNode);
  } else {
    Object.assign(row, {
      alias,
      siteName: input.siteName ? String(input.siteName).slice(0, 120) : null,
      osInfo: input.osInfo ? String(input.osInfo).slice(0, 120) : null,
      agentVersion: input.agentVersion ? String(input.agentVersion).slice(0, 40) : null,
      capabilities: input.capabilities ?? null,
      apiToken,
      assignedPlan: desiredPlan || row.assignedPlan || 'BASIC',
      online: true,
      lastSeenAt: now,
      updatedAt: now,
    });
  }
  const saved = await repo.save(row as any);
  return saved;
}

export async function findTerminalByToken(apiToken: string) {
  const repo = AppDataSource.getRepository(TerminalNode);
  const token = String(apiToken || '').trim();
  if (!token) return null;
  const row = await repo.findOne({ where: { apiToken: token } as any });
  if (!row) return null;
  if ((row as any).accessEnabled === false) return null;
  return row;
}

export async function heartbeatTerminal(terminalId: string) {
  const repo = AppDataSource.getRepository(TerminalNode);
  const row = await repo.findOne({ where: { id: terminalId } as any });
  if (!row) return null;
  const now = Date.now();
  Object.assign(row, {
    online: true,
    lastSeenAt: now,
    updatedAt: now,
  });
  return await repo.save(row as any);
}

function detectTransport(portName?: string | null) {
  const p = String(portName || '').toUpperCase();
  if (p.startsWith('USB')) return 'USB';
  if (p.includes('TCP') || p.includes('IP_') || p.startsWith('192.168.') || p.startsWith('10.'))
    return 'TCP';
  if (p.startsWith('\\\\')) return 'SHARED';
  return 'UNKNOWN';
}

export async function upsertTerminalPrinters(
  terminalId: string,
  printers: Array<Record<string, unknown>>,
) {
  const repo = AppDataSource.getRepository(TerminalPrinter);
  const now = Date.now();
  const existing = await repo.find({ where: { terminalNodeId: terminalId } as any });
  const byLocalId = new Map(
    existing.map((e: any) => [String(e.printerLocalId || '').trim(), e]),
  );
  const touched = new Set<string>();
  for (const raw of Array.isArray(printers) ? printers : []) {
    const name = String(raw.Name ?? raw.name ?? '').trim();
    if (!name) continue;
    const localId = String(raw.printerLocalId ?? raw.PortName ?? raw.portName ?? name)
      .trim()
      .slice(0, 240);
    if (!localId) continue;
    touched.add(localId);
    const next = {
      terminalNodeId: terminalId,
      printerLocalId: localId,
      name: name.slice(0, 240),
      driverName: String(raw.DriverName ?? raw.driverName ?? '').trim().slice(0, 240) || null,
      portName: String(raw.PortName ?? raw.portName ?? '').trim().slice(0, 240) || null,
      transport: detectTransport(String(raw.PortName ?? raw.portName ?? '')) as any,
      metadata: raw,
      isOnline: true,
      updatedAt: now,
    } as any;
    const found = byLocalId.get(localId);
    if (found) {
      Object.assign(found, next);
      await repo.save(found);
    } else {
      await repo.save(repo.create(next));
    }
  }
  for (const row of existing as any[]) {
    const id = String(row.printerLocalId || '');
    if (id && !touched.has(id)) {
      row.isOnline = false;
      row.updatedAt = now;
      await repo.save(row);
    }
  }
}

export async function listTerminalsWithPrinters() {
  const tRepo = AppDataSource.getRepository(TerminalNode);
  const pRepo = AppDataSource.getRepository(TerminalPrinter);
  const terminals = await tRepo.find({ order: { updatedAt: 'DESC' } as any });
  const printers = await pRepo.find({ order: { updatedAt: 'DESC' } as any });
  const byTerminal = new Map<string, any[]>();
  for (const p of printers as any[]) {
    const list = byTerminal.get(String(p.terminalNodeId)) || [];
    list.push(p);
    byTerminal.set(String(p.terminalNodeId), list);
  }
  return terminals.map((t: any) => ({ ...t, printers: byTerminal.get(String(t.id)) || [] }));
}

export async function deleteTerminalAndCleanup(terminalNodeId: string) {
  const terminalId = String(terminalNodeId || '').trim();
  if (!terminalId) throw new Error('terminalNodeId requis');
  const tRepo = AppDataSource.getRepository(TerminalNode);
  const tpRepo = AppDataSource.getRepository(TerminalPrinter);
  const printerRepo = AppDataSource.getRepository(Printer);

  const row = await tRepo.findOne({ where: { id: terminalId } as any });
  if (!row) throw new Error('Terminal introuvable');

  const unboundResult = await printerRepo
    .createQueryBuilder()
    .update()
    .set({
      terminalNodeId: null,
      terminalPrinterLocalId: null,
    } as any)
    .where('terminalNodeId = :terminalId', { terminalId })
    .execute();

  await tpRepo
    .createQueryBuilder()
    .delete()
    .from(TerminalPrinter)
    .where('terminalNodeId = :terminalId', { terminalId })
    .execute();

  await tRepo.remove(row as any);

  return {
    ok: true,
    terminalNodeId: terminalId,
    unboundPrinters: Number(unboundResult?.affected || 0),
  };
}
