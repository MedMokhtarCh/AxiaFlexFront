import { AppDataSource } from '../data-source.js';
import { NacefSmdfState, type SmdfCommMode } from '../entity/NacefSmdfState.js';
import { getSettings } from './settingsService.js';
import {
  fetchManifestRemote,
  pushLogRemote,
  requestCertificateRemote,
  signTicketRemote,
  synchronizeRemote,
} from './nacefHttpClient.js';

const repo = () => AppDataSource.getRepository(NacefSmdfState);
const DEFAULT_OFFLINE_TICKETS = 20;
const DEFAULT_REMOTE_BASE_URL = 'http://127.0.0.1:10006';

type NacefRuntimeConfig = {
  mode: 'SIMULATED' | 'REMOTE';
  baseUrl: string;
};

function now() {
  return Date.now();
}

function normalizeNacefMode(raw: unknown): 'SIMULATED' | 'REMOTE' {
  return String(raw || '').trim().toUpperCase() === 'REMOTE' ? 'REMOTE' : 'SIMULATED';
}

function normalizeBaseUrl(raw: unknown) {
  const out = String(raw || '').trim();
  return out ? out.replace(/\/+$/, '') : DEFAULT_REMOTE_BASE_URL;
}

async function getRuntimeNacefConfig(): Promise<NacefRuntimeConfig> {
  const settings = await getSettings().catch(() => ({} as any));
  const envModeRaw = (process.env as Record<string, string | undefined>)['NACEF_MODE'];
  const envBaseRaw = (process.env as Record<string, string | undefined>)['NACEF_BASE_URL'];
  const resolvedModeSource = String(envModeRaw || '').trim()
    ? envModeRaw
    : (settings as any)?.nacefMode;
  const resolvedBaseSource = String(envBaseRaw || '').trim()
    ? envBaseRaw
    : (settings as any)?.nacefBaseUrl;
  return {
    mode: normalizeNacefMode(resolvedModeSource),
    baseUrl: normalizeBaseUrl(resolvedBaseSource),
  };
}

function normalizeImdf(raw: unknown) {
  return String(raw || '').trim().toUpperCase();
}

function isValidImdfFormat(imdf: string) {
  return /^[A-Z0-9][A-Z0-9_-]{2,63}$/.test(String(imdf || '').trim().toUpperCase());
}

function invalidJsonE0803(message: string) {
  return {
    errorCode: 'SMDF_JSON_E0803',
    message,
  };
}

function isFixed3Amount(value: unknown) {
  return /^\d+\.\d{3}$/.test(String(value || '').trim());
}

function parseFixed3(value: unknown) {
  return Number(String(value || '0').trim());
}

function isValidTaxFamilyCode(value: unknown) {
  return /^[A-Z0-9_]{2,32}$/.test(String(value || '').trim().toUpperCase());
}

function isValidTaxCode(value: unknown) {
  return /^[A-Z0-9_]{2,40}$/.test(String(value || '').trim().toUpperCase());
}

