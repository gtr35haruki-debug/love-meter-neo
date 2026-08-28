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

import {computeSessionMetrics} from '../src/metrics.js';
const skipTimeline=[
  {phase:'BASELINE',durationSec:30,startOffsetMs:0,endOffsetMs:30000,setIndex:0,setId:'A',questionIndex:null,globalQuestionIndex:null,questionText:null},
  {phase:'QUESTION',durationSec:20,startOffsetMs:30000,endOffsetMs:50000,setIndex:0,setId:'A',questionIndex:0,globalQuestionIndex:0,questionText:'Q1'},
  {phase:'RESET',durationSec:10,startOffsetMs:50000,endOffsetMs:60000,setIndex:0,setId:'A',questionIndex:null,globalQuestionIndex:null,questionText:null},
  {phase:'QUESTION',durationSec:20,startOffsetMs:60000,endOffsetMs:80000,setIndex:0,setId:'A',questionIndex:1,globalQuestionIndex:1,questionText:'Q2'},
  {phase:'RESET',durationSec:10,startOffsetMs:80000,endOffsetMs:90000,setIndex:0,setId:'A',questionIndex:null,globalQuestionIndex:null,questionText:null},
  {phase:'QUESTION',durationSec:20,startOffsetMs:90000,endOffsetMs:110000,setIndex:0,setId:'A',questionIndex:2,globalQuestionIndex:2,questionText:'Q3'},
  {phase:'RECOVERY',durationSec:10,startOffsetMs:110000,endOffsetMs:120000,setIndex:0,setId:'A',questionIndex:null,globalQuestionIndex:null,questionText:null},
];
const fakeHr=Array.from({length:120},(_,i)=>({sessionElapsedMs:i*1000,bpm:70+(i%7),phase:'BASELINE'}));
const skippedResult=computeSessionMetrics({aSamples:fakeHr,bSamples:fakeHr,timeline:skipTimeline,protocolId:'EVENT_V2',skippedQuestionIndexes:[1]});
assert.equal(skippedResult.perQuestion.length,3);
assert.equal(skippedResult.perQuestion[1].skipped,true);
assert.equal(skippedResult.perQuestion[1].skipReason,'QUESTION_SKIPPED');
console.log('skipped question exclusion regression passed');
