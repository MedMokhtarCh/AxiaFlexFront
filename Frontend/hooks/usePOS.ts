import { useContext } from "react";
import { POSContext } from "../store/POSContext";

export function usePOS() {
  const ctx = useContext(POSContext as any);
  if (ctx) return ctx;
  // Fallback minimal stub if used outside provider
  return {
    products: [],
    categories: [],
    printers: [],
    settings: {},
    promotions: [],
    currentUser: null,
    stockMovements: [],
    addProduct: async () => {},
    updateProduct: async () => {},
    deleteProduct: async () => {},
    addCategory: async () => {},
    updateCategory: async () => {},
    deleteCategory: async () => {},
    addPromotion: async () => {},
    updatePromotion: async () => {},
    deletePromotion: async () => {},
    addStockMovement: async () => false,
    refreshStockMovements: async () => {},
    createStockDocument: async () => null,
    listStockDocuments: async () => [],
    getProductMovementReport: async () => [],
    updateStockMovement: async () => null,
    deleteStockMovement: async () => false,
  } as any;
}