function validateTicketPayload(ticket: Record<string, unknown>) {
  const operationType = String(ticket['operationType'] || '').trim().toUpperCase();
  if (operationType !== 'SALE' && operationType !== 'REFUND') {
    return {
      errorCode: 'SMDF_INVALID_TICKET_FORMAT',
      message: "operationType invalide (attendu: SALE ou REFUND).",
    };
  }
  const transactionType = String(ticket['transactionType'] || '').trim().toUpperCase();
  const allowedTransactionTypes = new Set(['NORMAL', 'FORMATION', 'REMBOURSEMENT', 'COPIE']);
  if (!allowedTransactionTypes.has(transactionType)) {
    return {
      errorCode: 'SMDF_INVALID_TICKET_FORMAT',
      message: 'transactionType invalide (NORMAL, FORMATION, REMBOURSEMENT, COPIE).',
    };
  }
  if (!isFixed3Amount(ticket['totalHt']) || !isFixed3Amount(ticket['taxTotal'])) {
    return {
      errorCode: 'SMDF_INVALID_TICKET_FORMAT',
      message: 'Format montant invalide (attendu: 0.000).',
    };
  }
  if (ticket['totalTtc'] !== undefined && !isFixed3Amount(ticket['totalTtc'])) {
    return {
      errorCode: 'SMDF_INVALID_TICKET_FORMAT',
      message: 'Format totalTtc invalide (attendu: 0.000).',
    };
  }
  if (ticket['taxRate'] !== undefined && !isFixed3Amount(ticket['taxRate'])) {
    return {
      errorCode: 'SMDF_INVALID_TICKET_FORMAT',
      message: 'Format taxRate invalide (attendu: 0.000).',
    };
  }
  if (ticket['currency'] !== undefined && String(ticket['currency']).trim().length === 0) {
    return {
      errorCode: 'SMDF_INVALID_TICKET_FORMAT',
      message: 'currency ne doit pas etre vide.',
    };
  }
  if (ticket['issuedAt'] !== undefined && !Number.isFinite(Number(ticket['issuedAt']))) {
    return {
      errorCode: 'SMDF_INVALID_TICKET_FORMAT',
      message: 'issuedAt invalide.',
    };
  }
  if (ticket['fiscalLines'] !== undefined) {
    if (!Array.isArray(ticket['fiscalLines'])) {
      return {
        errorCode: 'SMDF_INVALID_TICKET_FORMAT',
        message: 'fiscalLines doit etre un tableau.',
      };
    }
    for (const [idx, line] of (ticket['fiscalLines'] as unknown[]).entries()) {
      const row = typeof line === 'object' && line ? (line as Record<string, unknown>) : null;
      if (!row) {
        return {
          errorCode: 'SMDF_INVALID_TICKET_FORMAT',
          message: `fiscalLines[${idx}] invalide.`,
        };
      }
      if (String(row['name'] || '').trim().length === 0) {
        return {
          errorCode: 'SMDF_INVALID_TICKET_FORMAT',
          message: `fiscalLines[${idx}].name requis.`,
        };
      }
      const fixed3Fields = ['quantity', 'unitPriceHt', 'lineHt', 'lineTax', 'lineTtc', 'taxRate'];
      for (const field of fixed3Fields) {
        if (!isFixed3Amount(row[field])) {
          return {
            errorCode: 'SMDF_INVALID_TICKET_FORMAT',
            message: `fiscalLines[${idx}].${field} invalide (attendu: 0.000).`,
          };
        }
      }
      if (row['familyCode'] !== undefined && row['familyCode'] !== null) {
        if (!isValidTaxFamilyCode(row['familyCode'])) {
          return invalidJsonE0803(
            `fiscalLines[${idx}].familyCode invalide (A-Z0-9_, 2-32).`,
          );
        }
      }
      if (row['taxCode'] !== undefined && row['taxCode'] !== null) {
        if (!isValidTaxCode(row['taxCode'])) {
          return invalidJsonE0803(
            `fiscalLines[${idx}].taxCode invalide (A-Z0-9_, 2-40).`,
          );
        }
      }
    }
  }
  if (ticket['taxBreakdown'] !== undefined) {
    if (!Array.isArray(ticket['taxBreakdown'])) {
      return {
        errorCode: 'SMDF_INVALID_TICKET_FORMAT',
        message: 'taxBreakdown doit etre un tableau.',
      };
    }
    for (const [idx, rowRaw] of (ticket['taxBreakdown'] as unknown[]).entries()) {
      const row = typeof rowRaw === 'object' && rowRaw ? (rowRaw as Record<string, unknown>) : null;
      if (!row) {
        return {
          errorCode: 'SMDF_INVALID_TICKET_FORMAT',
          message: `taxBreakdown[${idx}] invalide.`,
        };
      }
      const fixed3Fields = ['taxRate', 'taxableBase', 'taxAmount'];
      for (const field of fixed3Fields) {
        if (!isFixed3Amount(row[field])) {
          return {
            errorCode: 'SMDF_INVALID_TICKET_FORMAT',
            message: `taxBreakdown[${idx}].${field} invalide (attendu: 0.000).`,
          };
        }
      }
    }
  }
  if (Array.isArray(ticket['fiscalLines']) && Array.isArray(ticket['taxBreakdown'])) {
    const fiscalLines = ticket['fiscalLines'] as Record<string, unknown>[];
    const taxBreakdown = ticket['taxBreakdown'] as Record<string, unknown>[];
    const sumLineHt = fiscalLines.reduce((sum, row) => sum + parseFixed3(row['lineHt']), 0);
    const sumLineTax = fiscalLines.reduce((sum, row) => sum + parseFixed3(row['lineTax']), 0);
    const sumBreakdownBase = taxBreakdown.reduce(
      (sum, row) => sum + parseFixed3(row['taxableBase']),
      0,
    );
    const sumBreakdownTax = taxBreakdown.reduce(
      (sum, row) => sum + parseFixed3(row['taxAmount']),
      0,
    );
    const totalHt = parseFixed3(ticket['totalHt']);
    const taxTotal = parseFixed3(ticket['taxTotal']);
    const round3 = (n: number) => Number(n.toFixed(3));
    if (round3(sumLineHt) !== round3(totalHt)) {
      return invalidJsonE0803(
        `Incoherence fiscale: somme fiscalLines.lineHt (${sumLineHt.toFixed(3)}) != totalHt (${totalHt.toFixed(3)}).`,
      );
    }
    if (round3(sumLineTax) !== round3(taxTotal)) {
      return invalidJsonE0803(
        `Incoherence fiscale: somme fiscalLines.lineTax (${sumLineTax.toFixed(3)}) != taxTotal (${taxTotal.toFixed(3)}).`,
      );
    }
    if (round3(sumBreakdownBase) !== round3(totalHt)) {
      return invalidJsonE0803(
        `Incoherence fiscale: somme taxBreakdown.taxableBase (${sumBreakdownBase.toFixed(3)}) != totalHt (${totalHt.toFixed(3)}).`,
      );
    }
    if (round3(sumBreakdownTax) !== round3(taxTotal)) {
      return invalidJsonE0803(
        `Incoherence fiscale: somme taxBreakdown.taxAmount (${sumBreakdownTax.toFixed(3)}) != taxTotal (${taxTotal.toFixed(3)}).`,
      );
    }
  }
  return null;
}

