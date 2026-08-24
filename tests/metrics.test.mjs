import assert from 'node:assert/strict';
import {directionMetric,balanceMetric,temporalMetric,resampleOneHz} from '../src/metrics.js';

const make = (vals) => vals.map((d,i)=>({elapsedMs:i*1000,deltaHr3:d,cleanBpm:70+d}));
const a=make([0,0,3,3,-3,-3,3,3,0,0,3,3,-3,-3,3,3,0,0,3,3,-3,-3,3,3,0,0,3,3,-3,-3,3,3,0,0,3,3,-3,-3,3,3]);
const b=make([0,0,4,4,-4,-4,4,4,0,0,4,4,-4,-4,4,4,0,0,4,4,-4,-4,4,4,0,0,4,4,-4,-4,4,4,0,0,4,4,-4,-4,4,4]);
const d=directionMetric(a,b,0,40000,true);
assert.equal(d.valid,true);
assert.equal(Math.round(d.directionSync),100);
const bal=balanceMetric(2,2);
assert.equal(Math.round(bal.balance),100);
const t=temporalMetric(a,b,0,40000,true);
assert.equal(t.valid,true);
assert.ok(t.rMax>0.95);
console.log('metrics tests passed');


// Pilot regression: jitter around a second boundary must not create false 1 Hz gaps.
const jittered=[490,1480,2471,3460,4450,5575,6475,7465].map((sessionElapsedMs,i)=>({sessionElapsedMs,bpm:70+i,phase:'BASELINE'}));
const grid=resampleOneHz(jittered,650);
assert.equal(grid.length,8);
assert.deepEqual(grid.map(x=>x.elapsedMs),[0,1000,2000,3000,4000,5000,6000,7000]);
console.log('1 Hz jitter regression passed');
