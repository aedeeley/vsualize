import { lstat, rm } from 'node:fs/promises';
import path from 'node:path';

// Explicitly retired in 0.2.8, 0.2.11 and the Browser Studio collection. A folder merge can leave these old
// TypeScript modules on disk. Prune only these files before the compiler runs.
// No recursive removal, dependencies, build cache, preferences or other effects.
export const RETIRED_VISUAL_IDS = Object.freeze(['orbital', 'vortex', 'pulse', 'chaos', 'weaver', 'prism', 'lattice', 'neural', 'starflight', 'cube', 'petals', 'julia', 'bloom', 'cascade', 'highway', 'ripple', 'globes']);

export async function pruneRetiredVisuals(root) {
  const removed = [];
  for (const id of RETIRED_VISUAL_IDS) {
    const relative = `src/visuals/${id}.ts`;
    const file = path.join(root, relative);
    let info;
    try { info = await lstat(file); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!info.isFile() && !info.isSymbolicLink()) {
      throw new Error(`Expected a retired visual file, not a directory: ${file}. Nothing in that directory was removed.`);
    }
    await rm(file, { force: true });
    removed.push(relative);
  }
  return removed;
}
