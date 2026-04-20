import { EntityManager, In } from 'typeorm';
import { AppDataSource } from '../data-source.js';
import { Product } from '../entity/Product.js';
import { ProductRecipeRevision } from '../entity/ProductRecipeRevision.js';
import { normalizeUnit, convertQuantity, canConvertUnits } from '../utils/unitConversion.js';
import { applyStockMovement } from './stockService.js';
import { emitEvent } from '../realtime.js';

type RecipeItemInput = {
  ingredientProductId: string;
  quantity: number;
  unit: string;
};

type DeductRecipePayload = {
  orderId: string;
  ticketNumber?: string | null;
  orderItems: any[];
  userName?: string | null;
  preventNegativeStock?: boolean;
  warehouseId?: string | null;
  dryRun?: boolean;
};

type PlannedDeduction = {
  sourceProductId: string;
  targetProduct: Product;
  targetVariantId?: string | null;
  targetBatchNo?: string | null;
  quantity: number;
  stockUnit: string;
  reason: 'SALE_RECIPE' | 'SALE_DIRECT';
};

const toNumber = (value: any) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const toProductRepo = (manager?: EntityManager) =>
  manager ? manager.getRepository(Product) : AppDataSource.getRepository(Product);

const toRevisionRepo = (manager?: EntityManager) =>
  manager ? manager.getRepository(ProductRecipeRevision) : AppDataSource.getRepository(ProductRecipeRevision);

export async function setProductRecipe(payload: {
  productId: string;
  items: RecipeItemInput[];
  changedBy?: string | null;
}, manager?: EntityManager) {
  const productRepo = toProductRepo(manager);
  const revisionRepo = toRevisionRepo(manager);

  const product = await productRepo.findOneBy({ id: payload.productId } as any);
  if (!product) return null;

  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const normalizedItems = rawItems
    .map((item) => ({
      ingredientProductId: String(item?.ingredientProductId || '').trim(),
      quantity: toNumber(item?.quantity),
      unit: normalizeUnit(item?.unit),
    }))
    .filter((item) => item.ingredientProductId && item.quantity > 0);

  const ingredientIds = Array.from(new Set(normalizedItems.map((item) => item.ingredientProductId)));
  if (ingredientIds.includes(product.id)) {
    throw new Error('A product cannot include itself in recipe');
  }

  if (ingredientIds.length > 0) {
    const ingredients = await productRepo.findBy({ id: In(ingredientIds) } as any);
    if (ingredients.length !== ingredientIds.length) {
      throw new Error('Some recipe ingredients do not exist');
    }
  }

  const nextVersion = Number(product.recipeVersion || 0) + 1;
  product.recipe = normalizedItems;
  product.recipeVersion = nextVersion;
  const savedProduct = await productRepo.save(product as any);

  const revision = revisionRepo.create({
    productId: product.id,
    version: nextVersion,
    items: normalizedItems,
    changedBy: payload.changedBy || null,
    createdAt: Date.now(),
  } as any);
  await revisionRepo.save(revision as any);

  if (!manager) emitEvent('products:updated', savedProduct);

  return savedProduct;
}

export async function getRecipeHistory(productId: string) {
  const revisionRepo = AppDataSource.getRepository(ProductRecipeRevision);
  return revisionRepo.find({ where: { productId } as any, order: { version: 'DESC' } as any });
}

