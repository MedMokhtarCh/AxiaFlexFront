import { AppDataSource } from '../data-source.js';
import { PrintJob } from '../entity/PrintJob.js';

export async function enqueuePrintJob(input: {
  terminalNodeId: string;
  printerLocalId?: string | null;
  printerName?: string | null;
  payload: Record<string, unknown>;
  maxRetries?: number;
}) {
  const repo = AppDataSource.getRepository(PrintJob);
  const now = Date.now();
  const row = repo.create({
    targetTerminalNodeId: input.terminalNodeId,
    targetPrinterLocalId: input.printerLocalId || null,
    targetPrinterName: input.printerName || null,
    payload: input.payload,
    status: 'PENDING',
    retryCount: 0,
    maxRetries: Math.max(1, Math.min(10, Number(input.maxRetries || 5))),
    createdAt: now,
    updatedAt: now,
  } as any);
  return await repo.save(row as any);
}

export async function pullPendingJobs(terminalNodeId: string, limit = 20) {
  const repo = AppDataSource.getRepository(PrintJob);
  const now = Date.now();
  const jobs = await repo.find({
    where: {
      targetTerminalNodeId: terminalNodeId,
      status: 'PENDING' as any,
    } as any,
    order: { createdAt: 'ASC' } as any,
    take: Math.max(1, Math.min(100, limit)),
  });
  for (const j of jobs as any[]) {
    j.status = 'IN_PROGRESS';
    j.pickedAt = now;
    j.updatedAt = now;
    await repo.save(j);
  }
  return jobs;
}

export async function ackPrintJob(
  terminalNodeId: string,
  jobId: string,
  payload: { ok: boolean; error?: string | null },
) {
  const repo = AppDataSource.getRepository(PrintJob);
  const job = await repo.findOne({
    where: { id: jobId, targetTerminalNodeId: terminalNodeId } as any,
  });
  if (!job) return null;
  const now = Date.now();
  if (payload.ok) {
    (job as any).status = 'DONE';
    (job as any).completedAt = now;
    (job as any).lastError = null;
  } else {
    (job as any).retryCount = Number((job as any).retryCount || 0) + 1;
    (job as any).lastError = String(payload.error || 'Unknown print error').slice(0, 500);
    (job as any).status =
      Number((job as any).retryCount || 0) >= Number((job as any).maxRetries || 5)
        ? 'FAILED'
        : 'PENDING';
  }
  (job as any).updatedAt = now;
  await repo.save(job as any);
  return job;
}
