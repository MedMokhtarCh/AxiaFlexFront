-- Scripts d'initialisation de la base de données AxiaFlex (PostgreSQL)

-- 1. Création des types ENUM personnalisés
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- For SQL Server, use check constraints instead of ENUMs
-- role_enum values: 'ADMIN', 'MANAGER', 'CASHIER', 'SERVER', 'STOCK_MANAGER'
-- order_type_enum values: 'DINE_IN', 'DELIVERY', 'TAKE_OUT'
-- order_status_enum values: 'PENDING', 'PREPARING', 'READY', 'DELIVERED', 'COMPLETED', 'CANCELLED'
-- payment_method_enum values: 'CASH', 'BANK_CARD', 'FIDELITY_CARD'

-- 2. Table des Zones
CREATE TABLE zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL
);

-- 3. Table des Catégories (avec auto-référence pour les sous-catégories)
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    "parentId" UUID REFERENCES categories(id) ON DELETE SET NULL
);

-- 4. Table des Utilisateurs (Staff)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'SERVER' CHECK (role IN ('ADMIN', 'MANAGER', 'CASHIER', 'SERVER', 'STOCK_MANAGER')),
    pin VARCHAR(4) UNIQUE NOT NULL,
    "avatarUrl" VARCHAR(255)
);

-- 5. Table de jointure Utilisateurs - Zones (Affectations)
CREATE TABLE user_zones (
    "usersId" UUID REFERENCES users(id) ON DELETE CASCADE,
    "zonesId" UUID REFERENCES zones(id) ON DELETE CASCADE,
    PRIMARY KEY ("usersId", "zonesId")
);

-- 6. Table des Tables de restaurant
CREATE TABLE tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number VARCHAR(255) NOT NULL,
    capacity INT NOT NULL,
    "zoneId" UUID REFERENCES zones(id) ON DELETE CASCADE
);

-- 7. Table des Produits
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 3) NOT NULL,
    "imageUrl" VARCHAR(255),
    "isPack" BOOLEAN DEFAULT FALSE,
    "subItemIds" JSONB, -- Stocke les IDs des produits composants si c'est un Pack
    "manageStock" BOOLEAN DEFAULT TRUE,
    stock INT DEFAULT 0,
    "promotionPrice" DECIMAL(10, 3),
    "promoStart" BIGINT,
    "promoEnd" BIGINT,
    "printerIds" TEXT, -- Liste séparée par des virgules pour le routage imprimantes
    "categoryId" UUID REFERENCES categories(id) ON DELETE SET NULL
);

-- 8. Table des Variantes de Produits (ex: Taille L, Taille XL)
CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 3) NOT NULL,
    stock INT DEFAULT 0,
    "productId" UUID REFERENCES products(id) ON DELETE CASCADE
);

-- 9. Table des Sessions de Caisse (Journalières)
CREATE TABLE pos_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "isOpen" BOOLEAN DEFAULT TRUE,
    "openedAt" BIGINT NOT NULL,
    "closedAt" BIGINT,
    "openingBalance" DECIMAL(10, 3) NOT NULL,
    "closingBalance" DECIMAL(10, 3),
    "cashSales" DECIMAL(10, 3) DEFAULT 0,
    "cardSales" DECIMAL(10, 3) DEFAULT 0,
    "totalSales" DECIMAL(10, 3) DEFAULT 0
);

-- 10. Table des Clients
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(255) NOT NULL,
    address TEXT
);

-- 11. Table des Commandes
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('DINE_IN', 'DELIVERY', 'TAKE_OUT')),
    status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PREPARING', 'READY', 'DELIVERED', 'COMPLETED', 'CANCELLED')),
    "paymentMethod" VARCHAR(50) CHECK ("paymentMethod" IN ('CASH', 'BANK_CARD', 'FIDELITY_CARD')),
    total DECIMAL(10, 3) NOT NULL,
    discount DECIMAL(10, 3) DEFAULT 0,
    timbre DECIMAL(10, 3) DEFAULT 1.0,
    "sessionDay" VARCHAR(10) NOT NULL, -- Format YYYY-MM-DD
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "serverId" UUID REFERENCES users(id) ON DELETE SET NULL,
    "tableId" UUID REFERENCES tables(id) ON DELETE SET NULL,
    "clientId" UUID REFERENCES clients(id) ON DELETE SET NULL,
    "sessionId" UUID REFERENCES pos_sessions(id) ON DELETE SET NULL
);

