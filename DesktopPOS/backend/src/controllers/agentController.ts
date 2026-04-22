import { Request, Response } from 'express';
import * as agentService from '../services/agentService.js';
import * as printJobService from '../services/printJobService.js';
import { AppDataSource } from '../data-source.js';
import { Printer } from '../entity/Printer.js';
import { User } from '../entity/User.js';

function bearer(req: Request): string {
  const h = String(req.headers.authorization || '');
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ? String(m[1]).trim() : '';
}

async function requireAgent(req: Request, res: Response) {
  const terminalToken = bearer(req);
  const terminal = await agentService.findTerminalByToken(terminalToken);
  if (!terminal) {
    res.status(401).json({ error: 'Agent token invalide.' });
    return null;
  }
  return terminal;
}

export async function registerAgent(req: Request, res: Response) {
  try {
    const masterToken = String(req.header('x-agent-master-token') || '') || String((req.body || {}).masterToken || '');
    if (!agentService.verifyAgentMasterToken(masterToken)) {
      return res.status(401).json({ error: 'Master token invalide.' });
    }
    const body = req.body || {};
    const terminal = await agentService.registerTerminal({
      alias: String(body.alias || body.terminalAlias || 'Terminal'),
      fingerprintHash: String(body.fingerprintHash || ''),
      siteName: body.siteName != null ? String(body.siteName) : null,
      osInfo: body.osInfo != null ? String(body.osInfo) : null,
      agentVersion: body.agentVersion != null ? String(body.agentVersion) : null,
      capabilities: body.capabilities,
    });
    return res.json({
      terminalId: terminal.id,
      apiToken: (terminal as any).apiToken,
      alias: terminal.alias,
    });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'register failed' });
  }
}

export async function heartbeatAgent(req: Request, res: Response) {
  const terminal = await requireAgent(req, res);
  if (!terminal) return;
  await agentService.heartbeatTerminal((terminal as any).id);
  res.json({ ok: true, now: Date.now() });
}

export async function updateAgentPrinters(req: Request, res: Response) {
  const terminal = await requireAgent(req, res);
  if (!terminal) return;
  const printers = Array.isArray((req.body || {}).printers) ? (req.body || {}).printers : [];
  await agentService.upsertTerminalPrinters((terminal as any).id, printers);
  res.json({ ok: true });
}

export async function pullAgentJobs(req: Request, res: Response) {
  const terminal = await requireAgent(req, res);
  if (!terminal) return;
  const jobs = await printJobService.pullPendingJobs((terminal as any).id, Number(req.query.limit || 20));
  res.json({ jobs });
}

export async function ackAgentJob(req: Request, res: Response) {
  const terminal = await requireAgent(req, res);
  if (!terminal) return;
  const jobId = String(req.params.id || '').trim();
  if (!jobId) return res.status(400).json({ error: 'job id requis' });
  const body = req.body || {};
  const row = await printJobService.ackPrintJob((terminal as any).id, jobId, {
    ok: Boolean(body.ok),
    error: body.error != null ? String(body.error) : null,
  });
  if (!row) return res.status(404).json({ error: 'Job introuvable' });
  res.json({ ok: true, status: (row as any).status });
}

export async function listTerminals(req: Request, res: Response) {
  try {
    const userId = String(req.query.userId || '').trim();
    if (!userId) return res.status(400).json({ error: 'userId requis' });
    const user = await AppDataSource.getRepository(User).findOneBy({ id: userId } as any);
    if (!user || String(user.role || '').toUpperCase() !== 'ADMIN') {
      return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
    const rows = await agentService.listTerminalsWithPrinters();
    const pRepo = AppDataSource.getRepository(Printer);
    const bindings = await pRepo.find();
    res.json({ terminals: rows, bindings });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' });
  }
}

export async function bindPrinterToTerminal(req: Request, res: Response) {
  try {
    const body = req.body || {};
    const userId = String(body.userId || '').trim();
    if (!userId) return res.status(400).json({ error: 'userId requis' });
    const user = await AppDataSource.getRepository(User).findOneBy({ id: userId } as any);
    if (!user || String(user.role || '').toUpperCase() !== 'ADMIN') {
      return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
    const printerId = String(req.params.id || '').trim();
    if (!printerId) return res.status(400).json({ error: 'printerId requis' });
    const terminalNodeId = body.terminalNodeId ? String(body.terminalNodeId).trim() : null;
    const terminalPrinterLocalId = body.terminalPrinterLocalId
      ? String(body.terminalPrinterLocalId).trim()
      : null;
    const repo = AppDataSource.getRepository(Printer);
    const p = await repo.findOneBy({ id: printerId } as any);
    if (!p) return res.status(404).json({ error: 'Imprimante introuvable' });
    (p as any).terminalNodeId = terminalNodeId;
    (p as any).terminalPrinterLocalId = terminalPrinterLocalId;
    await repo.save(p as any);
    res.json(p);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' });
  }
}

export async function deleteTerminal(req: Request, res: Response) {
  try {
    const userId = String(req.query.userId || '').trim();
    if (!userId) return res.status(400).json({ error: 'userId requis' });
    const user = await AppDataSource.getRepository(User).findOneBy({ id: userId } as any);
    if (!user || String(user.role || '').toUpperCase() !== 'ADMIN') {
      return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
    const terminalNodeId = String(req.params.id || '').trim();
    if (!terminalNodeId) return res.status(400).json({ error: 'terminalNodeId requis' });
    const out = await agentService.deleteTerminalAndCleanup(terminalNodeId);
    res.json(out);
  } catch (e: any) {
    const msg = String(e?.message || 'Server error');
    if (/introuvable/i.test(msg)) return res.status(404).json({ error: msg });
    res.status(500).json({ error: msg });
  }
}
