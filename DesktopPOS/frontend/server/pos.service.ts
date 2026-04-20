
import { Injectable, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { Product, Order, User, PosSession, OrderStatus, OrderType, Category, Zone, TableConfig, Role } from '../types';

@Injectable()
export class PosService {
  private products: Product[] = [
    { id: '1', name: 'Pizza Margherita', price: 12.50, category: 'cat-1', imageUrl: 'https://picsum.photos/seed/pizza/200', isPack: false, manageStock: true, stock: 50, printerIds: ['p1'] },
    { id: '2', name: 'Salade César', price: 8.90, category: 'cat-1', imageUrl: 'https://picsum.photos/seed/salad/200', isPack: false, manageStock: true, stock: 30, printerIds: ['p1'] },
  ];
  
  private orders: Order[] = [];
  private session: PosSession | null = null;
  
  private categories: Category[] = [{ id: 'cat-1', name: 'Cuisine Italienne' }];
  private zones: Zone[] = [{ id: 'z1', name: 'Terrasse' }, { id: 'z2', name: 'Salle VIP' }];
  private tables: TableConfig[] = [
    { id: 't1', number: '10', zoneId: 'z1', capacity: 2 },
    { id: 't2', number: '20', zoneId: 'z2', capacity: 4 }
  ];

  private users: User[] = [
    { id: 'u1', name: 'Admin AxiaFlex', role: Role.ADMIN, pin: '1234', assignedZoneIds: [] },
    { id: 'u2', name: 'Serveur 1', role: Role.SERVER, pin: '0000', assignedZoneIds: ['z1', 'z2'] },
  ];

  // --- Auth ---
  validateUser(pin: string) {
    const user = this.users.find(u => u.pin === pin);
    if (!user) throw new UnauthorizedException('PIN incorrect');
    return user;
  }

  // --- Products & Categories ---
  getProducts() { return this.products; }
  getCategories() { return this.categories; }
  
  addProduct(data: any) {
    const product = { ...data, id: `art-${Date.now()}` };
    this.products.push(product);
    return product;
  }

  // --- Orders Logic ---
  getOrders() { return this.orders; }

  createOrder(orderData: Partial<Order>) {
    if (!orderData.type) throw new BadRequestException('Type de commande requis');
    
    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      items: orderData.items || [],
      status: OrderStatus.PENDING,
      createdAt: Date.now(),
      total: orderData.total || 0,
      discount: orderData.discount || 0,
      timbre: 1.0,
      type: orderData.type,
      tableNumber: orderData.tableNumber,
      clientId: orderData.clientId,
      serverName: orderData.serverName || 'Système',
      sessionDay: new Date().toISOString().split('T')[0],
    };

    // Gestion de stock simple
    newOrder.items.forEach(item => {
      const prod = this.products.find(p => p.id === item.productId);
      if (prod && prod.manageStock && prod.stock !== undefined) {
        prod.stock -= item.quantity;
      }
    });

    this.orders.push(newOrder);
    return newOrder;
  }

  updateOrder(id: string, updateData: any) {
    const index = this.orders.findIndex(o => o.id === id);
    if (index === -1) throw new NotFoundException('Commande introuvable');
    
    const currentOrder = this.orders[index];
    this.orders[index] = { ...currentOrder, ...updateData };

    // Si paiement, mise à jour de la session
    if (updateData.paymentMethod && this.session && this.session.isOpen) {
      this.session.totalSales += updateData.total;
      if (updateData.paymentMethod === 'CASH') this.session.cashSales += updateData.total;
      else this.session.cardSales += updateData.total;
      this.orders[index].status = OrderStatus.COMPLETED;
    }

    return this.orders[index];
  }

  // --- Session Management ---
  getSession() { return this.session || { isOpen: false }; }

  openSession(fund: number) {
    if (this.session?.isOpen) throw new BadRequestException('Une session est déjà ouverte');
    this.session = {
      id: `sess-${Date.now()}`,
      isOpen: true,
      openedAt: Date.now(),
      openingBalance: fund,
      cashSales: 0,
      cardSales: 0,
      totalSales: 0
    };
    return this.session;
  }

  closeSession(balance: number) {
    if (!this.session) throw new BadRequestException('Aucune session à fermer');
    this.session.isOpen = false;
    this.session.closedAt = Date.now();
    this.session.closingBalance = balance;
    const closed = { ...this.session };
    this.session = null;
    return closed;
  }

  // --- Tables & Zones ---
  getZones() { return this.zones; }
  getTables() { return this.tables; }
  getUsers() { return this.users; }
}
