import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PosService } from './pos.service';
import { MdfAdapter } from './mdf.adapter';
import { SyncService } from './sync.service';
import { FiscalCheckoutPayload, FiscalTransaction } from './fiscal.types';
import { OrderType } from '../types';
import { FiscalTransactionEntity } from './entities/fiscal-transaction.entity';

@Injectable()
export class FiscalService {
  constructor(
    @InjectRepository(FiscalTransactionEntity)
    private readonly fiscalTransactionRepository: Repository<FiscalTransactionEntity>,
    private readonly posService: PosService,
    private readonly mdfAdapter: MdfAdapter,
    private readonly syncService: SyncService,
  ) {}

  async checkout(payload: FiscalCheckoutPayload) {
    if (!payload.items?.length) {
      throw new BadRequestException('At least one item is required for fiscal checkout');
    }
    if (!payload.terminalId) {
      throw new BadRequestException('terminalId is required');
    }

    const order = this.posService.createOrder({
      type: OrderType.TAKE_OUT,
      items: payload.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        price: item.unitPrice,
        quantity: item.quantity,
      })),
      total: payload.total,
      discount: payload.discount || 0,
      timbre: payload.timbre ?? 1.0,
      serverName: payload.cashierName || 'Fiscal checkout',
    } as any);

    const signed = await this.mdfAdapter.signTicket({
      ...payload,
      orderId: order.id,
      discount: payload.discount || 0,
      timbre: payload.timbre ?? 1.0,
    });

    const transaction = this.fiscalTransactionRepository.create({
      ticketId: signed.ticketId,
      orderId: order.id,
      status: 'SIGNED',
      payload: signed,
      attempts: 0,
      lastError: null,
      syncedAt: null,
    });
    await this.fiscalTransactionRepository.save(transaction);
    this.posService.markOrderAsFiscalSigned(order.id);

    await this.trySync(transaction.ticketId);
    return this.getTransaction(transaction.ticketId);
  }

  async getTransactions() {
    const rows = await this.fiscalTransactionRepository.find({
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toFiscalTransaction(row));
  }

  async getTransaction(ticketId: string) {
    const tx = await this.fiscalTransactionRepository.findOne({
      where: { ticketId },
    });
    if (!tx) throw new NotFoundException('Fiscal transaction not found');
    return this.toFiscalTransaction(tx);
  }

  async getTransactionByOrderId(orderId: string) {
    const tx = await this.fiscalTransactionRepository.findOne({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
    if (!tx) throw new NotFoundException('No fiscal transaction found for this order');
    return this.toFiscalTransaction(tx);
  }

  async retrySync(ticketId: string) {
    await this.trySync(ticketId);
    return this.getTransaction(ticketId);
  }

  async getManifest() {
    return this.mdfAdapter.getManifest();
  }

  private async trySync(ticketId: string) {
    const tx = await this.fiscalTransactionRepository.findOne({
      where: { ticketId },
    });
    if (!tx) throw new NotFoundException('Fiscal transaction not found');
    if (tx.status === 'ACK') return tx;
    if (tx.status === 'REJECTED') return tx;

    tx.status = 'PENDING_SYNC';
    tx.attempts += 1;
    tx.updatedAt = new Date().toISOString();

    await this.fiscalTransactionRepository.save(tx);
    const result = await this.syncService.sendToNacef(this.toFiscalTransaction(tx));
    if (!result.ack) {
      tx.status = 'REJECTED';
      tx.lastError = result.reason || 'NACEF rejected transaction';
      this.posService.markOrderAsFiscalRejected(tx.orderId, tx.lastError);
      await this.fiscalTransactionRepository.save(tx);
      return tx;
    }

    tx.status = 'ACK';
    tx.syncedAt = new Date();
    tx.lastError = null;
    this.posService.markOrderAsFiscalAcked(tx.orderId);
    await this.fiscalTransactionRepository.save(tx);
    return tx;
  }

  private toFiscalTransaction(entity: FiscalTransactionEntity): FiscalTransaction {
    return {
      ticketId: entity.ticketId,
      orderId: entity.orderId,
      status: entity.status,
      payload: entity.payload,
      attempts: entity.attempts,
      lastError: entity.lastError || undefined,
      syncedAt: entity.syncedAt?.toISOString(),
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