-- 12. Table des Lignes de Commande (Items)
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 3) NOT NULL,
    quantity INT NOT NULL,
    notes TEXT,
    discount DECIMAL(10, 3) DEFAULT 0,
    "orderId" UUID REFERENCES orders(id) ON DELETE CASCADE,
    "productId" UUID REFERENCES products(id) ON DELETE SET NULL,
    "variantId" UUID REFERENCES product_variants(id) ON DELETE SET NULL -- ID de la variante si applicable
    ,
    CONSTRAINT chk_order_items_price_nonnegative CHECK (price >= 0),
    CONSTRAINT chk_order_items_quantity_positive CHECK (quantity > 0),
    CONSTRAINT chk_order_items_discount_nonnegative CHECK (discount >= 0)
);

-- 13. Index pour optimiser les recherches fréquentes
CREATE INDEX idx_orders_session_day ON orders("sessionDay");
CREATE INDEX idx_products_category ON products("categoryId");
CREATE INDEX idx_tables_zone ON tables("zoneId");
CREATE INDEX idx_orders_server ON orders("serverId");
CREATE INDEX idx_order_items_order ON order_items("orderId");
CREATE INDEX idx_order_items_product ON order_items("productId");
CREATE INDEX idx_product_variants_product ON product_variants("productId");

-- 14. Données de test / Initialisation
INSERT INTO users (name, role, pin) VALUES ('Administrateur', 'ADMIN', '1234');
INSERT INTO zones (name) VALUES ('Salle Principale'), ('Terrasse');
INSERT INTO categories (name) VALUES ('Cuisine'), ('Boissons');

-- 15. Exemple de données (produits, variantes, table, client, session, commande)
WITH
u_admin AS (INSERT INTO users (name, role, pin) VALUES ('Back Admin','ADMIN','0000') RETURNING id),
u_server AS (INSERT INTO users (name, role, pin) VALUES ('Alice Server','SERVER','1111') RETURNING id),
zone_bar AS (INSERT INTO zones (name) VALUES ('Bar') RETURNING id),
cat_food AS (INSERT INTO categories (name) VALUES ('Food') RETURNING id),
cat_drink AS (INSERT INTO categories (name) VALUES ('Drinks') RETURNING id),
prod_burger AS (
    INSERT INTO products (name, price, "categoryId", stock, "manageStock")
    SELECT 'Classic Burger', 6.50, id, 50, true FROM cat_food RETURNING id
),
prod_cola AS (
    INSERT INTO products (name, price, "categoryId", stock, "manageStock")
    SELECT 'Cola 330ml', 1.50, id, 200, true FROM cat_drink RETURNING id
),
var_burger_reg AS (
    INSERT INTO product_variants (name, price, stock, "productId")
    SELECT 'Classic - Regular', 6.50, 50, id FROM prod_burger RETURNING *
),
var_burger_large AS (
    INSERT INTO product_variants (name, price, stock, "productId")
    SELECT 'Classic - Large', 8.00, 30, id FROM prod_burger RETURNING *
),
tbl1 AS (INSERT INTO tables (number, capacity, "zoneId") SELECT 'T1', 4, id FROM zone_bar RETURNING id),
client1 AS (INSERT INTO clients (name, email, phone) VALUES ('John Doe','john@example.com','+123456789') RETURNING id),
session1 AS (INSERT INTO pos_sessions ("isOpen","openedAt","openingBalance") VALUES (false, extract(epoch from now())::bigint - 3600, 100.00) RETURNING id),
order1 AS (
    INSERT INTO orders (type, status, "paymentMethod", total, discount, timbre, "sessionDay", "createdAt", "serverId", "tableId", "clientId", "sessionId")
    SELECT 'DINE_IN', 'COMPLETED', 'CASH', 8.00 + 1.00, 0.00, 1.0, to_char(now(),'YYYY-MM-DD'), now(), u_server.id, tbl1.id, client1.id, session1.id
    FROM u_server, tbl1, client1, session1 RETURNING id
),
order_item1 AS (
    INSERT INTO order_items (name, price, quantity, "orderId", "productId", "variantId")
    SELECT p.name, v.price, 1, o.id, p.id, v.id
    FROM prod_burger p, var_burger_reg v, order1 o
    WHERE p.id = v."productId"
    RETURNING id
)
SELECT 1;
