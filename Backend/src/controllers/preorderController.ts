import { Request, Response } from 'express';
import {
  createPreorder,
  getPreorderUserByToken,
  listPreorderMenu,
  listPreorders,
  signinPreorderUser,
  signupPreorderUser,
  updatePreorderStatus,
} from '../services/preorderService.js';

const readBearer = (req: Request) => {
  const raw = String(req.headers.authorization || '').trim();
  if (!raw.toLowerCase().startsWith('bearer ')) return '';
  return raw.slice(7).trim();
};

export async function preorderSignup(req: Request, res: Response) {
  try {
    const out = await signupPreorderUser(req.body || {});
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: (err as any)?.message || 'Signup failed' });
  }
}

export async function preorderSignin(req: Request, res: Response) {
  try {
    const out = await signinPreorderUser(req.body || {});
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: (err as any)?.message || 'Signin failed' });
  }
}

export async function getPreorderMenu(_req: Request, res: Response) {
  try {
    const rows = await listPreorderMenu();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function postPreorder(req: Request, res: Response) {
  try {
    const token = readBearer(req);
    const user = token ? await getPreorderUserByToken(token) : null;
    const body = req.body || {};
    const out = await createPreorder({
      ...body,
      preorderUserId: body.preorderUserId || user?.id || null,
      customerName: body.customerName || user?.fullName || 'Client',
      customerPhone: body.customerPhone || user?.phone || null,
    });
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: (err as any)?.message || 'Create preorder failed' });
  }
}

export async function getPreorders(req: Request, res: Response) {
  try {
    const token = readBearer(req);
    const user = token ? await getPreorderUserByToken(token) : null;
    const preorderUserId = user?.id || (req.query?.preorderUserId
      ? String(req.query.preorderUserId)
      : null);
    const rows = await listPreorders({ preorderUserId });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function preorderMe(req: Request, res: Response) {
  try {
    const token = readBearer(req);
    const user = await getPreorderUserByToken(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}

export async function patchPreorderStatus(req: Request, res: Response) {
  try {
    const out = await updatePreorderStatus({
      preorderId: String(req.params.id || ''),
      status: String(req.body?.status || '') as any,
    });
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: (err as any)?.message || 'Update status failed' });
  }
}
