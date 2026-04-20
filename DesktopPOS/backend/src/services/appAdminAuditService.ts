import type { Request } from 'express';
import { AppDataSource } from '../data-source.js';
import { User } from '../entity/User.js';
import { appendAuditLine } from './fileAuditLogService.js';

/** Actions métier tracées dans le journal administrateur. */
export type AppAdminAuditAction = 'insert' | 'update' | 'delete' | 'confirm' | 'cancel';

function pickFromReq(req: Request): { id?: string; name?: string } {
  const anyReq = req as any;
  const aid = anyReq.auditActorId != null ? String(anyReq.auditActorId).trim() : '';
  const aname = anyReq.auditActorName != null ? String(anyReq.auditActorName).trim() : '';
  if (aid || aname) return { id: aid || undefined, name: aname || undefined };

  const body =
    req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};
  const q = req.query as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = body[k] ?? q[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  };
  return {
    id: pick('userId', 'cashierId', 'actorId', 'openedById', 'serverId') || undefined,
    name: pick('userName', 'cashierName', 'actorName', 'openedByName', 'serverName') || undefined,
  };
}

export async function resolveActorForAudit(req: Request): Promise<{ userId: string; userName: string }> {
  const { id, name } = pickFromReq(req);
  if (id) {
    if (name) return { userId: id, userName: name };
    const user = await AppDataSource.getRepository(User).findOneBy({ id } as any);
    return { userId: id, userName: user?.name || id };
  }
  return { userId: 'inconnu', userName: 'Inconnu' };
}

/**
 * Journal « admin app » : insertion / modification / suppression / confirmation / annulation,
 * avec utilisateur et date-heure (UTC + affichage local serveur).
 */
export async function logAppAdminAction(
  req: Request,
  action: AppAdminAuditAction,
  resource: string,
  resourceId?: string | null,
  detail?: Record<string, unknown>,
) {
  try {
    const actor = await resolveActorForAudit(req);
    const d = new Date();
    await appendAuditLine('app-admin', {
      type: 'action',
      action,
      resource,
      resourceId: resourceId ?? undefined,
      userId: actor.userId,
      userName: actor.userName,
      dateTimeUtc: d.toISOString(),
      dateLocal: d.toLocaleDateString('fr-CA'),
      timeLocal: d.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }),
      path: req.path,
      method: req.method,
      ...(detail && Object.keys(detail).length ? { detail } : {}),
    });
  } catch (e) {
    console.error('[app-admin-audit]', e);
  }
}