function isCertificateExpired(expiresAt?: number | null) {
  if (!expiresAt || !Number.isFinite(Number(expiresAt))) return false;
  return Number(expiresAt) <= now();
}

function toManifest(state: NacefSmdfState) {
  const blocking = resolveBlockingState(state);
  return {
    imdf: state.imdf,
    status: state.status,
    state: state.mode,
    availableOfflineTickets: Number(state.availableOfflineTickets || 0),
    certificateInfo: {
      certRequestStatus: state.certRequestStatus,
      certificateRef: state.certificateRef || null,
      certificateExpiresAt: state.certificateExpiresAt || null,
    },
    versionsInfo: {
      integrationModule: 'POS-NACEF-SMDF-SIMULATOR',
      version: '0.1.0',
    },
    lastSyncAt: state.lastSyncAt || null,
    canSign: !blocking,
    blockingErrorCode: blocking?.errorCode || null,
    blockingMessage: blocking?.message || null,
    updatedAt: state.updatedAt,
  };
}

function resolveBlockingState(state: NacefSmdfState) {
  if (state.status === 'SUSPENDED' || state.certRequestStatus === 'SUSPENDED') {
    return { errorCode: 'SMDF_IMDF_CAN_NOT_BE_USED', message: 'Le S-MDF est suspendu.' };
  }
  if (state.status === 'REVOKED' || state.certRequestStatus === 'REVOKED') {
    return { errorCode: 'SMDF_REVOKED_CERTIFICATE', message: 'Le certificat est revoque.' };
  }
  if (isCertificateExpired(state.certificateExpiresAt)) {
    return { errorCode: 'SMDF_EXPIRED_CERTIFICATE', message: 'Le certificat est expire.' };
  }
  if (state.status === 'CERT_REQUESTED' || state.certRequestStatus === 'PIN_VALIDATED') {
    return {
      errorCode: 'SMDF_CERTIFICATE_REQUEST_PENDING',
      message: 'Demande certificat en cours. Vente bloquee jusqu a generation + synchronisation.',
    };
  }
  if (state.certRequestStatus !== 'CERTIFICATE_GENERATED') {
    return { errorCode: 'SMDF_CERTFICATE_NOT_GENERATED', message: "Le certificat n'est pas genere." };
  }
  if (state.status !== 'SYNCHRONIZED') {
    return { errorCode: 'SMDF_NOT_SYNCHRONIZED', message: 'Synchronisation requise avant signature.' };
  }
  if (state.mode === 'OFFLINE' && Number(state.availableOfflineTickets || 0) <= 0) {
    return {
      errorCode: 'SMDF_OFFLINE_TICKET_QUOTA_EXHAUSTED',
      message: 'Quota tickets offline epuise. Synchronisation obligatoire.',
    };
  }
  return null;
}

