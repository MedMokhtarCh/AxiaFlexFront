import { AppDataSource } from '../data-source.js';
import { Category } from '../entity/Category.js';

export async function listCategories() {
  const repo = AppDataSource.getRepository(Category);
  return repo.find();
}

export async function createCategory(name: string, parentId?: string) {
  const repo = AppDataSource.getRepository(Category);
  const c = repo.create({ name, parentId: parentId || null } as any);
  return repo.save(c as any);
}

export async function deleteCategory(id: string) {
  const repo = AppDataSource.getRepository(Category);
  const existing = await repo.findOneBy({ id } as any);
  if (!existing) return false;
  await repo.remove(existing as any);
  return true;
}

export async function updateCategory(id: string, updates: any) {
  const repo = AppDataSource.getRepository(Category);
  const existing = await repo.findOneBy({ id } as any);
  if (!existing) return null;
  Object.assign(existing, updates);
  return repo.save(existing as any);
}
