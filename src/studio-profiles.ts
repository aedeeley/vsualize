import { VISUAL_IDS } from './catalog.js';
import { migrateLegacyTuning, rememberVisualTuning, sanitizeVisualTuning } from './visual-presets.js';
import type { Settings, VisualId } from './types.js';

/** The portable profile contains appearance only, never audio or device details. */
export function exportStudioProfiles(settings: Settings): string {
  rememberVisualTuning(settings);
  return JSON.stringify({ format: 'vsualize-effect-profiles', version: 2, basedOn: 'Vsualize 0.3',
    exportedAt: new Date().toISOString(), selectedEffect: settings.visual,
    effects: structuredClone(settings.visualTunings) }, null, 2);
}

/** Validate before making changes so an unrelated or broken file is harmless. */
export function importStudioProfiles(settings: Settings, text: string): number {
  if (text.length > 100_000) throw new Error('This settings file is too large. Choose a Vsualize effect-settings JSON file.');
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid settings file.');
  const doc = data as Record<string, unknown>;
  if (doc.format !== 'vsualize-effect-profiles' || (doc.version !== 1 && doc.version !== 2)
    || !doc.effects || typeof doc.effects !== 'object' || Array.isArray(doc.effects)) {
    throw new Error('Choose a JSON file made with Export effect settings.');
  }
  const effects = doc.effects as Record<string, unknown>;
  const ids = VISUAL_IDS.filter(id => Object.hasOwn(effects, id) && effects[id] && typeof effects[id] === 'object' && !Array.isArray(effects[id]));
  if (!ids.length) throw new Error('No compatible effects found in that file.');
  rememberVisualTuning(settings);
  const read = doc.version === 1 ? migrateLegacyTuning : sanitizeVisualTuning;
  for (const id of ids) settings.visualTunings[id] = read(id, effects[id], settings.visualTunings[id]);
  if (VISUAL_IDS.includes(doc.selectedEffect as VisualId)) settings.visual = doc.selectedEffect as VisualId;
  else if (doc.selectedEffect === 'ripple' || doc.selectedEffect === 'globes') settings.visual = 'soundform';
  Object.assign(settings, settings.visualTunings[settings.visual]);
  return ids.length;
}