export async function deductIngredientsForOrder(
  payload: DeductRecipePayload,
  manager?: EntityManager,
) {
  const orderItems = Array.isArray(payload.orderItems) ? payload.orderItems : [];
  const soldRows = orderItems
    .map((item) => ({
      productId: String(item?.productId || '').trim(),
      variantId: item?.variantId ? String(item.variantId).trim() : null,
      stockBatchNo: item?.stockBatchNo ? String(item.stockBatchNo).trim() : null,
      quantity: toNumber(item?.quantity),
    }))
    .filter((row) => row.productId && row.quantity > 0);

  if (soldRows.length === 0) return [];

  const productRepo = toProductRepo(manager);
  const soldProductIds = Array.from(new Set(soldRows.map((row) => row.productId)));
  const soldProducts = await productRepo.findBy({ id: In(soldProductIds) } as any);
  const soldProductsById = new Map(soldProducts.map((product) => [product.id, product]));

  const lineDeductions: {
    soldProductId: string;
    ingredientProductId: string;
    quantity: number;
    recipeUnit: string;
  }[] = [];

  for (const soldRow of soldRows) {
    const soldProduct = soldProductsById.get(soldRow.productId);
    if (!soldProduct) continue;
    const recipe = Array.isArray(soldProduct.recipe) ? soldProduct.recipe : [];
    if (recipe.length === 0) continue;

    for (const recipeItem of recipe) {
      const ingredientProductId = String((recipeItem as any)?.ingredientProductId || '').trim();
      if (!ingredientProductId) continue;
      const lineQuantity = toNumber((recipeItem as any)?.quantity);
      if (lineQuantity <= 0) continue;
      const lineUnit = normalizeUnit((recipeItem as any)?.unit);
      const requiredQty = lineQuantity * soldRow.quantity;
      if (requiredQty <= 0) continue;

      lineDeductions.push({
        soldProductId: soldRow.productId,
        ingredientProductId,
        quantity: requiredQty,
        recipeUnit: lineUnit,
      });
    }
  }

  const ingredientIds = Array.from(new Set(lineDeductions.map((line) => line.ingredientProductId)));
  const ingredientProducts = ingredientIds.length > 0
    ? await productRepo.findBy({ id: In(ingredientIds) } as any)
    : [];
  const ingredientById = new Map(ingredientProducts.map((product) => [product.id, product]));

  const plannedDeductions: PlannedDeduction[] = lineDeductions
    .map((line) => {
      const ingredient = ingredientById.get(line.ingredientProductId);
      if (!ingredient || !ingredient.manageStock) return null;
      const stockUnit = normalizeUnit(ingredient.baseUnit || ingredient.unit || line.recipeUnit);
      if (!canConvertUnits(line.recipeUnit, stockUnit)) {
        throw new Error(`Incompatible recipe unit for ingredient ${ingredient.name}`);
      }
      return {
        sourceProductId: line.soldProductId,
        targetProduct: ingredient,
        targetVariantId: null,
        quantity: convertQuantity(line.quantity, line.recipeUnit, stockUnit),
        stockUnit,
        reason: 'SALE_RECIPE' as const,
      };
    })
    .filter(Boolean) as PlannedDeduction[];

  for (const soldRow of soldRows) {
    const soldProduct = soldProductsById.get(soldRow.productId);
    if (!soldProduct || !soldProduct.manageStock) continue;
    const recipe = Array.isArray(soldProduct.recipe) ? soldProduct.recipe : [];
    if (recipe.length > 0) continue;

    plannedDeductions.push({
      sourceProductId: soldProduct.id,
      targetProduct: soldProduct,
      targetVariantId: soldRow.variantId || null,
      targetBatchNo: soldRow.stockBatchNo || null,
      quantity: soldRow.quantity,
      stockUnit: normalizeUnit(soldProduct.baseUnit || soldProduct.unit || 'unit'),
      reason: 'SALE_DIRECT',
    });
  }

  if (plannedDeductions.length === 0) return [];

  const getAvailableStock = (line: PlannedDeduction) => {
    if (!line.targetVariantId) {
      return Number(line.targetProduct.stock || 0);
    }
    const variants = Array.isArray(line.targetProduct.variants) ? line.targetProduct.variants : [];
    const variant = variants.find((v: any) => String(v?.id || '') === String(line.targetVariantId));
    return Number(variant?.stock || 0);
  };

  if (Boolean(payload.preventNegativeStock)) {
    const requiredByTarget = new Map<string, number>();
    for (const line of plannedDeductions) {
      const key = `${line.targetProduct.id}::${line.targetVariantId || ''}`;
      const current = requiredByTarget.get(key) || 0;
      requiredByTarget.set(key, current + line.quantity);
    }
    const insufficient = plannedDeductions.find((line) => {
      const key = `${line.targetProduct.id}::${line.targetVariantId || ''}`;
      const required = requiredByTarget.get(key) || 0;
      return getAvailableStock(line) < required;
    });
    if (insufficient) {
      throw new Error(`Insufficient stock for ${insufficient.targetProduct.name}`);
    }
  }

  const outputs: any[] = [];
  if (Boolean(payload.dryRun)) return outputs;
  for (const line of plannedDeductions) {
    const result = await applyStockMovement({
      productId: line.targetProduct.id,
      variantId: line.targetVariantId || null,
      batchNo: line.targetBatchNo || null,
      type: 'OUT',
      quantity: line.quantity,
      warehouseId: payload.warehouseId || null,
      userName: payload.userName || null,
      reason: line.reason,
      referenceType: 'ORDER',
      referenceId: payload.ticketNumber || payload.orderId,
      sourceProductId: line.sourceProductId,
      note: `Auto deduction for order ${payload.ticketNumber || payload.orderId}`,
      allowNegativeStock: !Boolean(payload.preventNegativeStock),
    }, manager);

    if (!result) {
      throw new Error(`Failed to deduct stock for ${line.targetProduct.name}`);
    }
    outputs.push(result.movement);
  }

  return outputs;
}
