import test from 'node:test';
import assert from 'node:assert/strict';
import { drawingKinds } from '../dist/visuals/kaleidoscope-layout.js';

test('all illustrations are used and every touching tile has disjoint drawings', () => {
  const seen=new Set();
  for (const variety of [0,0.2,0.5,0.99,1,2]) {
    for(let y=-96;y<160;y++) for(let x=-9;x<17;x++) {
      const own=drawingKinds(x,y,variety);
      assert.equal(new Set(own).size,3,'companions and main drawing must differ');
      own.forEach(id=>seen.add(id));
      for(const [dx,dy] of [[1,0],[0,1],[1,1],[-1,1]]) {
        const neighbor=drawingKinds(x+dx,y+dy,variety);
        assert.ok(own.every(id=>!neighbor.includes(id)),`repeat at ${x},${y} / ${dx},${dy}`);
      }
      assert.deepEqual(drawingKinds(x+8,y-1,variety),own,'angular wrap must retain identity');
    }
  }
  assert.deepEqual([...seen].sort((a,b)=>a-b),Array.from({length:40},(_,i)=>i));
});
