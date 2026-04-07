import { Request, Response } from 'express';
import * as ticketService from '../services/ticketService.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';
import { getTicketPdfBuffer, printTicket } from '../services/printerService.js';

export async function createTicket(req: Request, res: Response) {
  try {
    const orderId = req.params.id;
    const payload = { ...(req.body || {}), orderId };
    const created = await ticketService.createTicket(payload);
    void logAppAdminAction(req, 'insert', 'ticket', (created as any).id, { orderId });
    res.json(created);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message || 'Could not create ticket' });
  }
}

export async function listTickets(req: Request, res: Response) {
  try {
    const orderId = req.params.id;
    const items = await ticketService.listTicketsByOrder(orderId);
    res.json(items);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message || 'Could not list tickets' });
  }
}

export async function getTicket(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const t = await ticketService.getTicket(id);
    if (!t) return res.status(404).json({ error: 'Not found' });
    res.json(t);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message || 'Could not get ticket' });
  }
}

export async function print(req: Request, res: Response) {
  try {
    const id = req.params.id;
    await printTicket(id);
    void logAppAdminAction(req, 'confirm', 'ticket_print', id);
    res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message || 'Could not print ticket' });
  }
}

export async function downloadPdf(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const { fileName, buffer } = await getTicketPdfBuffer(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message || 'Could not generate ticket PDF' });
  }
}
