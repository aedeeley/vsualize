import test from 'node:test';
import assert from 'node:assert/strict';
import { silentFrame } from '../dist/settings.js';
import { cleanFrame } from '../dist/signal.js';

test('reused native frames retain owned buffers and never alias the incoming packet', () => {
  const target = silentFrame();
  const spectrum = target.spectrum;
  const waveform = target.waveform;
  const packet = { ...silentFrame(), volume: .5, spectrum: Array(128).fill(.7), waveform: Array(256).fill(-.2) };
  assert.equal(cleanFrame(packet, target), target);
  assert.equal(target.spectrum, spectrum);
  assert.equal(target.waveform, waveform);
  assert.equal(target.spectrum[0], .7);
  packet.spectrum[0] = 0;
  assert.equal(target.spectrum[0], .7);
  assert.equal(cleanFrame({ ...packet, spectrum: [] }, target), null);
  assert.equal(target.spectrum[0], .7);
  assert.equal(target.volume, .5);
});

test('reusing a frame clears absent diagnostics instead of retaining a previous device', () => {
  const target = silentFrame();
  const packet = { ...silentFrame(), desktopInput: { rawRms: .2, packetAgeMs: 1, packets: 5, sampleRate: 48000, channels: 2, gated: false } };
  cleanFrame(packet, target);
  assert.equal(target.desktopInput.sampleRate, 48000);
  cleanFrame(silentFrame(), target);
  assert.equal(target.desktopInput, undefined);
});
