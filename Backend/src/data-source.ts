import 'reflect-metadata';
import { DataSource } from 'typeorm';
import dotenv from 'dotenv';
import { Product } from './entity/Product.js';
import { Order } from './entity/Order.js';
import { OrderItem } from './entity/OrderItem.js';
import { Payment } from './entity/Payment.js';
import { PaymentItem } from './entity/PaymentItem.js';
import { Session } from './entity/Session.js';
import { Category } from './entity/Category.js';
import { Zone } from './entity/Zone.js';
import { Table } from './entity/Table.js';
import { Printer } from './entity/Printer.js';
import { User } from './entity/User.js';
import { Promotion } from './entity/Promotion.js';
import { RestaurantSettings } from './entity/RestaurantSettings.js';
import { StockMovement } from './entity/StockMovement.js';
import { TableReservation } from './entity/TableReservation.js';
import { Shift } from './entity/Shift.js';
import { Fund } from './entity/Fund.js';
import { FundSession } from './entity/FundSession.js';
import { FundMovement } from './entity/FundMovement.js';
import { ProductRecipeRevision } from './entity/ProductRecipeRevision.js';
import { Warehouse } from './entity/Warehouse.js';
import { StockTransfer } from './entity/StockTransfer.js';
import { StockAdjustment } from './entity/StockAdjustment.js';
import { StockLot } from './entity/StockLot.js';
import { StockDocument } from './entity/StockDocument.js';
import { StockDocumentLine } from './entity/StockDocumentLine.js';
import { Client } from './entity/Client.js';
import { Invoice } from './entity/Invoice.js';
import { Supplier } from './entity/Supplier.js';
import { Ticket } from './entity/Ticket.js';
import { TicketItem } from './entity/TicketItem.js';
import { RestaurantVoucher } from './entity/RestaurantVoucher.js';
import { RestaurantCard } from './entity/RestaurantCard.js';
import { RestaurantCardMovement } from './entity/RestaurantCardMovement.js';
import { SaasTenantLicense } from './entity/SaasTenantLicense.js';
import { AuditLogEntry } from './entity/AuditLogEntry.js';
import { PdfArchiveEntry } from './entity/PdfArchiveEntry.js';

// Fix for TypeScript: declare DATABASE_URL in process.env
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DATABASE_URL?: string;
    }
  }
}

dotenv.config();

// Allow configuration either via individual DB_* vars or a single DATABASE_URL.
// DATABASE_URL takes precedence when present.
const databaseUrl = process.env.DATABASE_URL;

let dbHost = process.env.DB_HOST || 'localhost';
let dbPort = parseInt(process.env.DB_PORT || '5432', 10);
let dbUser = process.env.DB_USER || 'postgres';
let dbPassword = process.env.DB_PASSWORD || 'postgres';
let dbName = process.env.DB_NAME || 'posdb';

if (databaseUrl) {
  try {
    const url = new URL(databaseUrl);

    if (url.hostname) dbHost = url.hostname;
    if (url.port) dbPort = parseInt(url.port, 10);
    if (url.username) dbUser = decodeURIComponent(url.username);
    if (url.password) dbPassword = decodeURIComponent(url.password);
    if (url.pathname && url.pathname !== '/') {
      // Example: '/POSAXIA?schema=public' -> 'POSAXIA'
      dbName = url.pathname.slice(1).split('/')[0];
    }
  } catch {
    console.warn('Invalid DATABASE_URL, falling back to DB_* variables');
  }
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: dbHost,
  port: dbPort,
  username: dbUser,
  password: dbPassword,
  database: dbName,
  synchronize: true,
  logging: false,
  entities: [
    Product,
    Order,
    OrderItem,
    Payment,
    PaymentItem,
    Ticket,
    TicketItem,
    Session,
    Category,
    Zone,
    Table,
    Printer,
    User,
    Promotion,
    RestaurantSettings,
    StockMovement,
    TableReservation,
    Shift,
    Fund,
    FundSession,
    FundMovement,
    ProductRecipeRevision,
    Warehouse,
    StockTransfer,
    StockAdjustment,
    StockLot,
    StockDocument,
    StockDocumentLine,
    Client,
    Invoice,
    Supplier,
    RestaurantVoucher,
    RestaurantCard,
    RestaurantCardMovement,
    SaasTenantLicense,
    AuditLogEntry,
    PdfArchiveEntry,
  ],
});
