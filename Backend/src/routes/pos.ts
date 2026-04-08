import { Router } from 'express';
import * as productController from '../controllers/productController.js';
import * as orderController from '../controllers/orderController.js';
import * as sessionController from '../controllers/sessionController.js';
import * as authController from '../controllers/authController.js';
import * as categoryController from '../controllers/categoryController.js';
import * as userController from '../controllers/userController.js';
import * as zoneController from '../controllers/zoneController.js';
import * as tableController from '../controllers/tableController.js';
import * as clientController from '../controllers/clientController.js';
import * as printerController from '../controllers/printerController.js';
import * as promotionController from '../controllers/promotionController.js';
import * as settingsController from '../controllers/settingsController.js';
import * as stockController from '../controllers/stockController.js';
import * as recipeController from '../controllers/recipeController.js';
import * as shiftController from '../controllers/shiftController.js';
import * as fundController from '../controllers/fundController.js';
import * as fundSessionController from '../controllers/fundSessionController.js';
import * as billingController from '../controllers/billingController.js';
import * as ticketController from '../controllers/ticketController.js';
import * as paymentController from '../controllers/paymentController.js';
import * as paymentInstrumentController from '../controllers/paymentInstrumentController.js';
import * as auditLogController from '../controllers/auditLogController.js';

const router = Router();

// Partial payment endpoints
router.post('/payments/partial', paymentController.partialPayment);
router.get('/payments/by-order/:orderId', paymentController.getPaymentsByOrder);
router.post('/payment-instruments/vouchers', paymentInstrumentController.createVoucher);
router.get('/payment-instruments/vouchers', paymentInstrumentController.listVouchers);
router.get('/payment-instruments/vouchers/:code', paymentInstrumentController.getVoucherByCode);
router.post('/payment-instruments/cards', paymentInstrumentController.createCard);
router.get('/payment-instruments/cards', paymentInstrumentController.listCards);
router.get('/payment-instruments/cards/:code', paymentInstrumentController.getCardByCode);
router.post('/payment-instruments/cards/:code/topup', paymentInstrumentController.topupCardByCode);
router.get('/payment-instruments/cards/:code/movements', paymentInstrumentController.listCardMovementsByCode);
router.post('/payment-instruments/external-card/test', paymentInstrumentController.testExternalRestaurantCardApi);
import * as supplierController from '../controllers/supplierController.js';

import * as reportController from '../controllers/reportController.js';

// Image upload endpoint
router.post('/products/upload-image', productController.uploadProductImage);

router.get('/products', productController.getProducts);
router.post('/products', productController.createProduct);
router.patch('/products/:id', productController.patchProduct);
router.delete('/products/:id', productController.deleteProduct);
router.put('/products/:id/recipe', recipeController.putProductRecipe);
router.get('/products/:id/recipe/history', recipeController.getProductRecipeHistory);
router.get('/categories', categoryController.listCategories);
router.post('/categories', categoryController.createCategory);
router.patch('/categories/:id', categoryController.patchCategory);
router.delete('/categories/:id', categoryController.deleteCategory);

// zones and tables are handled by controllers below

router.get('/orders', orderController.listOrders);
router.get('/orders/:id', orderController.getOrder);
router.post('/orders', orderController.createOrder);
router.patch('/orders/:id', orderController.patchOrder);
router.patch('/orders/:id/status', orderController.patchOrderStatus);
router.post('/orders/:id/payments', orderController.addOrderPayment);
router.post('/orders/:id/payments/batch', orderController.addOrderPaymentsBatch);
router.post('/orders/:id/print-client-receipt', orderController.printClientReceiptProvisional);
router.get('/orders/:id/tickets', ticketController.listTickets);
router.post('/orders/:id/tickets', ticketController.createTicket);
router.post('/tickets/:id/print', ticketController.print);
router.get('/tickets/:id/pdf', ticketController.downloadPdf);

router.get('/clients', billingController.listClients);
router.post('/clients', billingController.createClient);
router.patch('/clients/:id', billingController.patchClient);
router.delete('/clients/:id', billingController.deleteClient);
router.get('/suppliers', supplierController.listSuppliers);
router.post('/suppliers', supplierController.createSupplier);
router.patch('/suppliers/:id', supplierController.patchSupplier);
router.delete('/suppliers/:id', supplierController.deleteSupplier);
router.get('/invoices', billingController.listInvoices);
router.post('/invoices', billingController.createInvoice);
router.get('/invoices/:id', billingController.getInvoice);
router.patch('/invoices/:id', billingController.patchInvoice);
router.delete('/invoices/:id', billingController.deleteInvoice);

router.get('/session', sessionController.getSession);
router.post('/session/open', sessionController.openSession);
router.post('/session/close', sessionController.closeSession);
router.post('/session/movement', sessionController.addMovement);

// Funds
router.get('/funds', fundController.listFunds);
router.post('/funds', fundController.createFund);
router.patch('/funds/:id', fundController.patchFund);
router.delete('/funds/:id', fundController.deleteFund);

// Fund sessions
router.get('/fund-sessions/active', fundSessionController.getActiveFundSession);
router.post('/fund-sessions/open', fundSessionController.openFundSession);
router.post('/fund-sessions/close', fundSessionController.closeFundSession);
router.get('/fund-sessions/movements', fundSessionController.listFundMovements);
router.post('/fund-sessions/movement', fundSessionController.addFundMovement);
router.get('/fund-sessions', fundSessionController.listFundSessions);

