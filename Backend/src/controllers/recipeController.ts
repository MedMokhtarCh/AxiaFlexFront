import { Request, Response } from 'express';
import * as recipeService from '../services/recipeService.js';
import { logAppAdminAction } from '../services/appAdminAuditService.js';

export async function putProductRecipe(req: Request, res: Response) {
  try {
    const productId = req.params.id;
    const { items, changedBy } = req.body ?? {};

    if (!productId) return res.status(400).json({ error: 'Missing product id' });
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Items must be an array' });

    const updated = await recipeService.setProductRecipe({
      productId,
      items,
      changedBy: changedBy || null,
    });

    if (!updated) return res.status(404).json({ error: 'Product not found' });
    void logAppAdminAction(req, 'update', 'product_recipe', productId, {
      itemsCount: items.length,
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: (err as any)?.message || 'Invalid recipe' });
  }
}

export async function getProductRecipeHistory(req: Request, res: Response) {
  try {
    const productId = req.params.id;
    if (!productId) return res.status(400).json({ error: 'Missing product id' });
    const history = await recipeService.getRecipeHistory(productId);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: (err as any)?.message || 'Server error' });
  }
}
