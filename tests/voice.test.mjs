import assert from 'node:assert/strict';
import {summarizeVoiceFrames,compareVoiceToBaseline,computeSpeechBalanceScore,computeTurnTakingScore,computeVoiceSessionMetrics,classifySpeakerTimeline,summarizeSpeakerTimeline} from '../src/voice.js?v=0.4.0b4';

const frames=[];
for(let i=0;i<100;i++)frames.push({tOffsetMs:i*100,rms:i%3===0?.01:.05,pitch:i%3===0?null:150+10*Math.sin(i/5),active:i%3!==0});
const summary=summarizeVoiceFrames(frames,{speechThreshold:.02});
assert.equal(summary.valid,true);assert(summary.speechRatio>.5);assert(Number.isFinite(summary.pitchVariabilityScore));assert(Number.isFinite(summary.expressivenessRawScore));
const baseline={...summary,pitchMeanHz:120,pitchStdHz:5,rmsMean:.04,pitchRangeRatio:.12,rmsCv:.25};
const question={...summary,pitchMeanHz:132,rmsMean:.05,pitchRangeRatio:.18,rmsCv:.35};
const rel=compareVoiceToBaseline(question,baseline);
assert.equal(rel.baselineValid,true);assert(Math.abs(rel.pitchDeltaPct-10)<0.001);assert.equal(rel.pitchDirection,'UP');assert(Number.isFinite(rel.pitchResponseScore));assert(Number.isFinite(rel.expressivenessScore));
const highBaseline=compareVoiceToBaseline({...question,pitchMeanHz:202},{...baseline,pitchMeanHz:190});
assert(rel.pitchResponseScore>highBaseline.pitchResponseScore); // 120->132 (10%) > 190->202 (~6.3%)
const bal=computeSpeechBalanceScore(.45,.50);assert.equal(bal.valid,true);assert(bal.score>90);
const a=[],b=[];for(let i=0;i<60;i++){const aOn=Math.floor(i/5)%2===0;a.push({tOffsetMs:i*200,rms:aOn?.06:.01,active:aOn});b.push({tOffsetMs:i*200,rms:aOn?.01:.06,active:!aOn});}
const tt=computeTurnTakingScore(a,b);assert.equal(tt.valid,true);assert(tt.turns>=8);assert(tt.score>70);
const rec=(q,side)=>({questionIndex:q,summary:{speechRatio:side==='A'?.45:.5,pitchResponseScore:60+q,expressivenessScore:70-q},frames:side==='A'?a:b});
const session=computeVoiceSessionMetrics([rec(0,'A'),rec(1,'A'),rec(2,'A')],[rec(0,'B'),rec(1,'B'),rec(2,'B')]);
assert.equal(session.valid,true);assert(Number.isFinite(session.voiceScore));assert(Number.isFinite(session.turnTaking));
console.log('voice baseline-relative metric tests passed');

const ca=[
  {phaseElapsedMs:0,rms:.06,pitch:130,active:true},{phaseElapsedMs:200,rms:.06,pitch:132,active:true},{phaseElapsedMs:400,rms:.01,pitch:null,active:false},{phaseElapsedMs:600,rms:.055,pitch:145,active:true},{phaseElapsedMs:800,rms:.01,pitch:null,active:false}
];
const cb=[
  {phaseElapsedMs:0,rms:.012,pitch:null,active:false},{phaseElapsedMs:200,rms:.02,pitch:131,active:true},{phaseElapsedMs:400,rms:.06,pitch:195,active:true},{phaseElapsedMs:600,rms:.052,pitch:205,active:true},{phaseElapsedMs:800,rms:.01,pitch:null,active:false}
];
const classified=classifySpeakerTimeline(ca,cb,{thresholdA:.018,thresholdB:.018});
assert.equal(classified[0].speaker,'A');
assert(['A','UNKNOWN'].includes(classified[1].speaker)); // same voice leaking into both channels
assert.equal(classified[2].speaker,'B');
assert.equal(classified[3].speaker,'BOTH');
assert.equal(classified[4].speaker,'SILENCE');
const stats=summarizeSpeakerTimeline(classified);assert.equal(stats.total,5);assert(stats.counts.SILENCE>=1);
console.log('dual-mic five-state speaker classification tests passed');
