/** Réutilisable : paramètres de chemin OpenAPI 3 */
const pathParam = (name: string) => ({
  name,
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const },
});

export type OpenApiOp = {
  tags: string[];
  summary: string;
  description?: string;
  parameters?: ReturnType<typeof pathParam>[];
};

function op(tag: string, summary: string, pathParams: string[] = [], description?: string): OpenApiOp {
  return {
    tags: [tag],
    summary,
    ...(description ? { description } : {}),
    ...(pathParams.length ? { parameters: pathParams.map(pathParam) } : {}),
  };
}

type PathItem = Partial<{
  get: OpenApiOp;
  post: OpenApiOp;
  put: OpenApiOp;
  patch: OpenApiOp;
  delete: OpenApiOp;
}>;

/**
 * Documentation des routes réelles (voir routes/pos.ts et routes/saas.ts).
 * Les corps de requête / schémas détaillés peuvent être enrichis plus tard.
 */
export const openApiPaths: Record<string, PathItem> = {
  '/pos/payments/partial': {
    post: op('Payments', 'Paiement partiel'),
  },
  '/pos/payments/by-order/{orderId}': {
    get: op('Payments', 'Liste des paiements pour une commande', ['orderId']),
  },
  '/pos/payment-instruments/vouchers': {
    post: op('PaymentInstruments', 'Créer un bon / chèque cadeau'),
    get: op('PaymentInstruments', 'Lister les bons'),
  },
  '/pos/payment-instruments/vouchers/{code}': {
    get: op('PaymentInstruments', 'Détail bon par code', ['code']),
  },
  '/pos/payment-instruments/cards': {
    post: op('PaymentInstruments', 'Créer une carte prépayée'),
    get: op('PaymentInstruments', 'Lister les cartes'),
  },
  '/pos/payment-instruments/cards/{code}': {
    get: op('PaymentInstruments', 'Détail carte par code', ['code']),
  },
  '/pos/payment-instruments/cards/{code}/topup': {
    post: op('PaymentInstruments', 'Recharger une carte', ['code']),
  },
  '/pos/payment-instruments/cards/{code}/movements': {
    get: op('PaymentInstruments', 'Mouvements d\'une carte', ['code']),
  },
  '/pos/payment-instruments/external-card/test': {
    post: op('PaymentInstruments', 'Test API carte restaurant externe'),
  },

  '/pos/products/upload-image': {
    post: op(
      'Products',
      'Upload image produit',
      [],
      'Multipart/form-data : fichier image.',
    ),
  },
  '/pos/products': {
    get: op('Products', 'Lister les produits'),
    post: op('Products', 'Créer un produit'),
  },
  '/pos/products/{id}': {
    patch: op('Products', 'Mettre à jour un produit', ['id']),
    delete: op('Products', 'Supprimer un produit', ['id']),
  },
  '/pos/products/{id}/recipe': {
    put: op('Recipes', 'Enregistrer la recette / nomenclature d\'un produit', ['id']),
  },
  '/pos/products/{id}/recipe/history': {
    get: op('Recipes', 'Historique des recettes', ['id']),
  },

  '/pos/categories': {
    get: op('Categories', 'Lister les catégories'),
    post: op('Categories', 'Créer une catégorie'),
  },
  '/pos/categories/{id}': {
    patch: op('Categories', 'Mettre à jour une catégorie', ['id']),
    delete: op('Categories', 'Supprimer une catégorie', ['id']),
  },

  '/pos/orders': {
    get: op('Orders', 'Lister les commandes'),
    post: op('Orders', 'Créer une commande'),
  },
  '/pos/orders/{id}': {
    get: op('Orders', 'Détail d\'une commande', ['id']),
    patch: op('Orders', 'Mettre à jour une commande', ['id']),
  },
  '/pos/orders/{id}/status': {
    patch: op('Orders', 'Mettre à jour le statut', ['id']),
  },
  '/pos/orders/{id}/payments': {
    post: op('Orders', 'Ajouter un paiement à la commande', ['id']),
  },
  '/pos/orders/{id}/payments/batch': {
    post: op('Orders', 'Ajouter des paiements en lot', ['id']),
  },
  '/pos/orders/{id}/print-client-receipt': {
    post: op('Orders', 'Impression ticket client (provisoire)', ['id']),
  },
  '/pos/orders/{id}/tickets': {
    get: op('Tickets', 'Lister les tickets de caisse', ['id']),
    post: op('Tickets', 'Créer un ticket', ['id']),
  },
  '/pos/tickets/{id}/print': {
    post: op('Tickets', 'Envoyer un ticket à l\'impression', ['id']),
  },
  '/pos/tickets/{id}/pdf': {
    get: op('Tickets', 'Télécharger le PDF du ticket', ['id']),
  },

  '/pos/clients': {
    get: op('Clients', 'Lister les clients'),
    post: op('Clients', 'Créer un client'),
  },
  '/pos/clients/{id}': {
    patch: op('Clients', 'Mettre à jour un client', ['id']),
    delete: op('Clients', 'Supprimer un client', ['id']),
  },
  '/pos/suppliers': {
    get: op('Suppliers', 'Lister les fournisseurs'),
    post: op('Suppliers', 'Créer un fournisseur'),
  },
  '/pos/suppliers/{id}': {
    patch: op('Suppliers', 'Mettre à jour un fournisseur', ['id']),
    delete: op('Suppliers', 'Supprimer un fournisseur', ['id']),
  },
  '/pos/invoices': {
    get: op('Invoices', 'Lister les factures'),
    post: op('Invoices', 'Créer une facture'),
  },
  '/pos/invoices/{id}': {
    get: op('Invoices', 'Détail facture', ['id']),
    patch: op('Invoices', 'Mettre à jour une facture', ['id']),
    delete: op('Invoices', 'Supprimer une facture', ['id']),
  },

  '/pos/session': {
    get: op('Session', 'Session de caisse courante'),
  },
  '/pos/session/open': {
    post: op('Session', 'Ouvrir la session de caisse'),
  },
  '/pos/session/close': {
    post: op('Session', 'Fermer la session de caisse'),
  },
  '/pos/session/movement': {
    post: op('Session', 'Ajouter un mouvement de caisse'),
  },

  '/pos/funds': {
    get: op('Funds', 'Lister les caisses / fonds'),
    post: op('Funds', 'Créer un fond'),
  },
  '/pos/funds/{id}': {
    patch: op('Funds', 'Mettre à jour un fond', ['id']),
    delete: op('Funds', 'Supprimer un fond', ['id']),
  },
  '/pos/fund-sessions/active': {
    get: op('FundSessions', 'Session de fond active'),
  },
  '/pos/fund-sessions/open': {
    post: op('FundSessions', 'Ouvrir une session de fond'),
  },
  '/pos/fund-sessions/close': {
    post: op('FundSessions', 'Fermer une session de fond'),
  },
  '/pos/fund-sessions/movements': {
    get: op('FundSessions', 'Lister les mouvements de fond'),
  },
  '/pos/fund-sessions/movement': {
    post: op('FundSessions', 'Ajouter un mouvement de fond'),
  },
  '/pos/fund-sessions': {
    get: op('FundSessions', 'Lister les sessions de fond'),
  },

  '/pos/shifts/active/{userId}': {
    get: op('Shifts', 'Shift actif pour un utilisateur', ['userId']),
  },
  '/pos/shifts/active': {
    get: op('Shifts', 'Dernier shift ouvert (tous utilisateurs)'),
  },
  '/pos/shifts/open': {
    post: op('Shifts', 'Ouvrir un shift'),
  },
  '/pos/shifts/close': {
    post: op('Shifts', 'Fermer un shift'),
  },
  '/pos/shifts': {
    get: op('Shifts', 'Lister les shifts'),
  },
  '/pos/shifts/summary': {
    get: op('Shifts', 'Synthèses des shifts'),
  },

  '/pos/auth/login': {
    post: op('Auth', 'Connexion par PIN / identifiants caisse'),
  },

  '/pos/users': {
    get: op('Users', 'Lister les utilisateurs'),
    post: op('Users', 'Créer un utilisateur'),
  },
  '/pos/users/{id}': {
    patch: op('Users', 'Mettre à jour un utilisateur', ['id']),
    delete: op('Users', 'Supprimer un utilisateur', ['id']),
  },

  '/pos/zones': {
    get: op('Zones', 'Lister les zones salle'),
    post: op('Zones', 'Créer une zone'),
  },
  '/pos/zones/{id}': {
    patch: op('Zones', 'Mettre à jour une zone (plan, couleur…)', ['id']),
    delete: op('Zones', 'Supprimer une zone', ['id']),
  },
  '/pos/tables': {
    get: op('Tables', 'Lister les tables'),
    post: op('Tables', 'Créer une table'),
  },
  '/pos/tables/reservations': {
    get: op('Tables', 'Lister les réservations'),
  },
  '/pos/tables/{id}': {
    patch: op('Tables', 'Mettre à jour une table (plan, forme…)', ['id']),
    delete: op('Tables', 'Supprimer une table', ['id']),
  },

  '/pos/client/table/{token}': {
    get: op('ClientPortal', 'Commande client : détail table (QR)', ['token']),
  },
  '/pos/client/orders': {
    get: op('ClientPortal', 'Commande client : liste des commandes'),
    post: op('ClientPortal', 'Commande client : créer une commande'),
  },
  '/pos/client/orders/{id}': {
    patch: op('ClientPortal', 'Commande client : mise à jour', ['id']),
  },
  '/pos/client/orders/{id}/cancel': {
    post: op('ClientPortal', 'Commande client : annulation', ['id']),
  },
  '/pos/client/orders/{id}/request-payment': {
    post: op('ClientPortal', 'Commande client : demande de paiement', ['id']),
  },

  '/pos/printers': {
    get: op('Printers', 'Lister les imprimantes'),
    post: op('Printers', 'Créer une imprimante'),
  },
  '/pos/printers/detected': {
    get: op('Printers', 'Imprimantes détectées'),
  },
  '/pos/printers/test-print': {
    post: op('Printers', 'Test d\'impression'),
  },
  '/pos/printers/{id}': {
    delete: op('Printers', 'Supprimer une imprimante', ['id']),
  },

  '/pos/promotions': {
    get: op('Promotions', 'Lister les promotions'),
    post: op('Promotions', 'Créer une promotion'),
  },
  '/pos/promotions/{id}': {
    patch: op('Promotions', 'Mettre à jour une promotion', ['id']),
    delete: op('Promotions', 'Supprimer une promotion', ['id']),
  },

  '/pos/settings': {
    get: op('Settings', 'Paramètres établissement'),
    patch: op('Settings', 'Mettre à jour les paramètres'),
  },
  '/pos/settings/logo': {
    post: op('Settings', 'Upload logo (multipart)', [], 'Multipart/form-data.'),
  },
  '/pos/settings/pdf-archives': {
    get: op('Settings', 'Lister les archives PDF'),
  },
  '/pos/settings/pdf-archives/download': {
    get: op('Settings', 'Télécharger un fichier d\'archive PDF'),
  },

  '/pos/stock/movements': {
    get: op('Stock', 'Mouvements de stock'),
    post: op('Stock', 'Créer un mouvement de stock'),
  },
  '/pos/stock/movements/{id}': {
    patch: op('Stock', 'Mettre à jour un mouvement', ['id']),
    delete: op('Stock', 'Supprimer un mouvement', ['id']),
  },
  '/pos/stock/product-movements': {
    get: op('Stock', 'Rapport mouvements par produit'),
  },
  '/pos/stock/documents': {
    get: op('Stock', 'Documents de stock'),
    post: op('Stock', 'Créer un document de stock'),
  },
  '/pos/stock/documents/{id}': {
    patch: op('Stock', 'Mettre à jour un document', ['id']),
  },
  '/pos/stock/documents/{id}/lines/{lineId}': {
    delete: op('Stock', 'Supprimer une ligne de document', ['id', 'lineId']),
  },
  '/pos/stock/warehouses': {
    get: op('Stock', 'Entrepôts'),
    post: op('Stock', 'Créer un entrepôt'),
  },
  '/pos/stock/warehouses/{id}': {
    patch: op('Stock', 'Mettre à jour un entrepôt', ['id']),
    delete: op('Stock', 'Supprimer un entrepôt', ['id']),
  },
  '/pos/stock/transfers': {
    get: op('Stock', 'Transferts'),
    post: op('Stock', 'Demander un transfert'),
  },
  '/pos/stock/transfers/{id}/approve': {
    post: op('Stock', 'Approuver un transfert', ['id']),
  },
  '/pos/stock/transfers/{id}/reject': {
    post: op('Stock', 'Rejeter un transfert', ['id']),
  },
  '/pos/stock/adjustments': {
    get: op('Stock', 'Ajustements d\'inventaire'),
    post: op('Stock', 'Demander un ajustement'),
  },
  '/pos/stock/adjustments/{id}/approve': {
    post: op('Stock', 'Approuver un ajustement', ['id']),
  },
  '/pos/stock/adjustments/{id}/reject': {
    post: op('Stock', 'Rejeter un ajustement', ['id']),
  },
  '/pos/stock/reports/daily-movements': {
    get: op('StockReports', 'Rapport : mouvements journaliers'),
  },
  '/pos/stock/reports/ingredient-consumption': {
    get: op('StockReports', 'Rapport : consommation ingrédients'),
  },
  '/pos/stock/reports/valuation': {
    get: op('StockReports', 'Rapport : valorisation stock'),
  },
  '/pos/stock/reports/aging': {
    get: op('StockReports', 'Rapport : vieillissement'),
  },
  '/pos/stock/reports/expiry': {
    get: op('StockReports', 'Rapport : péremption'),
  },
  '/pos/stock/reports/dead-stock': {
    get: op('StockReports', 'Rapport : stock mort'),
  },
  '/pos/stock/reports/theoretical-vs-actual': {
    get: op('StockReports', 'Rapport : théorique vs réel'),
  },
  '/pos/stock/reports/cogs-by-order': {
    get: op('StockReports', 'Rapport : coût des ventes par commande'),
  },
  '/pos/stock/reports/cogs-by-day': {
    get: op('StockReports', 'Rapport : coût des ventes par jour'),
  },
  '/pos/stock/reports/product-profitability': {
    get: op('StockReports', 'Rapport : rentabilité par produit'),
  },

  '/pos/reports/sales/summary': {
    get: op('Reports', 'Ventes : synthèse'),
  },
  '/pos/reports/sales/by-product': {
    get: op('Reports', 'Ventes par produit'),
  },
  '/pos/reports/sales/by-category': {
    get: op('Reports', 'Ventes par catégorie'),
  },
  '/pos/reports/sales/by-server': {
    get: op('Reports', 'Ventes par serveur'),
  },
  '/pos/reports/sales/by-payment-method': {
    get: op('Reports', 'Ventes par moyen de paiement'),
  },
  '/pos/reports/sales/by-timeslot': {
    get: op('Reports', 'Ventes par créneau horaire'),
  },
  '/pos/reports/cash/closing': {
    get: op('Reports', 'Caisse : clôture'),
  },
  '/pos/reports/customers/top': {
    get: op('Reports', 'Meilleurs clients'),
  },

  '/saas/verify': {
    post: op('SaaS', 'Vérifier super-admin / licence'),
  },
  '/saas/license': {
    get: op('SaaS', 'Consulter la licence'),
    patch: op('SaaS', 'Mettre à jour la licence'),
  },
  '/saas/license/sync-external': {
    post: op('SaaS', 'Synchroniser la licence (externe)'),
  },
  '/saas/logs': {
    get: op('SaaS', 'Journal développeur : liste des jours ou contenu (query date)', [], 'Bearer super-admin.'),
    post: op('SaaS', 'Ajouter une ligne au journal développeur', [], 'Bearer super-admin.'),
  },
  '/pos/admin/logs': {
    get: op(
      'Settings',
      'Journal admin application : jours ou contenu (query userId, date)',
      [],
      'Réservé rôle ADMIN.',
    ),
    post: op('Settings', 'Ajouter une note au journal admin', [], 'Body: userId, message.'),
  },
};
