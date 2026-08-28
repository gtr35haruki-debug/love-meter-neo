import assert from 'node:assert/strict';
import {EVENT_QUESTION_BANK_V2,EVENT_RELATIONSHIP_CATEGORIES,getQuestionBankForProtocol} from '../src/question-bank.js';
import {buildTimeline,PROTOCOLS,isEventProtocol} from '../src/protocols.js';

assert.deepEqual(EVENT_RELATIONSHIP_CATEGORIES,['初対面','友達','親子','兄弟・姉妹','夫婦']);
let total=0;
for(const category of EVENT_RELATIONSHIP_CATEGORIES){
  const sets=EVENT_QUESTION_BANK_V2[category];
  assert.ok(sets,`${category} missing`);
  assert.deepEqual(Object.keys(sets),['A','B','C']);
  for(const id of ['A','B','C']){assert.equal(sets[id].length,3,`${category}/${id}`); total+=sets[id].length;}
}
assert.equal(total,45);
assert.equal(getQuestionBankForProtocol('EVENT_V2'),EVENT_QUESTION_BANK_V2);
assert.equal(EVENT_QUESTION_BANK_V2['初対面'].A[0],'好きな食べ物は？ お互いに教えてください。');
assert.equal(EVENT_QUESTION_BANK_V2['夫婦'].C[2],'これから二人で楽しみにしていることは？');

const timeline=buildTimeline('EVENT_V2','A',EVENT_QUESTION_BANK_V2['親子']);
assert.equal(timeline.length,7);
assert.equal(timeline.at(-1).endOffsetMs,120000);
assert.equal(timeline.filter(x=>x.phase==='QUESTION').length,3);
assert.deepEqual(timeline.filter(x=>x.phase==='QUESTION').map(x=>x.questionText),EVENT_QUESTION_BANK_V2['親子'].A);
assert.equal(PROTOCOLS.EVENT_V2.acclimationSec,0);
assert.equal(isEventProtocol('EVENT_V2'),true);
console.log('EVENT_V2 question/timing tests passed');
