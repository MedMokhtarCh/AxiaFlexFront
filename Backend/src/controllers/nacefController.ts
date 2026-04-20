import type { Request, Response } from 'express';
import * as nacefService from '../services/nacefService.js';

function bodyImdf(req: Request) {
  const fromBody =
    req.body?.imdf ??
    req.body?.cashRegisterInfo?.imdf ??
    req.body?.cashRegisterInfo?.serialNumber ??
    req.body?.cashRegisterInfo?.model;
  const fromHeader = req.header('x-nacef-imdf');
  return fromBody ?? fromHeader ?? req.params?.imdf ?? req.query?.imdf ?? 'DEFAULT_IMDF';
}

export async function getManifest(req: Request, res: Response) {
  try {
    const manifest = await nacefService.getManifest(bodyImdf(req));
    return res.json(manifest);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Requete invalide' });
  }
}

export async function requestCertificate(req: Request, res: Response) {
  try {
    const result = await nacefService.requestCertificate(bodyImdf(req));
    if ((result as any)?.errorCode) return res.status(409).json(result);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Requete invalide' });
  }
}

export async function simulateCertificateGenerated(req: Request, res: Response) {
  try {
    const expiresInDays = Number(req.body?.expiresInDays || 365);
    const manifest = await nacefService.markCertificateGenerated(bodyImdf(req), expiresInDays);
    return res.json({ ok: true, manifest });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Requete invalide' });
  }
}

export async function simulateCertificateExpired(req: Request, res: Response) {
  try {
    const result = await nacefService.simulateCertificateExpired(bodyImdf(req));
    if ((result as any)?.errorCode) return res.status(409).json(result);
    return res.json({ ok: true, manifest: result });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Requete invalide' });
  }
}

export async function synchronize(req: Request, res: Response) {
  try {
    const result = await nacefService.synchronize(bodyImdf(req), req.body?.mode);
    if ((result as any)?.errorCode) return res.status(409).json(result);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Requete invalide' });
  }
}

export async function sign(req: Request, res: Response) {
  try {
    const result = await nacefService.signTicket(bodyImdf(req), req.body?.ticket);
    if ((result as any)?.errorCode) return res.status(409).json(result);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Requete invalide' });
  }
}

export async function setStatus(req: Request, res: Response) {
  try {
    const manifest = await nacefService.setSmdfStatus(bodyImdf(req), req.body?.status);
    if ((manifest as any)?.errorCode) return res.status(409).json(manifest);
    return res.json({ ok: true, manifest });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Requete invalide' });
  }
}

function parseExternalTicket(req: Request) {
  const base64Ticket = String(req.body?.base64Ticket || '').trim();
  if (!base64Ticket) return req.body?.ticket || req.body || null;
  try {
    const decoded = Buffer.from(base64Ticket, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export async function externalGetManifest(req: Request, res: Response) {
  return getManifest(req, res);
}

export async function externalRequestCertificate(req: Request, res: Response) {
  return requestCertificate(req, res);
}

export async function externalSyncRequest(req: Request, res: Response) {
  try {
    const mode =
      req.body?.mode ??
      (req.body?.requestOfflineMode === true ? 'OFFLINE' : req.body?.requestOfflineMode === false ? 'ONLINE' : '');
    const result = await nacefService.synchronize(bodyImdf(req), mode);
    if ((result as any)?.errorCode) return res.status(409).json(result);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Requete invalide' });
  }
}

export async function externalSignatureRequest(req: Request, res: Response) {
  try {
    const ticket = parseExternalTicket(req);
    if (!ticket) {
      return res.status(400).json({
        error: 'base64Ticket invalide. JSON ticket attendu.',
      });
    }
    const result = await nacefService.signTicket(bodyImdf(req), ticket);
    if ((result as any)?.errorCode) return res.status(409).json(result);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Requete invalide' });
  }
}

export async function externalLog(req: Request, res: Response) {
  try {
    const result = await nacefService.pushLog(bodyImdf(req), req.body);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Requete invalide' });
  }
}

