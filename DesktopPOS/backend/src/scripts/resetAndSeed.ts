import { randomUUID } from 'crypto';
import { AppDataSource } from '../data-source.js';
import { Category } from '../entity/Category.js';
import { Fund } from '../entity/Fund.js';
import { FundSession } from '../entity/FundSession.js';
import { Order } from '../entity/Order.js';
import { Printer } from '../entity/Printer.js';
import { Product } from '../entity/Product.js';
import { ProductRecipeRevision } from '../entity/ProductRecipeRevision.js';
import { RestaurantSettings } from '../entity/RestaurantSettings.js';
import { Session } from '../entity/Session.js';
import { Shift } from '../entity/Shift.js';
import { StockAdjustment } from '../entity/StockAdjustment.js';
import { StockLot } from '../entity/StockLot.js';
import { StockMovement } from '../entity/StockMovement.js';
import { StockTransfer } from '../entity/StockTransfer.js';
import { Table } from '../entity/Table.js';
import { User } from '../entity/User.js';
import { Warehouse } from '../entity/Warehouse.js';
import { Zone } from '../entity/Zone.js';
import { Ticket } from '../entity/Ticket.js';
import { TicketItem } from '../entity/TicketItem.js';
import { OrderItem } from '../entity/OrderItem.js';
import { generateNextPrefixedCode } from '../services/prefixService.js';

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

const quoteIdentifier = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;

async function resetDatabase() {
  const rows = await AppDataSource.query<{ tablename: string }[]>(
    `
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
    `,
  );

  const tableNames = rows.map((row) => row.tablename).filter(Boolean);
  if (tableNames.length === 0) {
    return;
  }

  const sql = `TRUNCATE TABLE ${tableNames.map((name) => `public.${quoteIdentifier(name)}`).join(', ')} RESTART IDENTITY CASCADE`;
  await AppDataSource.query(sql);
}

