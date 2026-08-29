import assert from 'node:assert/strict';
import {EVENT_QUESTION_BANK_V3,EVENT_RELATIONSHIP_CATEGORIES,getQuestionBankForProtocol} from '../src/question-bank.js';
import {buildTimeline,PROTOCOLS,isEventProtocol} from '../src/protocols.js';

assert.deepEqual(EVENT_RELATIONSHIP_CATEGORIES,['恋人','友達','親子','兄弟・姉妹','夫婦','初対面']);
let total=0;
for(const category of EVENT_RELATIONSHIP_CATEGORIES){
  const sets=EVENT_QUESTION_BANK_V3[category];
  assert.ok(sets,`${category} missing`);
  assert.deepEqual(Object.keys(sets),['A','B','C']);
  for(const id of ['A','B','C']){assert.equal(sets[id].length,3,`${category}/${id}`); total+=sets[id].length;}
}
assert.equal(total,54);
assert.equal(getQuestionBankForProtocol('EVENT_V2'),EVENT_QUESTION_BANK_V3);
assert.equal(EVENT_QUESTION_BANK_V3['恋人'].A[0],'初めて会ったときの相手の印象は？');
assert.equal(EVENT_QUESTION_BANK_V3['初対面'].A[0],'好きな食べ物は？ お互いに教えてください。');
assert.equal(EVENT_QUESTION_BANK_V3['夫婦'].C[2],'これから二人で楽しみにしていることは？');

const timeline=buildTimeline('EVENT_V2','A',EVENT_QUESTION_BANK_V3['恋人']);
assert.equal(timeline.length,7);
assert.equal(timeline.at(-1).endOffsetMs,120000);
assert.equal(timeline.filter(x=>x.phase==='QUESTION').length,3);
assert.deepEqual(timeline.filter(x=>x.phase==='QUESTION').map(x=>x.questionText),EVENT_QUESTION_BANK_V3['恋人'].A);
assert.equal(PROTOCOLS.EVENT_V2.acclimationSec,0);
assert.equal(isEventProtocol('EVENT_V2'),true);
console.log('EVENT_V2 question/timing tests passed');
