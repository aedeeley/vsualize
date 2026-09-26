import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRippleField, FIELD_WIDTH, FIELD_RANGES } from '../dist/ripple-field.js';

test('sound-shaped ripple fields remain silent with no sound and sanitize invalid spectra', () => {
  for (const input of [[], new Float32Array(128), Array(128).fill(NaN), Array(128).fill(-1)]) {
    const field = makeRippleField(input);
    assert.equal(field.length, FIELD_WIDTH * 4);
    assert.ok(field.every(value => value === 0));
  }
});

test('bass, mids and highs produce independent spatial fields at stable note addresses', () => {
  const patterns = [];
  for (let band = 0; band < 3; band++) {
    const [lo, hi] = FIELD_RANGES[band], source = new Float32Array(128);
    source.fill(.7, lo, lo + Math.floor((hi - lo) / 12));
    const field = makeRippleField(source);
    assert.deepEqual(field, makeRippleField(source));
    const active = Array.from({length: FIELD_WIDTH}, (_, a) => field[a * 4 + band]);
    assert.ok(Math.max(...active) - Math.min(...active) > .02);
    for (let a = 0; a < FIELD_WIDTH; a++) {
      for (let other = 0; other < 3; other++) if (other !== band) assert.equal(field[a * 4 + other], 0);
      assert.equal(field[a * 4 + 3], field[3]);
    }
    patterns.push(active);
  }
  assert.notDeepEqual(patterns[0], patterns[1]); assert.notDeepEqual(patterns[1], patterns[2]);
});

test('caller buffers are reused and gain is bounded without cross-frame residue', () => {
  const output = new Float32Array(FIELD_WIDTH * 4);
  assert.equal(makeRippleField(Array(128).fill(.5), 1, output), output);
  assert.ok(output.some(value => value > 0));
  makeRippleField([], 1, output); assert.ok(output.every(value => value === 0));
  const high = makeRippleField(Array(128).fill(1), 99);
  for (let i = 0; i < high.length; i++) assert.ok(Number.isFinite(high[i]) && high[i] >= 0 && high[i] <= (i % 4 === 3 ? 4.5 : 1));
  assert.ok(makeRippleField(Array(128).fill(1), -1).every(value => value === 0));
});
