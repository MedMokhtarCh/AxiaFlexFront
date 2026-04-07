import { Request, Response } from 'express';
import { AppDataSource } from '../data-source.js';
import { Order } from '../entity/Order.js';
import { Product } from '../entity/Product.js';
import { Category } from '../entity/Category.js';
import { Shift } from '../entity/Shift.js';
import { Fund } from '../entity/Fund.js';
import { FundSession } from '../entity/FundSession.js';
import { FundMovement } from '../entity/FundMovement.js';

const parseBoundary = (value: any): number | undefined => {
    if (value === null || value === undefined || value === '') return undefined;
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;
    const asDate = Date.parse(String(value));
    return Number.isFinite(asDate) ? asDate : undefined;
};

const normaliseNumber = (value: any): number => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

export async function salesSummary(req: Request, res: Response) {
    try {
        const { from, to, serverId, paymentMethod, terminalId } = req.query as any;
        const fromMs = parseBoundary(from);
        const toMs = parseBoundary(to);

        const repo = AppDataSource.getRepository(Order);
        let qb = repo.createQueryBuilder('o');

        if (fromMs) qb = qb.andWhere('o.createdAt >= :from', { from: fromMs });
        if (toMs) qb = qb.andWhere('o.createdAt <= :to', { to: toMs });
        if (terminalId) qb = qb.andWhere('o.terminalId = :terminalId', { terminalId });
        if (serverId) qb = qb.andWhere('o.serverId = :serverId', { serverId });
        if (paymentMethod)
            qb = qb.andWhere('o.paymentMethod = :paymentMethod', { paymentMethod });

        qb = qb.andWhere("UPPER(o.status) = 'COMPLETED'");

        const orders = await qb.getMany();

        const byDay = new Map<
            string,
            { date: string; ticketCount: number; revenue: number }
        >();

        for (const o of orders) {
            const day = new Date(Number(o.createdAt || 0))
                .toISOString()
                .slice(0, 10);
            const entry =
                byDay.get(day) || ({ date: day, ticketCount: 0, revenue: 0 } as const);
            const total = normaliseNumber(o.total);
            byDay.set(day, {
                date: entry.date,
                ticketCount: entry.ticketCount + 1,
                revenue: entry.revenue + total,
            });
        }

        const items = Array.from(byDay.values()).sort((a, b) =>
            a.date.localeCompare(b.date),
        );

        const totals = items.reduce(
            (acc, row) => {
                acc.ticketCount += row.ticketCount;
                acc.revenue += row.revenue;
                return acc;
            },
            { ticketCount: 0, revenue: 0 },
        );

        const averageTicket =
            totals.ticketCount > 0 ? totals.revenue / totals.ticketCount : 0;

        res.json({
            period: { from: fromMs ?? null, to: toMs ?? null },
            items,
            totals: {
                ticketCount: totals.ticketCount,
                revenue: totals.revenue,
                averageTicket,
            },
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
}

export async function salesByProduct(req: Request, res: Response) {
    try {
        const { from, to, categoryId, serverId, terminalId } = req.query as any;
        const fromMs = parseBoundary(from);
        const toMs = parseBoundary(to);

        const repo = AppDataSource.getRepository(Order);
        let qb = repo.createQueryBuilder('o');
        if (fromMs) qb = qb.andWhere('o.createdAt >= :from', { from: fromMs });
        if (toMs) qb = qb.andWhere('o.createdAt <= :to', { to: toMs });
        if (terminalId) qb = qb.andWhere('o.terminalId = :terminalId', { terminalId });
        if (serverId) qb = qb.andWhere('o.serverId = :serverId', { serverId });
        qb = qb.andWhere("UPPER(o.status) = 'COMPLETED'");

        const orders = await qb.getMany();

        // Build lookup maps for products and categories so that we can
        // reliably infer category information even if it was not
        // duplicated on the order items payload.
        const productRepo = AppDataSource.getRepository(Product);
        const categoryRepo = AppDataSource.getRepository(Category);
        const [products, categories] = await Promise.all([
            productRepo.find(),
            categoryRepo.find(),
        ]);

        const productById = new Map<string, Product>();
        for (const p of products) {
            if (p.id) productById.set(String(p.id), p);
        }

        const categoryNameById = new Map<string, string>();
        for (const c of categories) {
            if (c.id) categoryNameById.set(String(c.id), c.name);
        }

        type Row = {
            productId: string;
            productName: string;
            categoryId?: string | null;
            quantity: number;
            revenue: number;
        };
        const map = new Map<string, Row>();

        for (const o of orders) {
            const items = Array.isArray(o.items) ? o.items : [];
            for (const it of items) {
                const pid = String(it.productId || '');
                if (!pid) continue;
                const product = productById.get(pid);
                const catIdFromProduct = product?.category
                    ? String(product.category)
                    : '';
                const catId = String(catIdFromProduct || '');
                if (categoryId && catId !== String(categoryId)) {
                    continue;
                }
                const key = pid;
                const current =
                    map.get(key) ||
                    ({
                        productId: pid,
                        productName: String(it.name || product?.name || pid),
                        categoryId: catId || null,
                        quantity: 0,
                        revenue: 0,
                    } as Row);
                const qty = normaliseNumber((it as any).quantity || 0);
                const lineTotal = normaliseNumber((it as any).unitPrice || 0) * qty;
                current.quantity += qty;
                current.revenue += lineTotal;
                map.set(key, current);
            }
        }

        const items = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
        const totals = items.reduce(
            (acc, row) => {
                acc.quantity += row.quantity;
                acc.revenue += row.revenue;
                return acc;
            },
            { quantity: 0, revenue: 0 },
        );

        res.json({
            period: { from: fromMs ?? null, to: toMs ?? null },
            items,
            totals,
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
}

export async function salesByCategory(req: Request, res: Response) {
    try {
        const { from, to, serverId, terminalId } = req.query as any;
        const fromMs = parseBoundary(from);
        const toMs = parseBoundary(to);

        const repo = AppDataSource.getRepository(Order);
        let qb = repo.createQueryBuilder('o');
        if (fromMs) qb = qb.andWhere('o.createdAt >= :from', { from: fromMs });
        if (toMs) qb = qb.andWhere('o.createdAt <= :to', { to: toMs });
        if (terminalId) qb = qb.andWhere('o.terminalId = :terminalId', { terminalId });
        if (serverId) qb = qb.andWhere('o.serverId = :serverId', { serverId });
        qb = qb.andWhere("UPPER(o.status) = 'COMPLETED'");

        const orders = await qb.getMany();

        const productRepo = AppDataSource.getRepository(Product);
        const categoryRepo = AppDataSource.getRepository(Category);
        const [products, categories] = await Promise.all([
            productRepo.find(),
            categoryRepo.find(),
        ]);

        const productById = new Map<string, Product>();
        for (const p of products) {
            if (p.id) productById.set(String(p.id), p);
        }

        const categoryNameById = new Map<string, string>();
        for (const c of categories) {
            if (c.id) categoryNameById.set(String(c.id), c.name);
        }

        type Row = {
            categoryId: string | null;
            categoryLabel: string;
            quantity: number;
            revenue: number;
        };
        const map = new Map<string, Row>();

        for (const o of orders) {
            const items = Array.isArray(o.items) ? o.items : [];
            for (const it of items) {
                const pid = String(it.productId || '');
                const product = productById.get(pid);
                const catIdFromProduct = product?.category
                    ? String(product.category)
                    : '';
                const catId = String(catIdFromProduct || '');
                const key = catId || 'UNCATEGORISED';
                const labelFromCategory = catId
                    ? categoryNameById.get(catId)
                    : undefined;
                const current =
                    map.get(key) ||
                    ({
                        categoryId: catId || null,
                        categoryLabel: String(labelFromCategory || 'Sans catégorie'),
                        quantity: 0,
                        revenue: 0,
                    } as Row);
                const qty = normaliseNumber((it as any).quantity || 0);
                const lineTotal = normaliseNumber((it as any).unitPrice || 0) * qty;
                current.quantity += qty;
                current.revenue += lineTotal;
                map.set(key, current);
            }
        }

        const items = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
        const totals = items.reduce(
            (acc, row) => {
                acc.quantity += row.quantity;
                acc.revenue += row.revenue;
                return acc;
            },
            { quantity: 0, revenue: 0 },
        );

        res.json({
            period: { from: fromMs ?? null, to: toMs ?? null },
            items,
            totals,
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
}

export async function salesByServer(req: Request, res: Response) {
    try {
        const { from, to, terminalId } = req.query as any;
        const fromMs = parseBoundary(from);
        const toMs = parseBoundary(to);

        const repo = AppDataSource.getRepository(Order);
        let qb = repo.createQueryBuilder('o');
        if (fromMs) qb = qb.andWhere('o.createdAt >= :from', { from: fromMs });
        if (toMs) qb = qb.andWhere('o.createdAt <= :to', { to: toMs });
        if (terminalId) qb = qb.andWhere('o.terminalId = :terminalId', { terminalId });
        qb = qb.andWhere("UPPER(o.status) = 'COMPLETED'");

        const orders = await qb.getMany();

        type Row = {
            serverId: string | null;
            serverName: string;
            ticketCount: number;
            revenue: number;
        };
        const map = new Map<string, Row>();

        for (const o of orders) {
            const id = String(o.serverId || '') || 'UNKNOWN';
            const name = String(o.serverName || 'Inconnu');
            const key = id || name;
            const current =
                map.get(key) ||
                ({
                    serverId: id || null,
                    serverName: name,
                    ticketCount: 0,
                    revenue: 0,
                } as Row);
            current.ticketCount += 1;
            current.revenue += normaliseNumber(o.total);
            map.set(key, current);
        }

        const items = Array.from(map.values()).sort(
            (a, b) => b.revenue - a.revenue,
        );
        const totals = items.reduce(
            (acc, row) => {
                acc.ticketCount += row.ticketCount;
                acc.revenue += row.revenue;
                return acc;
            },
            { ticketCount: 0, revenue: 0 },
        );

        res.json({
            period: { from: fromMs ?? null, to: toMs ?? null },
            items,
            totals,
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
}

export async function salesByPaymentMethod(req: Request, res: Response) {
    try {
        const { from, to, terminalId } = req.query as any;
        const fromMs = parseBoundary(from);
        const toMs = parseBoundary(to);

        const repo = AppDataSource.getRepository(Order);
        let qb = repo.createQueryBuilder('o');
        if (fromMs) qb = qb.andWhere('o.createdAt >= :from', { from: fromMs });
        if (toMs) qb = qb.andWhere('o.createdAt <= :to', { to: toMs });
        if (terminalId) qb = qb.andWhere('o.terminalId = :terminalId', { terminalId });
        qb = qb.andWhere("UPPER(o.status) = 'COMPLETED'");

        const orders = await qb.getMany();

        type Row = {
            method: string;
            revenue: number;
            ticketCount: number;
        };
        const map = new Map<string, Row>();

        for (const o of orders) {
            const method = String(o.paymentMethod || 'UNKNOWN');
            const key = method || 'UNKNOWN';
            const current =
                map.get(key) ||
                ({ method, revenue: 0, ticketCount: 0 } as Row);
            current.ticketCount += 1;
            current.revenue += normaliseNumber(o.total);
            map.set(key, current);
        }

        const items = Array.from(map.values()).sort(
            (a, b) => b.revenue - a.revenue,
        );
        const totals = items.reduce(
            (acc, row) => {
                acc.ticketCount += row.ticketCount;
                acc.revenue += row.revenue;
                return acc;
            },
            { ticketCount: 0, revenue: 0 },
        );

        res.json({
            period: { from: fromMs ?? null, to: toMs ?? null },
            items,
            totals,
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
}

export async function salesByTimeslot(req: Request, res: Response) {
    try {
        const { from, to, intervalMinutes, terminalId } = req.query as any;
        const fromMs = parseBoundary(from);
        const toMs = parseBoundary(to);
        const interval = Number(intervalMinutes) || 60;

        const repo = AppDataSource.getRepository(Order);
        let qb = repo.createQueryBuilder('o');
        if (fromMs) qb = qb.andWhere('o.createdAt >= :from', { from: fromMs });
        if (toMs) qb = qb.andWhere('o.createdAt <= :to', { to: toMs });
        if (terminalId) qb = qb.andWhere('o.terminalId = :terminalId', { terminalId });
        qb = qb.andWhere("UPPER(o.status) = 'COMPLETED'");

        const orders = await qb.getMany();

        type Row = {
            slot: string;
            start: number;
            end: number;
            ticketCount: number;
            revenue: number;
        };
        const map = new Map<string, Row>();

        for (const o of orders) {
            const ts = Number(o.createdAt || 0);
            const date = new Date(ts);
            const minutes = date.getHours() * 60 + date.getMinutes();
            const slotStart = Math.floor(minutes / interval) * interval;
            const slotEnd = slotStart + interval;
            const label = `${String(Math.floor(slotStart / 60)).padStart(2, '0')}:${String(slotStart % 60).padStart(2, '0')} - ${String(Math.floor(slotEnd / 60)).padStart(2, '0')}:${String(slotEnd % 60).padStart(2, '0')}`;

            const key = label;
            const current =
                map.get(key) ||
                ({
                    slot: label,
                    start: slotStart,
                    end: slotEnd,
                    ticketCount: 0,
                    revenue: 0,
                } as Row);
            current.ticketCount += 1;
            current.revenue += normaliseNumber(o.total);
            map.set(key, current);
        }

        const items = Array.from(map.values()).sort((a, b) => a.start - b.start);
        const totals = items.reduce(
            (acc, row) => {
                acc.ticketCount += row.ticketCount;
                acc.revenue += row.revenue;
                return acc;
            },
            { ticketCount: 0, revenue: 0 },
        );

        res.json({
            period: { from: fromMs ?? null, to: toMs ?? null },
            intervalMinutes: interval,
            items,
            totals,
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
}

export async function cashClosing(req: Request, res: Response) {
    try {
        const { from, to, fundId, cashierId, terminalId } = req.query as any;
        const fromMs = parseBoundary(from);
        const toMs = parseBoundary(to);

        const sessionRepo = AppDataSource.getRepository(FundSession);
        let qb = sessionRepo.createQueryBuilder('fs');
        if (fromMs) qb = qb.andWhere('fs.openedAt >= :from', { from: fromMs });
        if (toMs) qb = qb.andWhere('fs.openedAt <= :to', { to: toMs });
        if (fundId) qb = qb.andWhere('fs.fundId = :fundId', { fundId });
        if (cashierId) qb = qb.andWhere('fs.cashierId = :cashierId', { cashierId });
        if (terminalId) qb = qb.andWhere('fs.terminalId = :terminalId', { terminalId });

        const sessions = await qb.getMany();

        const movementRepo = AppDataSource.getRepository(FundMovement);
        const sessionIds = sessions.map((s) => s.id);
        const movements = sessionIds.length
            ? await movementRepo.findBy({ fundSessionId: sessionIds as any })
            : [];

        const fundRepo = AppDataSource.getRepository(Fund);
        const funds = await fundRepo.find();

        const items = sessions.map((s) => {
            const fund = funds.find((f) => f.id === s.fundId);
            const sessionMovements = movements.filter((m) => m.fundSessionId === s.id);
            const inTotal = sessionMovements
                .filter((m) => String(m.type || '').toUpperCase() === 'IN')
                .reduce((sum, m) => sum + normaliseNumber(m.amount), 0);
            const outTotal = sessionMovements
                .filter((m) => String(m.type || '').toUpperCase() === 'OUT')
                .reduce((sum, m) => sum + normaliseNumber(m.amount), 0);

            const expectedClosing =
                normaliseNumber(s.openingBalance) +
                normaliseNumber(s.cashSales) +
                inTotal -
                outTotal;
            const difference = normaliseNumber(s.closingBalance) - expectedClosing;

            return {
                sessionId: s.id,
                fundId: s.fundId,
                fundName: fund?.name || s.fundId,
                currency: fund?.currency || 'DT',
                cashierId: s.cashierId,
                cashierName: s.cashierName,
                openedAt: s.openedAt,
                closedAt: s.closedAt || null,
                openingBalance: normaliseNumber(s.openingBalance),
                closingBalance: normaliseNumber(s.closingBalance),
                cashSales: normaliseNumber(s.cashSales),
                cardSales: normaliseNumber(s.cardSales),
                totalSales: normaliseNumber(s.totalSales),
                movementsIn: inTotal,
                movementsOut: outTotal,
                expectedClosing,
                difference,
                status: s.status,
            };
        });

        res.json({
            period: { from: fromMs ?? null, to: toMs ?? null },
            items,
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
}

export async function topCustomers(req: Request, res: Response) {
    try {
        const { from, to, limit, terminalId } = req.query as any;
        const fromMs = parseBoundary(from);
        const toMs = parseBoundary(to);
        const max = Number(limit) || 20;

        const repo = AppDataSource.getRepository(Order);
        let qb = repo.createQueryBuilder('o');
        if (fromMs) qb = qb.andWhere('o.createdAt >= :from', { from: fromMs });
        if (toMs) qb = qb.andWhere('o.createdAt <= :to', { to: toMs });
        if (terminalId) qb = qb.andWhere('o.terminalId = :terminalId', { terminalId });
        qb = qb.andWhere('o.clientId IS NOT NULL');
        qb = qb.andWhere("UPPER(o.status) = 'COMPLETED'");

        const orders = await qb.getMany();

        type Row = {
            clientId: string;
            orderCount: number;
            revenue: number;
        };
        const map = new Map<string, Row>();

        for (const o of orders) {
            const cid = String(o.clientId || '');
            if (!cid) continue;
            const current =
                map.get(cid) || ({ clientId: cid, orderCount: 0, revenue: 0 } as Row);
            current.orderCount += 1;
            current.revenue += normaliseNumber(o.total);
            map.set(cid, current);
        }

        const items = Array.from(map.values())
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, max);

        res.json({
            period: { from: fromMs ?? null, to: toMs ?? null },
            items,
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
}
