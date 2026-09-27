import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPreviewTuning, previewFragment, PreviewSpin } from '../dist/preview-tuning.js';
import { VISUALS } from '../dist/visuals/index.js';

test('preview settings reject invalid storage and clamp extremes', () => {
  for (const input of [null, [], 'bad', { spin: NaN, variety: Infinity }]) {
    assert.deepEqual(cleanPreviewTuning(input), { spin: 1, variety: 1 });
  }
  assert.deepEqual(cleanPreviewTuning({ spin: -20, variety: 9 }), { spin: -3, variety: 2 });
  assert.deepEqual(cleanPreviewTuning({ spin: 0, variety: 0 }), { spin: 0, variety: 0 });
});

test('spin changes rate continuously, freezes at zero and reverses below zero', () => {
  const spin = new PreviewSpin();
  const initial = spin.update('kaleidoscope', 1, 1, 1);
  assert.equal(initial, .75);
  assert.equal(spin.update('kaleidoscope', 1, 1, 3), initial, 'a slider change must not jump the angle');
  assert.equal(spin.update('kaleidoscope', 2, 2, 0), initial, 'zero holds rotation');
  assert.equal(spin.update('kaleidoscope', 3, 3, -1), 0, 'negative spin reverses');
  assert.equal(spin.update('kaleidoscope', 3, 3, -1), 0, 'frozen clocks do not drift');
});

test('preview shader variants match every retained effect without mutating originals', () => {
  for (const [id, visual] of Object.entries(VISUALS)) {
    const original = visual.fragment;
    const study = previewFragment(id, original);
    assert.match(study, /uniform float uPreviewSpin, uVariety;/);
    assert.equal(visual.fragment, original);
    assert.ok(study.startsWith('#version 300 es'));
  }
});