async function seedDatabase() {
  const manager = AppDataSource.manager;

  const ids = {
    admin: randomUUID(),
    manager: randomUUID(),
    cashier: randomUUID(),
    server: randomUUID(),
    stockManager: randomUUID(),
    chef: randomUUID(),
    bartender: randomUUID(),
    zoneMain: randomUUID(),
    zoneTerrace: randomUUID(),
    table1: randomUUID(),
    table2: randomUUID(),
    table3: randomUUID(),
    table4: randomUUID(),
    table5: randomUUID(),
    table6: randomUUID(),
    catPizzas: randomUUID(),
    catDrinks: randomUUID(),
    catIngredients: randomUUID(),
    catPackaging: randomUUID(),
    printerKitchen: randomUUID(),
    printerBar: randomUUID(),
    printerReceipt: randomUUID(),
    warehouseMain: randomUUID(),
    warehouseBar: randomUUID(),
    warehouseCold: randomUUID(),
    pFlour: randomUUID(),
    pSauce: randomUUID(),
    pMozzarella: randomUUID(),
    pCoffeeBeans: randomUUID(),
    pMilk: randomUUID(),
    pSugar: randomUUID(),
    pSyrup: randomUUID(),
    pCup: randomUUID(),
    pPizza: randomUUID(),
    pLatte: randomUUID(),
    pCola: randomUUID(),
    pWater: randomUUID(),
    pComboLunch: randomUUID(),
    fundMain: randomUUID(),
    shiftOpen: randomUUID(),
    fundSessionOpen: randomUUID(),
    sessionOpen: randomUUID(),
    transferApproved: randomUUID(),
    adjustmentPending: randomUUID(),
    adjustmentApproved: randomUUID(),
    order1: randomUUID(),
    order2: randomUUID(),
    order3: randomUUID(),
    order4: randomUUID(),
    order5: randomUUID(),
    orderPartial: randomUUID(),
  };

  await manager.insert(User, [
    { id: ids.admin, name: 'Admin Test', role: 'ADMIN', pin: '1111', canManageFund: true },
    { id: ids.manager, name: 'Manager Test', role: 'MANAGER', pin: '2222', canManageFund: true },
    { id: ids.cashier, name: 'Cashier Test', role: 'CASHIER', pin: '3333', canManageFund: true },
    {
      id: ids.server,
      name: 'Server Test',
      role: 'SERVER',
      pin: '4444',
      assignedZoneIds: [ids.zoneMain, ids.zoneTerrace],
      canManageFund: false,
    },
    { id: ids.stockManager, name: 'Stock Test', role: 'STOCK_MANAGER', pin: '5555', canManageFund: false },
    { id: ids.chef, name: 'Chef Test', role: 'CHEF', pin: '6666', canManageFund: false },
    { id: ids.bartender, name: 'Bartender Test', role: 'BARTENDER', pin: '7777', canManageFund: false },
  ]);

  await manager.insert(RestaurantSettings, [
    {
      companyType: 'FAST_FOOD',
      restaurantName: 'AxiaFlex Demo',
      phone: '+216 20 000 000',
      email: 'demo@axiaflex.local',
      address: 'Tunis, Tunisia',
      timbreValue: 1,
      tvaRate: 19,
      applyTvaToTicket: true,
      applyTvaToInvoice: true,
      applyTimbreToTicket: true,
      applyTimbreToInvoice: true,
      printPreviewOnValidate: false,
      printAutoOnPreview: true,
      receiptPdfDirectory: '',
      autoDownloadReceiptPdfOnClient: false,
      preventSaleOnInsufficientStock: true,
      currency: 'TND',
      terminalId: 'T1',
      ticketPrefix: 'TK-',
      ticketSequence: 0,
      invoicePrefix: 'INV-',
      invoiceSequence: 0,
      clientPrefix: 'CLI-',
      clientSequence: 0,
      stockDocumentPrefix: 'SD-',
      stockDocumentSequence: 0,
      productPrefix: 'ART-',
      productSequence: 0,
      paymentEnabledMethods: ['CASH', 'BANK_CARD', 'RESTAURANT_CARD', 'RESTAURANT_TICKET'],
    },
  ]);

  await manager.insert(Zone, [
    { id: ids.zoneMain, name: 'Main Hall' },
    { id: ids.zoneTerrace, name: 'Terrace' },
  ]);

  await manager.insert(Table, [
    { id: ids.table1, number: 'T01', zoneId: ids.zoneMain, capacity: 4, status: 'AVAILABLE' },
    { id: ids.table2, number: 'T02', zoneId: ids.zoneMain, capacity: 4, status: 'AVAILABLE' },
    { id: ids.table3, number: 'T03', zoneId: ids.zoneMain, capacity: 6, status: 'AVAILABLE' },
    { id: ids.table4, number: 'T04', zoneId: ids.zoneTerrace, capacity: 2, status: 'AVAILABLE' },
    { id: ids.table5, number: 'T05', zoneId: ids.zoneTerrace, capacity: 4, status: 'AVAILABLE' },
    { id: ids.table6, number: 'T06', zoneId: ids.zoneTerrace, capacity: 8, status: 'AVAILABLE' },
  ]);

  await manager.insert(Category, [
    { id: ids.catPizzas, name: 'Pizzas', parentId: null },
    { id: ids.catDrinks, name: 'Drinks', parentId: null },
    { id: ids.catIngredients, name: 'Ingredients', parentId: null },
    { id: ids.catPackaging, name: 'Packaging', parentId: null },
  ]);

  await manager.insert(Printer, [
    {
      id: ids.printerKitchen,
      name: 'Kitchen Printer',
      type: 'KITCHEN',
      bonProfile: 'kitchen',
    },
    {
      id: ids.printerBar,
      name: 'Bar Printer',
      type: 'BAR',
      bonProfile: 'bar',
    },
    {
      id: ids.printerReceipt,
      name: 'Receipt Printer',
      type: 'RECEIPT',
      bonProfile: null,
    },
  ]);

  await manager.insert(Warehouse, [
    { id: ids.warehouseMain, code: 'WH-MAIN', name: 'Main Warehouse', branchId: 'BR-MAIN', isActive: true, createdAt: now - 60 * day },
    { id: ids.warehouseBar, code: 'WH-BAR', name: 'Bar Warehouse', branchId: 'BR-MAIN', isActive: true, createdAt: now - 60 * day },
    { id: ids.warehouseCold, code: 'WH-COLD', name: 'Cold Room', branchId: 'BR-MAIN', isActive: true, createdAt: now - 60 * day },
  ]);

  await manager.insert(Product, [
    {
      id: ids.pFlour,
      name: 'Flour',
      price: 2.2,
      category: 'Ingredients',
      isPack: false,
      subItemIds: [],
      printerIds: [],
      manageStock: true,
      visibleInPos: false,
      stock: 24,
      unit: 'kg',
      productType: 'RAW',
      baseUnit: 'kg',
      recipeVersion: 0,
      alertLevel: 5,
    },
    {
      id: ids.pSauce,
      name: 'Tomato Sauce',
      price: 3.4,
      category: 'Ingredients',
      isPack: false,
      subItemIds: [],
      printerIds: [],
      manageStock: true,
      visibleInPos: false,
      stock: 19.52,
      unit: 'l',
      productType: 'RAW',
      baseUnit: 'l',
      recipeVersion: 0,
      alertLevel: 4,
    },
    {
      id: ids.pMozzarella,
      name: 'Mozzarella',
      price: 18,
      category: 'Ingredients',
      isPack: false,
      subItemIds: [],
      printerIds: [],
      manageStock: true,
      visibleInPos: false,
      stock: 17.28,
      unit: 'kg',
      productType: 'RAW',
      baseUnit: 'kg',
      recipeVersion: 0,
      alertLevel: 3,
    },
    {
      id: ids.pCoffeeBeans,
      name: 'Coffee Beans',
      price: 26,
      category: 'Ingredients',
      isPack: false,
      subItemIds: [],
      printerIds: [],
      manageStock: true,
      visibleInPos: false,
      stock: 9.928,
      unit: 'kg',
      productType: 'RAW',
      baseUnit: 'kg',
      recipeVersion: 0,
      alertLevel: 2,
    },
    {
      id: ids.pMilk,
      name: 'Milk',
      price: 1.8,
      category: 'Ingredients',
      isPack: false,
      subItemIds: [],
      printerIds: [],
      manageStock: true,
      visibleInPos: false,
      stock: 29,
      unit: 'l',
      productType: 'RAW',
      baseUnit: 'l',
      recipeVersion: 0,
      alertLevel: 5,
    },
    {
      id: ids.pSugar,
      name: 'Sugar',
      price: 1.6,
      category: 'Ingredients',
      isPack: false,
      subItemIds: [],
      printerIds: [],
      manageStock: true,
      visibleInPos: false,
      stock: 14.96,
      unit: 'kg',
      productType: 'RAW',
      baseUnit: 'kg',
      recipeVersion: 0,
      alertLevel: 4,
    },
    {
      id: ids.pSyrup,
      name: 'Cola Syrup',
      price: 12,
      category: 'Ingredients',
      isPack: false,
      subItemIds: [],
      printerIds: [],
      manageStock: true,
      visibleInPos: false,
      stock: 7.88,
      unit: 'l',
      productType: 'RAW',
      baseUnit: 'l',
      recipeVersion: 0,
      alertLevel: 2,
    },
    {
      id: ids.pCup,
      name: 'Paper Cup',
      price: 0.15,
      category: 'Packaging',
      isPack: false,
      subItemIds: [],
      printerIds: [],
      manageStock: true,
      visibleInPos: false,
      stock: 496,
      unit: 'unit',
      productType: 'PACKAGING',
      baseUnit: 'unit',
      recipeVersion: 0,
      alertLevel: 100,
    },
    {
      id: ids.pPizza,
      name: 'Margherita Pizza',
      price: 18,
      category: 'Pizzas',
      isPack: false,
      subItemIds: [],
      printerIds: [ids.printerKitchen],
      manageStock: false,
      visibleInPos: true,
      stock: 0,
      unit: 'unit',
      productType: 'FINISHED',
      baseUnit: 'unit',
      recipeVersion: 1,
      recipe: [
        { ingredientProductId: ids.pFlour, quantity: 0.25, unit: 'kg' },
        { ingredientProductId: ids.pSauce, quantity: 0.12, unit: 'l' },
        { ingredientProductId: ids.pMozzarella, quantity: 0.18, unit: 'kg' },
      ],
    },
    {
      id: ids.pLatte,
      name: 'Latte',
      price: 7,
      category: 'Drinks',
      isPack: false,
      subItemIds: [],
      printerIds: [ids.printerBar],
      manageStock: false,
      visibleInPos: true,
      stock: 0,
      unit: 'unit',
      productType: 'FINISHED',
      baseUnit: 'unit',
      recipeVersion: 1,
      recipe: [
        { ingredientProductId: ids.pCoffeeBeans, quantity: 0.018, unit: 'kg' },
        { ingredientProductId: ids.pMilk, quantity: 0.25, unit: 'l' },
        { ingredientProductId: ids.pSugar, quantity: 0.01, unit: 'kg' },
      ],
    },
    {
      id: ids.pCola,
      name: 'Cola Glass',
      price: 5.5,
      category: 'Drinks',
      isPack: false,
      subItemIds: [],
      printerIds: [ids.printerBar],
      manageStock: false,
      visibleInPos: true,
      stock: 0,
      unit: 'unit',
      productType: 'FINISHED',
      baseUnit: 'unit',
      recipeVersion: 1,
      recipe: [
        { ingredientProductId: ids.pSyrup, quantity: 0.03, unit: 'l' },
        { ingredientProductId: ids.pCup, quantity: 1, unit: 'unit' },
      ],
    },
    {
      id: ids.pWater,
      name: 'Bottled Water 0.5L',
      price: 3,
      category: 'Drinks',
      isPack: false,
      subItemIds: [],
      printerIds: [ids.printerBar],
      manageStock: true,
      visibleInPos: true,
      stock: 117,
      unit: 'unit',
      productType: 'FINISHED',
      baseUnit: 'unit',
      recipeVersion: 0,
      alertLevel: 20,
    },
    {
      id: ids.pComboLunch,
      name: 'Combo Lunch',
      price: 22,
      category: 'Pizzas',
      isPack: true,
      subItemIds: [ids.pPizza, ids.pCola],
      printerIds: [ids.printerKitchen, ids.printerBar],
      manageStock: false,
      visibleInPos: true,
      stock: 0,
      unit: 'unit',
      productType: 'FINISHED',
      baseUnit: 'unit',
      recipeVersion: 0,
    },
  ]);

  await manager.insert(ProductRecipeRevision, [
    {
      productId: ids.pPizza,
      version: 1,
      items: [
        { ingredientProductId: ids.pFlour, quantity: 0.25, unit: 'kg' },
        { ingredientProductId: ids.pSauce, quantity: 0.12, unit: 'l' },
        { ingredientProductId: ids.pMozzarella, quantity: 0.18, unit: 'kg' },
      ],
      changedBy: 'seed',
      createdAt: now - 20 * day,
    },
    {
      productId: ids.pLatte,
      version: 1,
      items: [
        { ingredientProductId: ids.pCoffeeBeans, quantity: 0.018, unit: 'kg' },
        { ingredientProductId: ids.pMilk, quantity: 0.25, unit: 'l' },
        { ingredientProductId: ids.pSugar, quantity: 0.01, unit: 'kg' },
      ],
      changedBy: 'seed',
      createdAt: now - 20 * day,
    },
    {
      productId: ids.pCola,
      version: 1,
      items: [
        { ingredientProductId: ids.pSyrup, quantity: 0.03, unit: 'l' },
        { ingredientProductId: ids.pCup, quantity: 1, unit: 'unit' },
      ],
      changedBy: 'seed',
      createdAt: now - 20 * day,
    },
  ]);

  await manager.insert(StockLot, [
    { productId: ids.pFlour, warehouseId: ids.warehouseMain, branchId: 'BR-MAIN', batchNo: 'FL-2501', expiryAt: now + 120 * day, receivedAt: now - 15 * day, quantity: 25, remainingQuantity: 24, unitCost: 2.2, createdAt: now - 15 * day },
    { productId: ids.pSauce, warehouseId: ids.warehouseMain, branchId: 'BR-MAIN', batchNo: 'TS-2501', expiryAt: now + 90 * day, receivedAt: now - 15 * day, quantity: 20, remainingQuantity: 19.52, unitCost: 3.4, createdAt: now - 15 * day },
    { productId: ids.pMozzarella, warehouseId: ids.warehouseCold, branchId: 'BR-MAIN', batchNo: 'MZ-2501', expiryAt: now + 30 * day, receivedAt: now - 12 * day, quantity: 18, remainingQuantity: 17.28, unitCost: 18, createdAt: now - 12 * day },
    { productId: ids.pCoffeeBeans, warehouseId: ids.warehouseBar, branchId: 'BR-MAIN', batchNo: 'CB-2501', expiryAt: now + 180 * day, receivedAt: now - 18 * day, quantity: 10, remainingQuantity: 9.928, unitCost: 26, createdAt: now - 18 * day },
    { productId: ids.pMilk, warehouseId: ids.warehouseCold, branchId: 'BR-MAIN', batchNo: 'ML-2501', expiryAt: now + 10 * day, receivedAt: now - 8 * day, quantity: 30, remainingQuantity: 29, unitCost: 1.8, createdAt: now - 8 * day },
    { productId: ids.pSugar, warehouseId: ids.warehouseMain, branchId: 'BR-MAIN', batchNo: 'SG-2501', expiryAt: now + 200 * day, receivedAt: now - 18 * day, quantity: 15, remainingQuantity: 14.96, unitCost: 1.6, createdAt: now - 18 * day },
    { productId: ids.pSyrup, warehouseId: ids.warehouseBar, branchId: 'BR-MAIN', batchNo: 'SY-2501', expiryAt: now + 150 * day, receivedAt: now - 20 * day, quantity: 8, remainingQuantity: 7.88, unitCost: 12, createdAt: now - 20 * day },
    { productId: ids.pCup, warehouseId: ids.warehouseBar, branchId: 'BR-MAIN', batchNo: 'CP-2501', expiryAt: null, receivedAt: now - 20 * day, quantity: 500, remainingQuantity: 496, unitCost: 0.15, createdAt: now - 20 * day },
    { productId: ids.pWater, warehouseId: ids.warehouseBar, branchId: 'BR-MAIN', batchNo: 'WT-2501', expiryAt: now + 365 * day, receivedAt: now - 20 * day, quantity: 120, remainingQuantity: 117, unitCost: 0.8, createdAt: now - 20 * day },
  ]);

  await manager.insert(StockMovement, [
    { productId: ids.pFlour, type: 'IN', quantity: 25, quantityBefore: 0, quantityAfter: 25, unit: 'kg', reason: 'INITIAL_STOCK', referenceType: 'SEED', referenceId: 'seed-stock-in', warehouseId: ids.warehouseMain, branchId: 'BR-MAIN', userName: 'seed', unitCost: 2.2, totalCost: 55, costMethod: 'FIFO', batchNo: 'FL-2501', expiryAt: now + 120 * day, createdAt: now - 15 * day },
    { productId: ids.pSauce, type: 'IN', quantity: 20, quantityBefore: 0, quantityAfter: 20, unit: 'l', reason: 'INITIAL_STOCK', referenceType: 'SEED', referenceId: 'seed-stock-in', warehouseId: ids.warehouseMain, branchId: 'BR-MAIN', userName: 'seed', unitCost: 3.4, totalCost: 68, costMethod: 'FIFO', batchNo: 'TS-2501', expiryAt: now + 90 * day, createdAt: now - 15 * day },
    { productId: ids.pMozzarella, type: 'IN', quantity: 18, quantityBefore: 0, quantityAfter: 18, unit: 'kg', reason: 'INITIAL_STOCK', referenceType: 'SEED', referenceId: 'seed-stock-in', warehouseId: ids.warehouseCold, branchId: 'BR-MAIN', userName: 'seed', unitCost: 18, totalCost: 324, costMethod: 'FIFO', batchNo: 'MZ-2501', expiryAt: now + 30 * day, createdAt: now - 12 * day },
    { productId: ids.pCoffeeBeans, type: 'IN', quantity: 10, quantityBefore: 0, quantityAfter: 10, unit: 'kg', reason: 'INITIAL_STOCK', referenceType: 'SEED', referenceId: 'seed-stock-in', warehouseId: ids.warehouseBar, branchId: 'BR-MAIN', userName: 'seed', unitCost: 26, totalCost: 260, costMethod: 'FIFO', batchNo: 'CB-2501', expiryAt: now + 180 * day, createdAt: now - 18 * day },
    { productId: ids.pMilk, type: 'IN', quantity: 30, quantityBefore: 0, quantityAfter: 30, unit: 'l', reason: 'INITIAL_STOCK', referenceType: 'SEED', referenceId: 'seed-stock-in', warehouseId: ids.warehouseCold, branchId: 'BR-MAIN', userName: 'seed', unitCost: 1.8, totalCost: 54, costMethod: 'FIFO', batchNo: 'ML-2501', expiryAt: now + 10 * day, createdAt: now - 8 * day },
    { productId: ids.pSugar, type: 'IN', quantity: 15, quantityBefore: 0, quantityAfter: 15, unit: 'kg', reason: 'INITIAL_STOCK', referenceType: 'SEED', referenceId: 'seed-stock-in', warehouseId: ids.warehouseMain, branchId: 'BR-MAIN', userName: 'seed', unitCost: 1.6, totalCost: 24, costMethod: 'FIFO', batchNo: 'SG-2501', expiryAt: now + 200 * day, createdAt: now - 18 * day },
    { productId: ids.pSyrup, type: 'IN', quantity: 8, quantityBefore: 0, quantityAfter: 8, unit: 'l', reason: 'INITIAL_STOCK', referenceType: 'SEED', referenceId: 'seed-stock-in', warehouseId: ids.warehouseBar, branchId: 'BR-MAIN', userName: 'seed', unitCost: 12, totalCost: 96, costMethod: 'FIFO', batchNo: 'SY-2501', expiryAt: now + 150 * day, createdAt: now - 20 * day },
    { productId: ids.pCup, type: 'IN', quantity: 500, quantityBefore: 0, quantityAfter: 500, unit: 'unit', reason: 'INITIAL_STOCK', referenceType: 'SEED', referenceId: 'seed-stock-in', warehouseId: ids.warehouseBar, branchId: 'BR-MAIN', userName: 'seed', unitCost: 0.15, totalCost: 75, costMethod: 'FIFO', batchNo: 'CP-2501', createdAt: now - 20 * day },
    { productId: ids.pWater, type: 'IN', quantity: 120, quantityBefore: 0, quantityAfter: 120, unit: 'unit', reason: 'INITIAL_STOCK', referenceType: 'SEED', referenceId: 'seed-stock-in', warehouseId: ids.warehouseBar, branchId: 'BR-MAIN', userName: 'seed', unitCost: 0.8, totalCost: 96, costMethod: 'FIFO', batchNo: 'WT-2501', expiryAt: now + 365 * day, createdAt: now - 20 * day },
  ]);

  await manager.insert(StockTransfer, [
    {
      id: ids.transferApproved,
      status: 'APPROVED',
      sourceWarehouseId: ids.warehouseMain,
      destinationWarehouseId: ids.warehouseBar,
      sourceBranchId: 'BR-MAIN',
      destinationBranchId: 'BR-MAIN',
      items: [{ productId: ids.pSugar, quantity: 2, note: 'Bar drinks prep' }],
      requestedBy: 'Stock Test',
      approvedBy: 'Manager Test',
      note: 'Approved transfer for drinks station',
      createdAt: now - 4 * day,
      approvedAt: now - 4 * day + 20 * 60 * 1000,
      completedAt: now - 4 * day + 30 * 60 * 1000,
    },
  ]);

  await manager.insert(StockAdjustment, [
    {
      id: ids.adjustmentPending,
      status: 'PENDING',
      productId: ids.pMilk,
      kind: 'WASTAGE',
      type: 'OUT',
      quantity: 1.5,
      warehouseId: ids.warehouseCold,
      branchId: 'BR-MAIN',
      reason: 'Spillage during handling',
      note: 'Awaiting manager validation',
      requestedBy: 'Stock Test',
      createdAt: now - 2 * day,
    },
    {
      id: ids.adjustmentApproved,
      status: 'APPROVED',
      productId: ids.pMozzarella,
      kind: 'EXPIRED',
      type: 'OUT',
      quantity: 0.5,
      warehouseId: ids.warehouseCold,
      branchId: 'BR-MAIN',
      reason: 'Expired lot removed',
      note: 'Approved write-off',
      requestedBy: 'Stock Test',
      approvedBy: 'Manager Test',
      createdAt: now - 7 * day,
      decidedAt: now - 7 * day + 10 * 60 * 1000,
    },
  ]);

  await manager.insert(Fund, [
    {
      id: ids.fundMain,
      name: 'Main Cash Register',
      currency: 'TND',
      terminalId: 'T1',
      isActive: true,
    },
  ]);

  await manager.insert(Shift, [
    {
      id: ids.shiftOpen,
      userId: ids.server,
      userName: 'Server Test',
      role: 'SERVER',
      openedById: ids.manager,
      openedByName: 'Manager Test',
      cashierId: ids.cashier,
      cashierName: 'Cashier Test',
      fundId: ids.fundMain,
      fundName: 'Main Cash Register',
      openedAt: now - 6 * 60 * 60 * 1000,
      openingFund: 300,
      closingFund: 0,
      notes: 'Seed open shift',
      status: 'OPEN',
    },
  ]);

  await manager.insert(FundSession, [
    {
      id: ids.fundSessionOpen,
      fundId: ids.fundMain,
      shiftId: ids.shiftOpen,
      cashierId: ids.cashier,
      cashierName: 'Cashier Test',
      openedAt: now - 6 * 60 * 60 * 1000,
      openingBalance: 300,
      closingBalance: 0,
      totalSales: 110,
      cashSales: 72,
      cardSales: 38,
      status: 'OPEN',
      notes: 'Seed fund session',
    },
  ]);

  await manager.insert(Session, [
    {
      id: ids.sessionOpen,
      isOpen: true,
      openedAt: now - 6 * 60 * 60 * 1000,
      openingBalance: 300,
      totalSales: 110,
      cashSales: 72,
      cardSales: 38,
      movements: [
        { type: 'OPEN', amount: 300, at: now - 6 * 60 * 60 * 1000, by: 'Cashier Test' },
      ] as any,
    },
  ]);

  await manager.insert(Order, [
    {
      id: ids.order1,
      tableNumber: 'T01',
      zoneId: ids.zoneMain,
      type: 'DINE_IN',
      status: 'COMPLETED',
      serverName: 'Server Test',
      serverId: ids.server,
      shiftId: ids.shiftOpen,
      createdAt: now - 3 * day,
      items: [
        { id: randomUUID(), productId: ids.pPizza, name: 'Margherita Pizza', price: 18, quantity: 2 },
        { id: randomUUID(), productId: ids.pCola, name: 'Cola Glass', price: 5.5, quantity: 1 },
      ] as any,
      total: 41.5,
      timbre: 1,
      discount: 0,
      paymentMethod: 'CASH',
      paidAmount: 41.5,
      payments: [{ method: 'CASH', amount: 41.5, createdAt: now - 3 * day + 30 * 60 * 1000 }] as any,
    },
    {
      id: ids.order2,
      tableNumber: 'T04',
      zoneId: ids.zoneTerrace,
      type: 'DINE_IN',
      status: 'COMPLETED',
      serverName: 'Server Test',
      serverId: ids.server,
      shiftId: ids.shiftOpen,
      createdAt: now - 2 * day,
      items: [
        { id: randomUUID(), productId: ids.pPizza, name: 'Margherita Pizza', price: 18, quantity: 1 },
        { id: randomUUID(), productId: ids.pLatte, name: 'Latte', price: 7, quantity: 2 },
      ] as any,
      total: 32,
      timbre: 1,
      discount: 0,
      paymentMethod: 'BANK_CARD',
      paidAmount: 32,
      payments: [{ method: 'BANK_CARD', amount: 32, createdAt: now - 2 * day + 40 * 60 * 1000 }] as any,
    },
    {
      id: ids.order3,
      tableNumber: 'T02',
      zoneId: ids.zoneMain,
      type: 'TAKE_OUT',
      status: 'COMPLETED',
      serverName: 'Server Test',
      serverId: ids.server,
      shiftId: ids.shiftOpen,
      createdAt: now - day,
      items: [
        { id: randomUUID(), productId: ids.pCola, name: 'Cola Glass', price: 5.5, quantity: 3 },
        { id: randomUUID(), productId: ids.pWater, name: 'Bottled Water 0.5L', price: 3, quantity: 1 },
      ] as any,
      total: 19.5,
      timbre: 1,
      discount: 0,
      paymentMethod: 'CASH',
      paidAmount: 19.5,
      payments: [{ method: 'CASH', amount: 19.5, createdAt: now - day + 25 * 60 * 1000 }] as any,
    },
    {
      id: ids.order4,
      tableNumber: 'T05',
      zoneId: ids.zoneTerrace,
      type: 'DELIVERY',
      status: 'COMPLETED',
      serverName: 'Server Test',
      serverId: ids.server,
      shiftId: ids.shiftOpen,
      createdAt: now - 14 * 60 * 60 * 1000,
      items: [
        { id: randomUUID(), productId: ids.pLatte, name: 'Latte', price: 7, quantity: 2 },
        { id: randomUUID(), productId: ids.pPizza, name: 'Margherita Pizza', price: 18, quantity: 1 },
      ] as any,
      total: 32,
      timbre: 1,
      discount: 0,
      paymentMethod: 'BANK_CARD',
      paidAmount: 32,
      payments: [{ method: 'BANK_CARD', amount: 32, createdAt: now - 14 * 60 * 60 * 1000 + 15 * 60 * 1000 }] as any,
    },
    {
      id: ids.order5,
      tableNumber: 'T03',
      zoneId: ids.zoneMain,
      type: 'DINE_IN',
      status: 'COMPLETED',
      serverName: 'Server Test',
      serverId: ids.server,
      shiftId: ids.shiftOpen,
      createdAt: now - 2 * 60 * 60 * 1000,
      items: [
        { id: randomUUID(), productId: ids.pWater, name: 'Bottled Water 0.5L', price: 3, quantity: 2 },
      ] as any,
      total: 6,
      timbre: 1,
      discount: 0,
      paymentMethod: 'CASH',
      paidAmount: 6,
      payments: [{ method: 'CASH', amount: 6, createdAt: now - 2 * 60 * 60 * 1000 + 10 * 60 * 1000 }] as any,
    },
  ]);

  // Partial payment scenario with tickets
  const orderRepo = manager.getRepository(Order);
  const oiRepo = manager.getRepository(OrderItem);
  const ticketRepo = manager.getRepository(Ticket);
  const tiRepo = manager.getRepository(TicketItem);

  const partialTotal = 36 + 16.5 + 1; // 2x pizza (18) + 3x cola (5.5) + timbre(1)
  const partialOrder = orderRepo.create({
    id: ids.orderPartial,
    tableNumber: 'T02',
    zoneId: ids.zoneMain,
    type: 'DINE_IN',
    status: 'PARTIAL',
    serverName: 'Server Test',
    serverId: ids.server,
    shiftId: ids.shiftOpen,
    createdAt: now - 60 * 60 * 1000,
    total: partialTotal,
    timbre: 1,
    discount: 0,
    paymentMethod: 'SPLIT',
    paidAmount: 29, // first partial payment
    payments: [{ method: 'CASH', amount: 29, createdAt: now - 50 * 60 * 1000 }] as any,
  } as any);
  const savedPartialOrder = await orderRepo.save(partialOrder as any);

  const oiPizza = await oiRepo.save(oiRepo.create({
    order: savedPartialOrder as any,
    productId: ids.pPizza,
    name: 'Margherita Pizza',
    unitPrice: 18,
    quantity: 2,
    paidQuantity: 1,
    remainingQuantity: 1,
    isLocked: false,
    status: 'UNPAID',
  } as any) as any);

  const oiCola = await oiRepo.save(oiRepo.create({
    order: savedPartialOrder as any,
    productId: ids.pCola,
    name: 'Cola Glass',
    unitPrice: 5.5,
    quantity: 3,
    paidQuantity: 2,
    remainingQuantity: 1,
    isLocked: false,
    status: 'UNPAID',
  } as any) as any);

  const ticketCode = await generateNextPrefixedCode(manager, 'ticket', { pad: 6 });
  const ticket = await ticketRepo.save(ticketRepo.create({
    order: savedPartialOrder as any,
    code: ticketCode,
    createdAt: now - 49 * 60 * 1000,
    total: 29,
    discount: 0,
    timbre: 0,
  } as any) as any);

  await tiRepo.save(tiRepo.create({
    ticket: ticket as any,
    orderItemId: oiPizza.id as any,
    productId: oiPizza.productId as any,
    name: oiPizza.name as any,
    unitPrice: oiPizza.unitPrice as any,
    quantity: 1,
    total: 18,
  } as any) as any);

  await tiRepo.save(tiRepo.create({
    ticket: ticket as any,
    orderItemId: oiCola.id as any,
    productId: oiCola.productId as any,
    name: oiCola.name as any,
    unitPrice: oiCola.unitPrice as any,
    quantity: 2,
    total: 11,
  } as any) as any);

  await manager.insert(StockMovement, [
    { productId: ids.pFlour, type: 'OUT', quantity: 1.0, quantityBefore: 25, quantityAfter: 24, unit: 'kg', reason: 'ORDER_RECIPE_DEDUCTION', referenceType: 'ORDER', referenceId: ids.order4, sourceProductId: ids.pPizza, branchId: 'BR-MAIN', warehouseId: ids.warehouseMain, userName: 'Server Test', unitCost: 2.2, totalCost: 2.2, costMethod: 'FIFO', createdAt: now - 14 * 60 * 60 * 1000 },
    { productId: ids.pSauce, type: 'OUT', quantity: 0.48, quantityBefore: 20, quantityAfter: 19.52, unit: 'l', reason: 'ORDER_RECIPE_DEDUCTION', referenceType: 'ORDER', referenceId: ids.order4, sourceProductId: ids.pPizza, branchId: 'BR-MAIN', warehouseId: ids.warehouseMain, userName: 'Server Test', unitCost: 3.4, totalCost: 1.632, costMethod: 'FIFO', createdAt: now - 14 * 60 * 60 * 1000 },
    { productId: ids.pMozzarella, type: 'OUT', quantity: 0.72, quantityBefore: 18, quantityAfter: 17.28, unit: 'kg', reason: 'ORDER_RECIPE_DEDUCTION', referenceType: 'ORDER', referenceId: ids.order4, sourceProductId: ids.pPizza, branchId: 'BR-MAIN', warehouseId: ids.warehouseCold, userName: 'Server Test', unitCost: 18, totalCost: 12.96, costMethod: 'FIFO', createdAt: now - 14 * 60 * 60 * 1000 },
    { productId: ids.pCoffeeBeans, type: 'OUT', quantity: 0.072, quantityBefore: 10, quantityAfter: 9.928, unit: 'kg', reason: 'ORDER_RECIPE_DEDUCTION', referenceType: 'ORDER', referenceId: ids.order4, sourceProductId: ids.pLatte, branchId: 'BR-MAIN', warehouseId: ids.warehouseBar, userName: 'Server Test', unitCost: 26, totalCost: 1.872, costMethod: 'FIFO', createdAt: now - 14 * 60 * 60 * 1000 },
    { productId: ids.pMilk, type: 'OUT', quantity: 1.0, quantityBefore: 30, quantityAfter: 29, unit: 'l', reason: 'ORDER_RECIPE_DEDUCTION', referenceType: 'ORDER', referenceId: ids.order4, sourceProductId: ids.pLatte, branchId: 'BR-MAIN', warehouseId: ids.warehouseCold, userName: 'Server Test', unitCost: 1.8, totalCost: 1.8, costMethod: 'FIFO', createdAt: now - 14 * 60 * 60 * 1000 },
    { productId: ids.pSugar, type: 'OUT', quantity: 0.04, quantityBefore: 15, quantityAfter: 14.96, unit: 'kg', reason: 'ORDER_RECIPE_DEDUCTION', referenceType: 'ORDER', referenceId: ids.order4, sourceProductId: ids.pLatte, branchId: 'BR-MAIN', warehouseId: ids.warehouseMain, userName: 'Server Test', unitCost: 1.6, totalCost: 0.064, costMethod: 'FIFO', createdAt: now - 14 * 60 * 60 * 1000 },
    { productId: ids.pSyrup, type: 'OUT', quantity: 0.12, quantityBefore: 8, quantityAfter: 7.88, unit: 'l', reason: 'ORDER_RECIPE_DEDUCTION', referenceType: 'ORDER', referenceId: ids.order3, sourceProductId: ids.pCola, branchId: 'BR-MAIN', warehouseId: ids.warehouseBar, userName: 'Server Test', unitCost: 12, totalCost: 1.44, costMethod: 'FIFO', createdAt: now - day },
    { productId: ids.pCup, type: 'OUT', quantity: 4, quantityBefore: 500, quantityAfter: 496, unit: 'unit', reason: 'ORDER_RECIPE_DEDUCTION', referenceType: 'ORDER', referenceId: ids.order3, sourceProductId: ids.pCola, branchId: 'BR-MAIN', warehouseId: ids.warehouseBar, userName: 'Server Test', unitCost: 0.15, totalCost: 0.6, costMethod: 'FIFO', createdAt: now - day },
    { productId: ids.pWater, type: 'OUT', quantity: 3, quantityBefore: 120, quantityAfter: 117, unit: 'unit', reason: 'ORDER_SALE', referenceType: 'ORDER', referenceId: ids.order5, sourceProductId: ids.pWater, branchId: 'BR-MAIN', warehouseId: ids.warehouseBar, userName: 'Server Test', unitCost: 0.8, totalCost: 2.4, costMethod: 'FIFO', createdAt: now - 2 * 60 * 60 * 1000 },
  ]);

  console.log('Seed complete: users, settings, zones/tables, products/recipes, stock, workflows, and sales data inserted.');
  console.log('Login PINs: ADMIN=1111, MANAGER=2222, CASHIER=3333, SERVER=4444, STOCK_MANAGER=5555, CHEF=6666, BARTENDER=7777');
}

async function main() {
  try {
    await AppDataSource.initialize();
    await resetDatabase();
    await seedDatabase();
    await AppDataSource.destroy();
    console.log('Database reset and reseed finished successfully.');
  } catch (error) {
    console.error('Reset/seed failed:', error);
    process.exitCode = 1;
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

void main();
