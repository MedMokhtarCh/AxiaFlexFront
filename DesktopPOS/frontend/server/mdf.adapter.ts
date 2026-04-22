import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { FiscalCheckoutPayload, SignedFiscalPayload } from './fiscal.types';

@Injectable()
export class MdfAdapter {
  private readonly baseUrl = process.env.SIC_BASE_URL || 'http://localhost:10006/sic/external';

  async getManifest() {
    const response = await fetch(`${this.baseUrl}/manifest`);
    if (!response.ok) {
      throw new ServiceUnavailableException(`SIC manifest failed with HTTP ${response.status}`);
    }
    return response.json();
  }

  async signTicket(payload: FiscalCheckoutPayload): Promise<SignedFiscalPayload> {
    const ticketId = payload.orderId || `TCK-${randomUUID()}`;
    const signedAt = new Date().toISOString();
    const ticketJson = this.toFiscalTicketJson({
      ...payload,
      ticketId,
      signedAt,
    });
    const base64Ticket = Buffer.from(ticketJson, 'utf8').toString('base64');

    const signBody = {
      base64Ticket,
      totalHT: Number((payload.total - (payload.timbre ?? 1)).toFixed(3)),
      totalTax: Number(payload.total.toFixed(3)),
      operationType: process.env.SIC_OPERATION_TYPE || 'Vente',
      transactionType: process.env.SIC_TRANSACTION_TYPE || 'Original',
    };

    let sicResponse: any = null;
    try {
      const response = await fetch(`${this.baseUrl}/sign/request/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(signBody),
      });
      if (!response.ok) {
        throw new ServiceUnavailableException(`SIC sign failed with HTTP ${response.status}`);
      }
      sicResponse = await response.json();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'SIC unreachable';
      throw new ServiceUnavailableException(`SIC sign unavailable: ${reason}`);
    }

    const hash =
      sicResponse?.signatureHash ||
      sicResponse?.hash ||
      createHash('sha256').update(ticketJson).digest('hex');
    const signature = createHash('sha256')
      .update(`${hash}:${process.env.MDF_SIGNING_SECRET || 'demo-local-secret'}`)
      .digest('base64');

    const qrPayload = [
      `ticketId=${ticketId}`,
      `total=${payload.total.toFixed(3)}`,
      `signedAt=${signedAt}`,
      `hash=${hash.slice(0, 32)}`,
    ].join('|');

    return {
      ...payload,
      ticketId,
      signedAt,
      hash,
      signature: sicResponse?.signature || signature,
      qrPayload,
      sicReference: sicResponse?.reference || sicResponse?.id,
    };
  }

  private toFiscalTicketJson(input: Record<string, unknown>): string {
    const sorted = Object.keys(input)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = input[key];
        return acc;
      }, {});

    return JSON.stringify(sorted);
  }
}