// Shifts
router.get('/shifts/active/:userId', shiftController.getActiveShift);
router.get('/shifts/active', shiftController.getLatestOpenShift);
router.post('/shifts/open', shiftController.openShift);
router.post('/shifts/close', shiftController.closeShift);
router.get('/shifts', shiftController.listShifts);
router.get('/shifts/summary', shiftController.listShiftSummaries);

router.post('/auth/login', authController.login);

// Users
router.get('/users', userController.listUsers);
router.post('/users', userController.createUser);
router.patch('/users/:id', userController.patchUser);
router.delete('/users/:id', userController.deleteUser);

// Zones, tables, printers
router.get('/zones', zoneController.listZones);
router.post('/zones', zoneController.createZone);
router.patch('/zones/:id', zoneController.patchZone);
router.delete('/zones/:id', zoneController.deleteZone);

router.get('/tables', tableController.listTables);
router.get('/tables/reservations', tableController.listReservations);
router.post('/tables', tableController.createTable);
router.patch('/tables/:id', tableController.patchTable);
router.delete('/tables/:id', tableController.deleteTable);

// Client (QR) endpoints
router.get('/client/table/:token', clientController.getClientTable);
router.get('/client/orders', clientController.listClientOrders);
router.post('/client/orders', clientController.createClientOrder);
router.patch('/client/orders/:id', clientController.patchClientOrder);
router.post('/client/orders/:id/cancel', clientController.cancelClientOrder);
router.post('/client/orders/:id/request-payment', clientController.requestClientPayment);

router.get('/printers', printerController.listPrinters);
router.get('/printers/detected', printerController.listDetectedPrinters);
router.post('/printers', printerController.createPrinter);
router.post('/printers/test-print', printerController.testPrint);
router.delete('/printers/:id', printerController.deletePrinter);

router.get('/promotions', promotionController.listPromotions);
router.post('/promotions', promotionController.createPromotion);
router.patch('/promotions/:id', promotionController.patchPromotion);
router.delete('/promotions/:id', promotionController.deletePromotion);

router.get('/settings', settingsController.getSettings);
router.patch('/settings', settingsController.patchSettings);
router.get('/admin/logs', auditLogController.listAppAdminLogs);
router.post('/admin/logs', auditLogController.appendAppAdminLog);
router.post('/settings/logo', ...(settingsController as any).uploadLogo);
router.get('/settings/pdf-archives', settingsController.listPdfArchives);
router.get('/settings/pdf-archives/download', settingsController.downloadPdfArchiveFile);
router.get('/settings/migration-reports', settingsController.listMigrationReports);
router.get('/settings/migration-reports/latest', settingsController.getLatestMigrationReport);

router.get('/stock/movements', stockController.listMovements);
router.post('/stock/movements', stockController.createMovement);
router.patch('/stock/movements/:id', stockController.patchMovement);
router.delete('/stock/movements/:id', stockController.deleteMovement);
router.get('/stock/product-movements', stockController.reportProductMovements);
router.get('/stock/documents', stockController.listStockDocuments);
router.post('/stock/documents', stockController.createStockDocument);
router.patch('/stock/documents/:id', stockController.patchStockDocument);
router.delete('/stock/documents/:id/lines/:lineId', stockController.deleteStockDocumentLine);
router.get('/stock/warehouses', stockController.listWarehouses);
router.post('/stock/warehouses', stockController.createWarehouse);
router.patch('/stock/warehouses/:id', stockController.patchWarehouse);
router.delete('/stock/warehouses/:id', stockController.removeWarehouse);
router.get('/stock/transfers', stockController.listTransfers);
router.post('/stock/transfers', stockController.requestTransfer);
router.post('/stock/transfers/:id/approve', stockController.approveTransfer);
router.post('/stock/transfers/:id/reject', stockController.rejectTransfer);
router.get('/stock/adjustments', stockController.listAdjustments);
router.post('/stock/adjustments', stockController.requestAdjustment);
router.post('/stock/adjustments/:id/approve', stockController.approveAdjustment);
router.post('/stock/adjustments/:id/reject', stockController.rejectAdjustment);
router.get('/stock/reports/daily-movements', stockController.reportDailyMovements);
router.get('/stock/reports/ingredient-consumption', stockController.reportIngredientConsumption);
router.get('/stock/reports/valuation', stockController.reportStockValuation);
router.get('/stock/reports/aging', stockController.reportStockAging);
router.get('/stock/reports/expiry', stockController.reportExpiryTracking);
router.get('/stock/reports/dead-stock', stockController.reportDeadStock);
router.get('/stock/reports/theoretical-vs-actual', stockController.reportTheoreticalVsActual);
router.get('/stock/reports/cogs-by-order', stockController.reportCogsByOrder);
router.get('/stock/reports/cogs-by-day', stockController.reportCogsByDay);
router.get('/stock/reports/product-profitability', stockController.reportProductProfitability);

// Reports (sales, cash, customers)
router.get('/reports/sales/summary', reportController.salesSummary);
router.get('/reports/sales/by-product', reportController.salesByProduct);
router.get('/reports/sales/by-category', reportController.salesByCategory);
router.get('/reports/sales/by-server', reportController.salesByServer);
router.get('/reports/sales/by-payment-method', reportController.salesByPaymentMethod);
router.get('/reports/sales/by-timeslot', reportController.salesByTimeslot);
router.get('/reports/cash/closing', reportController.cashClosing);
router.get('/reports/customers/top', reportController.topCustomers);

export default router;