async function getOrCreate(imdfRaw: unknown) {
  const imdf = normalizeImdf(imdfRaw);
  if (!imdf) throw new Error('IMDF requis');
  if (!isValidImdfFormat(imdf)) throw new Error('IMDF invalide (3-64 caracteres A-Z0-9_-).');
  let row = await repo().findOne({ where: { imdf } });
  if (!row) {
    const ts = now();
    row = repo().create({
      imdf,
      status: 'FACTORY',
      certRequestStatus: 'NOT_REQUESTED',
      mode: 'ONLINE',
      availableOfflineTickets: 0,
      createdAt: ts,
      updatedAt: ts,
    });
    row = await repo().save(row);
  }
  return row;
}

export async function getManifest(imdfRaw: unknown) {
  const runtime = await getRuntimeNacefConfig();
  if (runtime.mode === 'REMOTE') {
    return fetchManifestRemote(runtime.baseUrl);
  }
  const state = await getOrCreate(imdfRaw);
  if (isCertificateExpired(state.certificateExpiresAt)) {
    state.certRequestStatus = 'EXPIRED';
    state.status = 'NOT_SYNCHRONIZED';
    state.updatedAt = now();
    await repo().save(state);
  }
  return toManifest(state);
}

export async function requestCertificate(imdfRaw: unknown) {
  const runtime = await getRuntimeNacefConfig();
  if (runtime.mode === 'REMOTE') {
    const imdf = normalizeImdf(imdfRaw);
    return requestCertificateRemote(runtime.baseUrl, {
      cashRegisterInfo: { imdf },
    });
  }
  const state = await getOrCreate(imdfRaw);
  if (state.certRequestStatus === 'CERTIFICATE_GENERATED' && !isCertificateExpired(state.certificateExpiresAt)) {
    return { errorCode: 'SMDF_ALREADY_HAS_CERTIFICATE', message: 'Ce S-MDF a deja un certificat valide.' };
  }
  state.status = 'CERT_REQUESTED';
  state.certRequestStatus = 'PIN_VALIDATED';
  state.updatedAt = now();
  await repo().save(state);
  return {
    ok: true,
    message:
      "Demande de certificat deposee. Le contribuable doit finaliser la procedure aupres de l'unite d'enregistrement.",
    manifest: toManifest(state),
  };
}

export async function markCertificateGenerated(imdfRaw: unknown, expiresInDays = 365) {
  const state = await getOrCreate(imdfRaw);
  const ts = now();
  state.certRequestStatus = 'CERTIFICATE_GENERATED';
  state.status = 'NOT_SYNCHRONIZED';
  state.certificateRef = `CERT-${state.imdf}-${ts}`;
  state.certificateExpiresAt = ts + Math.max(1, Number(expiresInDays || 365)) * 24 * 60 * 60 * 1000;
  state.updatedAt = ts;
  await repo().save(state);
  return toManifest(state);
}

