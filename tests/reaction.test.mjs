import test from 'node:test';
import assert from 'node:assert/strict';
import { MotionDriver } from '../dist/motion.js';
import { VisualInertia, ImpulseHistory } from '../dist/inertia.js';
import { DEFAULTS, silentFrame } from '../dist/settings.js';
import { VISUAL_IDS } from '../dist/catalog.js';
import { defaultVisualTuning, resolveVisualControls } from '../dist/visual-presets.js';

for (const visual of VISUAL_IDS) test(`${visual}: reaction preserves onset times and impulse history`, () => {
  const drivers = [new MotionDriver(), new MotionDriver(), new MotionDriver()];
  const histories = drivers.map(() => new ImpulseHistory());
  const settings = [0, 1.5, 3].map(motion => ({...DEFAULTS, ...defaultVisualTuning(visual), visual, motion}));
  const events = drivers.map(() => []);
  for (let i = 0; i < 360; i++) {
    const hit = i % 24 === 0;
    const audio = {...silentFrame(), volume: .3, bass: hit ? .9 : .15, beat: hit ? 1 : 0};
    const states = drivers.map((driver, j) => driver.update(audio, settings[j], 1/60));
    states.forEach((s, j) => {
      if (s.event) { events[j].push(i); histories[j].push(s.clock, s.eventStrength); }
      assert.equal(s.clock, states[0].clock);
      assert.equal(s.beat, states[0].beat);
    });
  }
  assert.ok(events[0].length >= 15);
  assert.deepEqual(events[0], events[1]); assert.deepEqual(events[0], events[2]);
  assert.deepEqual(histories[0].data, histories[2].data);
  assert.ok(drivers[0].state.travel > 0, 'soft does not freeze music');
});

test('reaction changes attack and settling without changing sustained magnitude', () => {
  for (const fps of [30, 60, 120]) {
    const followers = [new VisualInertia(), new VisualInertia()];
    const rates = [.5, 4], spectrum = new Float32Array(128).fill(.8);
    const state = {...new MotionDriver().state, bass:.8, mid:.8, treble:.8, volume:.8, impact:.8};
    followers.forEach((f, j) => f.update(state, spectrum, 1/fps, .8, rates[j]));
    assert.ok(followers[1].value.bass > followers[0].value.bass);
    for (let i = 1; i < Math.ceil(fps*.05); i++) followers.forEach((f, j) => f.update(state, spectrum, 1/fps, .8, rates[j]));
    assert.ok(followers[0].value.bass > .4, 'even soft attacks remain prompt');
    for (let i = 0; i < fps; i++) followers.forEach((f, j) => f.update(state, spectrum, 1/fps, .8, rates[j]));
    assert.ok(Math.abs(followers[0].value.bass-followers[1].value.bass) < .0001);
    const rest = {...state, bass:0, mid:0, treble:0, volume:0, impact:0};
    for (let i = 0; i < Math.ceil(fps*.15); i++) followers.forEach((f, j) => f.update(rest, new Float32Array(128), 1/fps, .8, rates[j]));
    assert.ok(followers[1].value.bass < followers[0].value.bass*.25);
    assert.ok(followers[1].spectrum[64] < followers[0].spectrum[64]*.25);
  }
});

test('reaction never changes a visual\'s sustained travel pace', () => {
  for (const visual of VISUAL_IDS) {
    const settings = {...DEFAULTS, ...defaultVisualTuning(visual), visual};
    const slow = new MotionDriver(), fast = new MotionDriver();
    const audio = {...silentFrame(), volume:.4, bass:.4, mid:.3};
    for (let i=0; i<600; i++) {
      slow.update(audio, {...settings, motion:0}, 1/60);
      fast.update(audio, {...settings, motion:3}, 1/60);
    }
    assert.ok(Math.abs(slow.state.speed-fast.state.speed) < .001, visual);
    assert.equal(resolveVisualControls(visual, {...settings,motion:0}).speed, resolveVisualControls(visual, {...settings,motion:3}).speed);
  }
});
