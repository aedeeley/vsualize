import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionController, sessionClock, SAFETY_NOTICE_VERSION } from '../dist/session.js';
import { DEFAULTS, sanitizeSettings, loadSettings, saveSettings } from '../dist/settings.js';
import { gentleSettings } from '../dist/safety-appearance.js';
import { glowStrength } from '../dist/visual-presets.js';
import { importStudioProfiles, exportStudioProfiles } from '../dist/studio-profiles.js';
import { MotionDriver } from '../dist/motion.js';
import { demoFrame } from '../dist/settings.js';

test('session expires at deadline even while suspended; only explicit start resets it', () => {
  let now=100; const s=new SessionController(30,()=>now); s.start(); now+=10*60000;
  s.visibility(true); assert.equal(s.phase,'suspended'); now+=20*60000;
  s.visibility(false); assert.equal(s.phase,'stopped'); assert.equal(s.reason,'expired');
  s.visibility(false); s.setDuration(120); assert.equal(s.phase,'stopped');
  s.start(); assert.equal(s.deadline,now+120*60000); assert.equal(s.check(),true);
});
test('minimize and restore do not reset elapsed time; changing duration uses original start',()=>{
  let now=0; const s=new SessionController(30,()=>now); s.start(); now=14*60000;
  s.visibility(true); s.visibility(false); assert.equal(s.startedAt,0);
  s.setDuration(15); now+=60000; assert.equal(s.check(),false); assert.equal(s.reason,'expired');
});
test('unlimited is unbounded but never overrides manual or wake stop',()=>{
  let now=0;const s=new SessionController(0,()=>now);s.start();now=86400000;assert.equal(s.check(),true);
  for(const reason of ['wake','manual','error']) {s.stop(reason);s.visibility(false);assert.equal(s.check(),false);s.start();}
});
test('wall clock rollback and sleep cannot extend a finite session',()=>{
  let wall=100000,mono=0;const clock=sessionClock(()=>wall,()=>mono);const start=clock();
  wall-=60000;mono+=1000;assert.equal(clock(),start+1000);
  wall+=600000;assert.equal(clock(),start+601000);
});
test('old, corrupt and unacknowledged settings use finite default; acknowledged unlimited persists',()=>{
  for(const v of [null,{}, {sessionMinutes:0}, {sessionMinutes:NaN}, {sessionMinutes:-1}, {sessionMinutes:999}]) assert.equal(sanitizeSettings(v).sessionMinutes,30);
  const s=sanitizeSettings({sessionMinutes:0,unlimitedAcknowledged:true,safetyNoticeVersion:SAFETY_NOTICE_VERSION});
  assert.equal(s.sessionMinutes,0);assert.equal(s.safetyNoticeVersion,SAFETY_NOTICE_VERSION);
  assert.equal(sanitizeSettings({safetyNoticeVersion:999}).safetyNoticeVersion,0);
});
test('storage failure remains usable and cannot imply notice acknowledgement',()=>{
  globalThis.localStorage={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
  assert.equal(loadSettings().sessionMinutes,30);assert.equal(loadSettings().safetyNoticeVersion,0);
  assert.equal(saveSettings(DEFAULTS),false);delete globalThis.localStorage;
});
test('profiles cannot import safety or capture authority',()=>{
  const s=structuredClone(DEFAULTS);const doc=JSON.parse(exportStudioProfiles(s));
  Object.assign(doc,{sessionMinutes:0,unlimitedAcknowledged:true,safetyNoticeVersion:1,gentlerVisuals:true,mode:'microphone'});
  importStudioProfiles(s,JSON.stringify(doc));assert.equal(s.sessionMinutes,30);assert.equal(s.unlimitedAcknowledged,false);
  assert.equal(s.safetyNoticeVersion,0);assert.equal(s.gentlerVisuals,false);assert.equal(s.mode,'desktop');
  assert.equal('sessionMinutes' in JSON.parse(exportStudioProfiles(s)),false);
});
test('gentler overlay halves effective glow and intensity without modifying profiles',()=>{
  for(const glow of [0,.3,.7,1]) {
    const s=structuredClone({...DEFAULTS,glow,intensity:3,motion:3,idleMotion:true,gentlerVisuals:true});
    const before=structuredClone(s),g=gentleSettings(s);
    assert.equal(g.intensity,1.5);assert.ok(Math.abs(glowStrength(g.glow)-glowStrength(glow)*.5)<1e-5);
    assert.equal(g.motion,0);assert.equal(g.idleMotion,false);assert.deepEqual(s,before);
  }
  assert.equal(gentleSettings(DEFAULTS),DEFAULTS);
});
test('Gentler holds shader color shift as well as generated palette cycling',()=>{
  const driver=new MotionDriver();for(let i=0;i<120;i++)driver.update(demoFrame(i/60),DEFAULTS,1/60);
  const shift=driver.state.colorShift;
  for(let i=0;i<120;i++)driver.update(demoFrame(i/60),gentleSettings({...DEFAULTS,gentlerVisuals:true}),1/60);
  assert.equal(driver.state.colorShift,shift);
});
