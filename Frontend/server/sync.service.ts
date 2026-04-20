import { Injectable } from '@nestjs/common';
import { FiscalTransaction } from './fiscal.types';

@Injectable()
export class SyncService {
  async sendToNacef(transaction: FiscalTransaction): Promise<{ ack: boolean; reason?: string }> {
    const sicSyncEndpoint = process.env.SIC_SYNC_URL || 'http://localhost:10006/sic/external/sync/request/';
    if (process.env.SIC_SYNC_DISABLED !== '1') {
      try {
        const response = await fetch(sicSyncEndpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ requestPINupdate: false }),
        });
        if (!response.ok) {
          return { ack: false, reason: `SIC sync HTTP ${response.status}` };
        }
        return { ack: true };
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Network error';
        return { ack: false, reason: `SIC unreachable: ${reason}` };
      }
    }

    const endpoint = process.env.NACEF_SYNC_URL;
    if (endpoint) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(process.env.NACEF_BEARER_TOKEN
              ? { authorization: `Bearer ${process.env.NACEF_BEARER_TOKEN}` }
              : {}),
          },
          body: JSON.stringify({
            ticketId: transaction.ticketId,
            orderId: transaction.orderId,
            payload: transaction.payload,
          }),
        });

        if (!response.ok) {
          return { ack: false, reason: `NACEF HTTP ${response.status}` };
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Network error';
        return { ack: false, reason: `NACEF unreachable: ${reason}` };
      }
      return { ack: true };
    }

    if (process.env.NACEF_FORCE_REJECT === '1') {
      return { ack: false, reason: 'NACEF rejected payload (forced by env)' };
    }

    if (transaction.payload.total < 0) {
      return { ack: false, reason: 'Negative total is not accepted by NACEF' };
    }

    return { ack: true };
  }
}