export async function simulateCertificateExpired(imdfRaw: unknown) {
  const state = await getOrCreate(imdfRaw);
  if (state.certRequestStatus !== 'CERTIFICATE_GENERATED') {
    return {
      errorCode: 'SMDF_CERTFICATE_NOT_GENERATED',
      message: "Impossible d'expirer un certificat non genere.",
    };
  }
  const ts = now();
  state.certRequestStatus = 'EXPIRED';
  state.status = 'NOT_SYNCHRONIZED';
  state.certificateExpiresAt = ts - 1000;
  state.lastErrorCode = 'SMDF_EXPIRED_CERTIFICATE';
  state.updatedAt = ts;
  await repo().save(state);
  return toManifest(state);
}

export async function synchronize(imdfRaw: unknown, modeRaw?: unknown) {
  const runtime = await getRuntimeNacefConfig();
  if (runtime.mode === 'REMOTE') {
    const mode = String(modeRaw || '').toUpperCase() === 'OFFLINE';
    return synchronizeRemote(runtime.baseUrl, {
      requestPINupdate: false,
      updateSMDFURL: mode,
    });
  }
  const state = await getOrCreate(imdfRaw);
  if (state.certRequestStatus !== 'CERTIFICATE_GENERATED' || isCertificateExpired(state.certificateExpiresAt)) {
    return {
      errorCode: 'SMDF_CERTFICATE_NOT_GENERATED',
      message: "Le certificat associe a ce S-MDF n'est pas encore genere ou a expire.",
    };
  }
  if (state.status === 'REVOKED') {
    return { errorCode: 'SMDF_REVOKED_CERTIFICATE', message: 'Le certificat associe a ce S-MDF est revoque.' };
  }
  if (state.status === 'SUSPENDED') {
    return { errorCode: 'SMDF_IMDF_CAN_NOT_BE_USED', message: "Le S-MDF est suspendu." };
  }

  const mode = String(modeRaw || '').toUpperCase() === 'OFFLINE' ? 'OFFLINE' : 'ONLINE';
  state.mode = mode as SmdfCommMode;
  state.status = 'SYNCHRONIZED';
  state.availableOfflineTickets = mode === 'OFFLINE' ? DEFAULT_OFFLINE_TICKETS : 0;
  state.lastSyncAt = now();
  state.lastErrorCode = null;
  state.updatedAt = now();
  await repo().save(state);
  return {
    ok: true,
    ticket0: {
      reference: `T0-${state.imdf}-${state.lastSyncAt}`,
      note: 'Ticket 0 simule (phase 1).',
    },
    manifest: toManifest(state),
  };
}

