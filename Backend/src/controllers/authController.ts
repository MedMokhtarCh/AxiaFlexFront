import { Request, Response } from 'express';
import * as authService from '../services/authService.js';

export async function login(req: Request, res: Response) {
  try {
    const { pin } = req.body;
    const user = await authService.login(pin);
    if (!user) return res.status(401).json(null);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}
