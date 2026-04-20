
import { Controller, Get, Post, Body, Patch, Param, Delete, UnauthorizedException } from '@nestjs/common';
import { PosService } from './pos.service';
import { OrderStatus } from '../types';

@Controller('pos')
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Get('products')
  getProducts() { return this.posService.getProducts(); }

  @Post('products')
  addProduct(@Body() product: any) { return this.posService.addProduct(product); }

  @Get('categories')
  getCategories() { return this.posService.getCategories(); }

  @Get('zones')
  getZones() { return this.posService.getZones(); }

  @Get('tables')
  getTables() { return this.posService.getTables(); }

  @Get('users')
  getUsers() { return this.posService.getUsers(); }

  @Post('auth/login')
  async login(@Body('pin') pin: string) { 
    return this.posService.validateUser(pin); 
  }

  @Get('orders')
  getOrders() { return this.posService.getOrders(); }

  @Post('orders')
  createOrder(@Body() orderData: any) { return this.posService.createOrder(orderData); }

  @Patch('orders/:id')
  updateOrder(@Param('id') id: string, @Body() updateData: any) {
    return this.posService.updateOrder(id, updateData);
  }

  @Patch('orders/:id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: OrderStatus) {
    return this.posService.updateOrder(id, { status });
  }

  @Get('session')
  getSession() { return this.posService.getSession(); }

  @Post('session/open')
  openSession(@Body('initialFund') fund: number) { return this.posService.openSession(fund); }

  @Post('session/close')
  closeSession(@Body('closingBalance') balance: number) { return this.posService.closeSession(balance); }
}