export async function signTicket(imdfRaw: unknown, ticketRaw: unknown) {
  const runtime = await getRuntimeNacefConfig();
  if (runtime.mode === 'REMOTE') {
    const ticket = ticketRaw as Record<string, unknown>;
    const payload = {
      base64Ticket: Buffer.from(JSON.stringify(ticketRaw || {}), 'utf8').toString('base64'),
      totalHT: Number(String(ticket?.['totalHt'] || '0').replace(',', '.')) || 0,
      totalTax: Number(String(ticket?.['taxTotal'] || '0').replace(',', '.')) || 0,
      operationType: String(ticket?.['operationType'] || 'SALE'),
      transactionType: String(ticket?.['transactionType'] || 'NORMAL'),
    };
    return signTicketRemote(runtime.baseUrl, payload);
  }
  const state = await getOrCreate(imdfRaw);
  if (isCertificateExpired(state.certificateExpiresAt)) {
    state.certRequestStatus = 'EXPIRED';
    state.status = 'NOT_SYNCHRONIZED';
    state.updatedAt = now();
    await repo().save(state);
  }

  const blocking = resolveBlockingState(state);
  if (blocking) {
    state.lastErrorCode = blocking.errorCode;
    state.updatedAt = now();
    await repo().save(state);
    return blocking;
  }

  if (!ticketRaw || typeof ticketRaw !== 'object' || Array.isArray(ticketRaw)) {
    state.lastErrorCode = 'SMDF_JSON_E0803';
    state.updatedAt = now();
    await repo().save(state);
    return invalidJsonE0803('JSON ticket invalide (E0803): objet ticket attendu.');
  }
  const ticket = ticketRaw as Record<string, unknown>;
  const ticketValidation = validateTicketPayload(ticket);
  if (ticketValidation) {
    state.lastErrorCode = ticketValidation.errorCode;
    state.updatedAt = now();
    await repo().save(state);
    return ticketValidation;
  }
  const ticketId = String(ticket['id'] || '').trim() || `TK-${Date.now()}`;
  const signatureSeed = JSON.stringify({
    imdf: state.imdf,
    ticketId,
    at: now(),
  });
  const signature = Buffer.from(signatureSeed, 'utf8').toString('base64');
  const qrMode = state.mode === 'OFFLINE' ? 'OFFLINE' : 'ONLINE';

  if (qrMode === 'OFFLINE') {
    state.availableOfflineTickets = Math.max(0, Number(state.availableOfflineTickets || 0) - 1);
    if (state.availableOfflineTickets <= 0) {
      state.status = 'NOT_SYNCHRONIZED';
      state.lastErrorCode = 'SMDF_OFFLINE_TICKET_QUOTA_EXHAUSTED';
    }
  }
  state.updatedAt = now();
  await repo().save(state);

  return {
    ok: true,
    signedTicket: {
      ticketId,
      signature,
      signatureFormat: 'CAdES-DETACHED-SIMULATED',
      qrCodePayload:
        qrMode === 'ONLINE'
          ? `ONLINE\n${ticketId}`
          : `OFFLINE\n${state.imdf}\n${ticketId}\n${String(ticket['operationType'] || 'SALE')}\n${String(
              ticket['transactionType'] || 'NORMAL',
            )}\n${String(ticket['totalHt'] || '0.000')}\n${String(ticket['taxTotal'] || '0.000')}\n${signature}`,
      mode: qrMode,
    },
    manifest: toManifest(state),
  };
}

export async function setSmdfStatus(imdfRaw: unknown, statusRaw: unknown) {
  const state = await getOrCreate(imdfRaw);
  const status = String(statusRaw || '').toUpperCase();
  if (status === 'SUSPENDED') {
    state.status = 'SUSPENDED';
    state.certRequestStatus = 'SUSPENDED';
  } else if (status === 'REVOKED') {
    state.status = 'REVOKED';
    state.certRequestStatus = 'REVOKED';
  } else if (status === 'ACTIVE') {
    if (state.certRequestStatus === 'REVOKED' || state.status === 'REVOKED') {
      return {
        errorCode: 'SMDF_REVOKED_CERTIFICATE',
        message: 'Certificat revoque: regeneration obligatoire avant reactivation.',
      };
    }
    const hasUsableCertificate =
      Boolean(String(state.certificateRef || '').trim()) &&
      !isCertificateExpired(state.certificateExpiresAt);
    if (isCertificateExpired(state.certificateExpiresAt)) {
      state.certRequestStatus = 'EXPIRED';
      state.status = 'NOT_SYNCHRONIZED';
    } else if (state.certRequestStatus === 'CERTIFICATE_GENERATED' || hasUsableCertificate) {
      state.certRequestStatus = 'CERTIFICATE_GENERATED';
      state.status = 'NOT_SYNCHRONIZED';
    } else {
      state.certRequestStatus = 'NOT_REQUESTED';
      state.status = 'FACTORY';
    }
  } else {
    throw new Error('Statut non supporte. Utiliser SUSPENDED, REVOKED ou ACTIVE.');
  }
  state.updatedAt = now();
  await repo().save(state);
  return toManifest(state);
}

export async function pushLog(imdfRaw: unknown, payloadRaw: unknown) {
  const runtime = await getRuntimeNacefConfig();
  if (runtime.mode === 'REMOTE') {
    return pushLogRemote(runtime.baseUrl, payloadRaw || {});
  }
  const state = await getOrCreate(imdfRaw);
  state.updatedAt = now();
  await repo().save(state);
  return {
    ok: true,
    message: 'Log NACEF simulé enregistré.',
    manifest: toManifest(state),
  };
}

