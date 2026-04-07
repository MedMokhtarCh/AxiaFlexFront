import { AppDataSource } from '../data-source.js';
import { Product } from '../entity/Product.js';
import { StockMovement } from '../entity/StockMovement.js';
import { generateNextPrefixedCode } from './prefixService.js';
import { assertProductQuota } from './saasLicenseService.js';

export async function getAllProducts() {
  const repo = AppDataSource.getRepository(Product);
  return repo.find();
}

export async function getCategories() {
  const repo = AppDataSource.getRepository(Product);
  const products = await repo.find();
  return Array.from(new Set(products.map(p => p.category).filter(Boolean)));
}

export async function createProduct(payload: any) {
  await assertProductQuota();
  return AppDataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Product);
    const code = await generateNextPrefixedCode(manager, 'product', { pad: 6 });
    const p = repo.create({ ...payload, code } as any);
    const saved = await repo.save(p as any);
    
    // Create stock movement for initial stock (for packs OR regular products)
    if (payload.manageStock && payload.stock > 0) {
      const stockMovementRepo = manager.getRepository(StockMovement);
      const note = payload.isPack 
        ? `Stock initial - Création du pack "${saved.name}"`
        : `Stock initial - Création du produit "${saved.name}"`;
      
      const movement = stockMovementRepo.create({
        productId: saved.id,
        type: 'IN',
        quantity: payload.stock,
        note: note,
        createdAt: Date.now(),
      });
      await stockMovementRepo.save(movement);
    }
    
    // Create stock movements for variants
    if (payload.manageStock && payload.variants && Array.isArray(payload.variants)) {
      const stockMovementRepo = manager.getRepository(StockMovement);
      
      for (const variant of payload.variants) {
        if (variant.stock && variant.stock > 0) {
          const variantNote = `Stock initial - Variante "${variant.name}" du produit "${saved.name}"`;
          
          const variantMovement = stockMovementRepo.create({
            productId: saved.id,
            variantId: variant.id,
            type: 'IN',
            quantity: variant.stock,
            note: variantNote,
            createdAt: Date.now(),
          });
          await stockMovementRepo.save(variantMovement);
        }
      }
    }
    
    return saved;
  });
}

export async function updateProduct(id: string, updates: any) {
  const repo = AppDataSource.getRepository(Product);
  const existing = await repo.findOneBy({ id } as any);
  if (!existing) return null;
  Object.assign(existing, updates);
  return repo.save(existing as any);
}

export async function deleteProduct(id: string) {
  const repo = AppDataSource.getRepository(Product);
  const existing = await repo.findOneBy({ id } as any);
  if (!existing) return false;
  await repo.remove(existing as any);
  return true;
}
