import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { FiscalService } from './fiscal.service';
import { FiscalCheckoutPayload } from './fiscal.types';

@Controller('fiscal')
export class FiscalController {
  constructor(private readonly fiscalService: FiscalService) {}

  @Post('checkout')
  checkout(@Body() payload: FiscalCheckoutPayload) {
    return this.fiscalService.checkout(payload);
  }

  @Get('manifest')
  getManifest() {
    return this.fiscalService.getManifest();
  }

  @Get('transactions')
  getTransactions() {
    return this.fiscalService.getTransactions();
  }

  @Get('transactions/:ticketId')
  getTransaction(@Param('ticketId') ticketId: string) {
    return this.fiscalService.getTransaction(ticketId);
  }

  @Post('transactions/:ticketId/retry-sync')
  retrySync(@Param('ticketId') ticketId: string) {
    return this.fiscalService.retrySync(ticketId);
  }
}
