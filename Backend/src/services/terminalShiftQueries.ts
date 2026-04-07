import { AppDataSource } from '../data-source.js';
import { Shift } from '../entity/Shift.js';
import { getSettings } from './settingsService.js';

/**
 * Shifts encore OPEN rattachés à ce poste (même règle terminalId que resolveLatestOpenShift).
 * Utilisé pour bloquer la clôture de caisse en mode équipes (restaurant multi-creneaux).
 */
export async function listOpenShiftsForCurrentTerminal(): Promise<Shift[]> {
  const settings = await getSettings();
  const tidRaw = settings?.terminalId ? String(settings.terminalId).trim() : '';
  const repo = AppDataSource.getRepository(Shift);
  const all = await repo.find({
    where: { status: 'OPEN' } as any,
    order: { openedAt: 'ASC' } as any,
  });
  if (!tidRaw) return all;
  return all.filter((s) => {
    const stid = s.terminalId != null ? String(s.terminalId).trim() : '';
    return !stid || stid === tidRaw;
  });
}
