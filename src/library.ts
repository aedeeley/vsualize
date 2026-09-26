import type { VisualDefinition, VisualId } from './types.js';
/** Match a display name, category, or the user's reference slug. */
export function matchesVisual(visual: VisualDefinition, text: string, category: string, favoritesOnly: boolean, favorites: readonly VisualId[]): boolean {
  const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const terms = normalize(text).split(' ').filter(Boolean);
  const haystack = normalize([visual.name, visual.subtitle, visual.category, visual.reference || '', visual.id].join(' '));
  return (category === 'All' || visual.category === category) && (!favoritesOnly || favorites.includes(visual.id)) && terms.every(term => haystack.includes(term));
}
export function nextVisual(current: VisualId, direction: number, pool: readonly VisualId[]): VisualId {
  if (!pool.length) return current;
  const index = pool.indexOf(current);
  return pool[((index < 0 ? (direction < 0 ? 0 : -1) : index) + direction + pool.length) % pool.length]!;
}
