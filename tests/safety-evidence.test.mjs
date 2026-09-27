import test from 'node:test';
import assert from 'node:assert/strict';
import {inspect} from '../scripts/safety/check-log.mjs';
test('evidence checker detects real stopped work and does not treat missing samples as a pass',()=>{
 const frame=(at,draws)=>({event:'frontend',unixMs:at,data:{phase:'stopped',draws,compiles:2,audioTicks:3}});
 assert.equal(inspect([frame(0,4),frame(1000,5)]).failures.length,1);
 assert.equal(inspect([]).frontendSamples,0);
 assert.equal(inspect([frame(0,4),frame(1000,4)]).failures.length,0);
 assert.equal(inspect([frame(0,4),{event:'session-control',unixMs:100,data:{phase:'running'}},{event:'session-control',unixMs:200,data:{phase:'stopped'}},frame(1000,5)]).failures.length,0);
});
test('evidence checker catches resumed capture without native lease and analysis during suspension',()=>{
 const rows=[{event:'session-control',unixMs:0,data:{phase:'suspended'}},{event:'audio-counters',unixMs:1500,data:{packets:10,analyses:2}},{event:'audio-counters',unixMs:2500,data:{packets:11,analyses:3}},{event:'capture-stream-start',unixMs:3000,data:true}];
 assert.equal(inspect(rows).failures.length,2);
});
