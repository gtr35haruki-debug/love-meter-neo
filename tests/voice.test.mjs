import assert from 'node:assert/strict';
import {summarizeVoiceFrames,computeSpeechBalanceScore,computeTurnTakingScore,computeVoiceSessionMetrics} from '../src/voice.js?v=0.4.0b1';

const frames=[];
for(let i=0;i<100;i++)frames.push({tOffsetMs:i*100,rms:i%3===0?.01:.05,pitch:i%3===0?null:150+10*Math.sin(i/5),active:i%3!==0});
const summary=summarizeVoiceFrames(frames,{speechThreshold:.02});
assert.equal(summary.valid,true);assert(summary.speechRatio>.5);assert(Number.isFinite(summary.pitchResponseScore));assert(Number.isFinite(summary.expressivenessScore));
const bal=computeSpeechBalanceScore(.45,.50);assert.equal(bal.valid,true);assert(bal.score>90);
const a=[],b=[];for(let i=0;i<60;i++){const aOn=Math.floor(i/5)%2===0;a.push({tOffsetMs:i*200,rms:aOn?.06:.01,active:aOn});b.push({tOffsetMs:i*200,rms:aOn?.01:.06,active:!aOn});}
const tt=computeTurnTakingScore(a,b);assert.equal(tt.valid,true);assert(tt.turns>=8);assert(tt.score>70);
const rec=(q,side)=>({questionIndex:q,summary:{speechRatio:side==='A'?.45:.5,pitchResponseScore:60+q,expressivenessScore:70-q},frames:side==='A'?a:b});
const session=computeVoiceSessionMetrics([rec(0,'A'),rec(1,'A'),rec(2,'A')],[rec(0,'B'),rec(1,'B'),rec(2,'B')]);
assert.equal(session.valid,true);assert(Number.isFinite(session.voiceScore));assert(Number.isFinite(session.turnTaking));
console.log('voice metric tests passed');
