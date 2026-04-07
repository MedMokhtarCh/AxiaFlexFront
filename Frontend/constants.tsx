
import React from 'react';
import { Product, TableStatus, OrderType } from './types';

export const CATEGORIES = ['Tous', 'Entrées', 'Plats', 'Boissons', 'Desserts', 'Packs'];

export const MOCK_PRODUCTS: Product[] = [
  { id: '1', name: 'Pizza Margherita', price: 12.50, category: 'Plats', imageUrl: 'https://picsum.photos/seed/pizza/200', isPack: false, manageStock: true, stock: 50, printerIds: ['p1'] },
  { id: '2', name: 'Salade César', price: 8.90, category: 'Entrées', imageUrl: 'https://picsum.photos/seed/salad/200', isPack: false, manageStock: true, stock: 30, printerIds: ['p1'] },
  { id: '3', name: 'Bière Artisanale', price: 6.00, category: 'Boissons', imageUrl: 'https://picsum.photos/seed/beer/200', isPack: false, manageStock: true, stock: 100, printerIds: ['p2'] },
  { id: '4', name: 'Verre de Vin', price: 7.50, category: 'Boissons', imageUrl: 'https://picsum.photos/seed/wine/200', isPack: false, manageStock: true, stock: 40, printerIds: ['p2'] },
  { id: '5', name: 'Pack Famille', price: 35.00, category: 'Packs', imageUrl: 'https://picsum.photos/seed/pack/200', isPack: true, subItemIds: ['1', '1', '2', '3'], manageStock: false, printerIds: ['p1', 'p2'] },
  { id: '6', name: 'Fondant au Chocolat', price: 7.00, category: 'Desserts', imageUrl: 'https://picsum.photos/seed/cake/200', isPack: false, manageStock: true, stock: 20, printerIds: ['p1'] },
  { id: '7', name: 'Burger Gourmet', price: 14.50, category: 'Plats', imageUrl: 'https://picsum.photos/seed/burger/200', isPack: false, manageStock: true, stock: 15, printerIds: ['p1'] },
  { id: '8', name: 'Soda', price: 3.00, category: 'Boissons', imageUrl: 'https://picsum.photos/seed/soda/200', isPack: false, manageStock: true, stock: 200, printerIds: ['p2'] },
];

export const MOCK_TABLES = Array.from({ length: 12 }, (_, i) => ({
  id: `t${i + 1}`,
  number: `${i + 1}`,
  status: Math.random() > 0.7 ? TableStatus.OCCUPIED : TableStatus.AVAILABLE,
  capacity: i < 4 ? 2 : i < 8 ? 4 : 6,
}));

export const PRINTERS = [
  { id: 'p1', name: 'Cuisine Principale', type: 'Cuisine', bonProfile: 'kitchen' as const },
  { id: 'p2', name: 'Bar', type: 'Bar', bonProfile: 'bar' as const },
  { id: 'p3', name: 'Caisse Ticket', type: 'RECEIPT', bonProfile: null },
];
