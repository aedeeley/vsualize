import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSettings } from '../dist/settings.js';
import { activateVisual, resetVisualTuning, sanitizeVisualTuning, resolveVisualControls } from '../dist/visual-presets.js';
import { exportStudioProfiles, importStudioProfiles } from '../dist/studio-profiles.js';

test('older Soundform profiles open at the original framing', () => {
  const s = sanitizeSettings({ visual: 'soundform', visualTuningVersion: 2, intensity: 1.4, motion: .8 });
  assert.equal(s.zoom, 1);
  assert.equal(s.intensity, 1.4); assert.equal(s.motion, .8);
  const c = resolveVisualControls('soundform', s);
  assert.equal(c.zoom, 1);
});

test('view settings survive switching, saving and profile transfer, and reset with the visual', () => {
  const s = sanitizeSettings(null); s.zoom = 1.75;
  activateVisual(s, 'glass');
  assert.equal(s.zoom, 1);
  const loaded = sanitizeSettings(JSON.parse(JSON.stringify(s)));
  activateVisual(loaded, 'soundform');
  assert.equal(loaded.zoom, 1.75);
  const imported = sanitizeSettings(null);
  importStudioProfiles(imported, exportStudioProfiles(loaded));
  assert.equal(imported.zoom, 1.75);
  resetVisualTuning(imported);
  assert.equal(imported.zoom, 1);
});

test('zoom clamps invalid input and discards removed rotation settings', () => {
  const tuning = sanitizeVisualTuning('soundform', { zoom: 99, rotation: -999 });
  assert.equal(tuning.zoom, 2.5);
  assert.equal('rotation' in tuning, false);
  const invalid = sanitizeVisualTuning('soundform', { zoom: NaN, rotation: Infinity });
  assert.equal(invalid.zoom, 1);
  assert.equal(sanitizeVisualTuning('soundform', { zoom: 0 }).zoom, .5);
});
