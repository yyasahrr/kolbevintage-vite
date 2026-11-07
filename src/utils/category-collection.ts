/** Match explicitly assigned categories first; use legacy garment mappings only
 * for older products whose category was never one of the configured categories. */
export function belongsToCategory(
  product: { category: string; garment: string },
  categoryId: string,
  categories: { id: string; name: string; parentId?: string; garments: readonly string[] }[],
): boolean {
  const selected = categories.find(category => category.id === categoryId);
  if (!selected) return false;
  const group = [selected, ...categories.filter(category => category.parentId === selected.id)];
  if (categories.some(category => category.name === product.category)) {
    return group.some(category => category.name === product.category);
  }
  return group.some(category => category.garments?.includes(product.garment));
}
