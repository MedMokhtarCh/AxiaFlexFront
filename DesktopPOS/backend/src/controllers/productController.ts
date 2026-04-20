import { Request, Response } from 'express';
import * as productService from '../services/productService.js';
import * as stockService from '../services/stockService.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';
import { AppDataSource } from '../data-source.js';
import { Product } from '../entity/Product.js';

const allowedProductTypes = new Set(['RAW', 'SEMI_FINISHED', 'FINISHED', 'PACKAGING']);

// Image upload handler
export async function uploadProductImage(req: Request, res: Response) {
  try {
    // Use multer middleware from app
    const upload = (req as any).multerUpload;
    if (!upload) {
      return res.status(500).json({ error: 'Upload middleware not configured' });
    }
    
    upload.single('image')(req, res, async (err: any) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }
      
      // Return the URL path to the uploaded image
      const imageUrl = `/uploads/products/${req.file.filename}`;
      res.json({ imageUrl });
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getProducts(req: Request, res: Response) {
  try {
    const products = await productService.getAllProducts();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getCategories(req: Request, res: Response) {
  try {
    const cats = await productService.getCategories();
    res.json(cats.map((c: any, i: number) => ({ id: `cat-${i+1}`, name: c })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function createProduct(req: Request, res: Response) {
  try {
    const {
      name,
      price,
      category,
      taxRate,
      taxCode,
      imageUrl,
      manageStock,
      visibleInPos,
      favorite,
      stock,
      isPack,
      subItemIds,
      printerIds,
      promotionPrice,
      promoStart,
      promoEnd,
      variants,
      stockType,
      initialSerialNumbers,
      initialLot,
      initialFifoBatches,
      unit,
      baseUnit,
      productType,
      alertLevel,
    } = req.body ?? {};
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const priceNum = Number(price);
    const manageStockBool = Boolean(manageStock);
    const stockNum = Number(stock ?? 0);
    const promoPriceNum = promotionPrice !== undefined ? Number(promotionPrice) : undefined;
    const promoStartNum = promoStart !== undefined ? Number(promoStart) : undefined;
    const promoEndNum = promoEnd !== undefined ? Number(promoEnd) : undefined;
    const taxRateNum = taxRate !== undefined && taxRate !== null && taxRate !== '' ? Number(taxRate) : null;
    const normalizedProductType = typeof productType === 'string' ? productType.trim().toUpperCase() : 'FINISHED';
    const alertLevelNum = alertLevel !== undefined && alertLevel !== null && alertLevel !== ''
      ? Number(alertLevel)
      : null;

    if (!cleanName) return res.status(400).json({ error: 'Name is required' });
    if (!Number.isFinite(priceNum)) return res.status(400).json({ error: 'Price must be a number' });
    if (manageStockBool && !Number.isFinite(stockNum)) return res.status(400).json({ error: 'Stock must be a number' });
    if (promoPriceNum !== undefined && !Number.isFinite(promoPriceNum)) return res.status(400).json({ error: 'Promo price must be a number' });
    if (taxRateNum !== null && (!Number.isFinite(taxRateNum) || taxRateNum < 0)) return res.status(400).json({ error: 'Tax rate must be a positive number' });
    if (alertLevelNum !== null && !Number.isFinite(alertLevelNum)) return res.status(400).json({ error: 'Alert level must be a number' });
    if (!allowedProductTypes.has(normalizedProductType)) return res.status(400).json({ error: 'Invalid product type' });

    const defaultVisibleInPos =
      normalizedProductType === 'RAW' || normalizedProductType === 'PACKAGING'
        ? false
        : true;

    const saved = await productService.createProduct({
      name: cleanName,
      price: priceNum,
      category: category || null,
      taxRate: taxRateNum,
      taxCode: typeof taxCode === 'string' && taxCode.trim() ? taxCode.trim() : null,
      imageUrl: imageUrl || null,
      manageStock: manageStockBool,
      visibleInPos:
        visibleInPos === undefined ? defaultVisibleInPos : Boolean(visibleInPos),
      favorite: Boolean(favorite),
      stock: manageStockBool ? stockNum : 0,
      isPack: Boolean(isPack),
      subItemIds: Array.isArray(subItemIds) ? subItemIds : undefined,
      printerIds: Array.isArray(printerIds) ? printerIds : undefined,
      promotionPrice: promoPriceNum,
      promoStart: promoStartNum,
      promoEnd: promoEndNum,
      variants: Array.isArray(variants) ? variants : undefined,
      stockType: typeof stockType === 'string' ? stockType : undefined,
      initialSerialNumbers: Array.isArray(initialSerialNumbers) ? initialSerialNumbers : undefined,
      initialLot: initialLot || undefined,
      initialFifoBatches: Array.isArray(initialFifoBatches) ? initialFifoBatches : undefined,
      unit: typeof unit === 'string' && unit.trim() ? unit.trim() : null,
      baseUnit: typeof baseUnit === 'string' && baseUnit.trim() ? baseUnit.trim() : null,
      productType: normalizedProductType,
      alertLevel: alertLevelNum,
    });
    void logAppAdminAction(req, 'insert', 'product', saved.id, {
      name: saved.name,
      code: (saved as any).code ?? null,
      category: (saved as any).category ?? null,
      price: (saved as any).price ?? null,
    });
    res.json(saved);
  } catch (err: any) {
    const msg = String(err?.message || 'Server error');
    const code = /Limite|Licence/i.test(msg) ? 403 : 500;
    res.status(code).json({ error: msg });
  }
}

export async function patchProduct(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const repo = AppDataSource.getRepository(Product);
    const before = await repo.findOneBy({ id } as any);
    if (!before) return res.status(404).json({ error: 'Not found' });
    const {
      name,
      price,
      category,
      taxRate,
      taxCode,
      imageUrl,
      manageStock,
      visibleInPos,
      favorite,
      stock,
      isPack,
      subItemIds,
      printerIds,
      promotionPrice,
      promoStart,
      promoEnd,
      variants,
      stockType,
      unit,
      baseUnit,
      productType,
      alertLevel,
    } = req.body ?? {};

    const updates: any = {};
    if (name !== undefined) updates.name = typeof name === 'string' ? name.trim() : name;
    if (price !== undefined) {
      const priceNum = Number(price);
      if (!Number.isFinite(priceNum)) return res.status(400).json({ error: 'Price must be a number' });
      updates.price = priceNum;
    }
    if (category !== undefined) updates.category = category || null;
    if (taxRate !== undefined) {
      const taxRateNum = taxRate === null || taxRate === '' ? null : Number(taxRate);
      if (taxRateNum !== null && (!Number.isFinite(taxRateNum) || taxRateNum < 0)) {
        return res.status(400).json({ error: 'Tax rate must be a positive number' });
      }
      updates.taxRate = taxRateNum;
    }
    if (taxCode !== undefined) updates.taxCode = typeof taxCode === 'string' && taxCode.trim() ? taxCode.trim() : null;
    if (imageUrl !== undefined) updates.imageUrl = imageUrl || null;
    if (manageStock !== undefined) updates.manageStock = Boolean(manageStock);
    if (visibleInPos !== undefined) updates.visibleInPos = Boolean(visibleInPos);
    if (favorite !== undefined) updates.favorite = Boolean(favorite);
    if (stock !== undefined) {
      const stockNum = Number(stock ?? 0);
      if (!Number.isFinite(stockNum)) return res.status(400).json({ error: 'Stock must be a number' });
      updates.stock = stockNum;
    }
    if (isPack !== undefined) updates.isPack = Boolean(isPack);
    if (subItemIds !== undefined) updates.subItemIds = Array.isArray(subItemIds) ? subItemIds : [];
    if (printerIds !== undefined) updates.printerIds = Array.isArray(printerIds) ? printerIds : [];
    if (promotionPrice !== undefined) {
      const promoPriceNum = promotionPrice === null || promotionPrice === '' ? null : Number(promotionPrice);
      if (promoPriceNum !== null && !Number.isFinite(promoPriceNum)) return res.status(400).json({ error: 'Promo price must be a number' });
      updates.promotionPrice = promoPriceNum;
    }
    if (promoStart !== undefined) updates.promoStart = promoStart ? Number(promoStart) : null;
    if (promoEnd !== undefined) updates.promoEnd = promoEnd ? Number(promoEnd) : null;
    if (variants !== undefined) updates.variants = Array.isArray(variants) ? variants : [];
    if (stockType !== undefined) {
      const st = String(stockType || '').trim().toUpperCase();
      const allowed = new Set(['AUCUN', 'SIMPLE', 'FIFO', 'SERIAL', 'LOT']);
      if (!allowed.has(st)) return res.status(400).json({ error: 'Invalid stock type' });
      updates.stockType = st;
    }
    if (unit !== undefined) updates.unit = typeof unit === 'string' && unit.trim() ? unit.trim() : null;
    if (baseUnit !== undefined) updates.baseUnit = typeof baseUnit === 'string' && baseUnit.trim() ? baseUnit.trim() : null;
    if (productType !== undefined) {
      const normalizedProductType = typeof productType === 'string' ? productType.trim().toUpperCase() : '';
      if (!allowedProductTypes.has(normalizedProductType)) return res.status(400).json({ error: 'Invalid product type' });
      updates.productType = normalizedProductType;
    }
    if (alertLevel !== undefined) {
      const alertLevelNum = alertLevel === null || alertLevel === '' ? null : Number(alertLevel);
      if (alertLevelNum !== null && !Number.isFinite(alertLevelNum)) return res.status(400).json({ error: 'Alert level must be a number' });
      updates.alertLevel = alertLevelNum;
    }

    const updated = await productService.updateProduct(id, updates);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    void logAppAdminAction(req, 'update', 'product', id, {
      keys: Object.keys(updates),
      before: {
        name: before.name,
        category: before.category ?? null,
        price: Number(before.price),
      },
      after: {
        name: (updated as any).name,
        category: (updated as any).category ?? null,
        price: Number((updated as any).price ?? 0),
      },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function deleteProduct(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const repo = AppDataSource.getRepository(Product);
    const before = await repo.findOneBy({ id } as any);
    const ok = await productService.deleteProduct(id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    void logAppAdminAction(req, 'delete', 'product', id, {
      name: before?.name ?? null,
      code: before?.code ?? null,
      category: before?.category ?? null,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}
