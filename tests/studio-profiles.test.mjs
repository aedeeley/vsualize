import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSettings } from '../dist/settings.js';
import { activateVisual, rememberVisualTuning, resolveVisualControls } from '../dist/visual-presets.js';
import { exportStudioProfiles, importStudioProfiles } from '../dist/studio-profiles.js';

test('Browser Studio v2 profiles round-trip all effects without capture or window details', () => {
  const source = sanitizeSettings(null); source.lineWidth = 2.5; activateVisual(source, 'kaleidoscope'); source.intensity = 1.6;
  source.desktopDevice = 'private-speaker'; source.microphoneDevice = 'private-mic';
  const text = exportStudioProfiles(source), target = sanitizeSettings(null);
  target.mode = 'both'; target.quality = 'low'; target.layer = 'top'; target.desktopDevice = 'keep-device';
  assert.doesNotMatch(text, /private-speaker|private-mic|desktopDevice|microphoneDevice|backgroundColor/);
  assert.equal(importStudioProfiles(target, text), 12);
  assert.deepEqual(target.visualTunings, source.visualTunings); assert.equal(target.visual, 'kaleidoscope');
  assert.equal(target.mode, 'both'); assert.equal(target.quality, 'low'); assert.equal(target.layer, 'top'); assert.equal(target.desktopDevice, 'keep-device');
});

test('legacy imports migrate drive and glow and retain unaffected profiles', () => {
  const target = sanitizeSettings(null); target.intensity = .7; rememberVisualTuning(target);
  const legacy = {format:'vsualize-effect-profiles',version:1,selectedEffect:'glass',effects:{glass:{intensity:1.2,reactivity:.9,glow:.8,motion:0}}};
  assert.equal(importStudioProfiles(target, JSON.stringify(legacy)), 1);
  const result = resolveVisualControls('glass', target);
  assert.ok(Math.abs(result.amplitude * result.response - 1.2 * .9) < 1e-8);
  assert.ok(Math.abs(result.glow - .8) < 1e-8); assert.equal(result.speed, 0);
  assert.equal(target.visualTunings.soundform.intensity, .7);
});

test('invalid, oversized and incompatible documents fail without mutating settings', () => {
  const target = sanitizeSettings(null), before = structuredClone(target);
  for (const text of ['{', 'null', '[]', '{}', ' '.repeat(100001), JSON.stringify({format:'vsualize-effect-profiles',version:2,effects:{unknown:{}}})]) {
    assert.throws(() => importStudioProfiles(target, text)); assert.deepEqual(target, before);
  }
});
