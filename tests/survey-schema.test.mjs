import assert from 'node:assert/strict';
import {PRE_RELATIONSHIP_ITEMS,PRE_STATE_ITEMS,POST_ITEMS,OPTIONAL_ITEM,RELATIONSHIP_OPTIONS,CONDITION_OPTIONS} from '../src/survey-schema.js';
const expectedR=[
  'この相手に親しさを感じますか？',
  'この相手と一緒にいると安心できますか？',
  'この相手とは自然に会話できますか？',
  'この相手の前で自然体でいられますか？',
  'この相手を信頼していますか？',
  'この相手との現在の関係に満足していますか？',
  'この相手は自分にとって大切な存在だと感じますか？',
  'これからもこの相手と関わっていきたいと思いますか？',
];
const expectedS=['今、緊張していますか？','今の体調は良いですか？'];
const expectedP=[
  '今回の質問に答えるとき、どのくらい緊張しましたか？',
  '今回の会話は、普段の二人の会話にどのくらい近かったですか？',
  '質問によって、自分の気持ちや心拍が変化したと感じましたか？',
  '測定中の会話や質問にどのくらい集中できましたか？',
];
assert.deepEqual(PRE_RELATIONSHIP_ITEMS.map(x=>x.question),expectedR);
assert.deepEqual(PRE_STATE_ITEMS.map(x=>x.question),expectedS);
assert.deepEqual(POST_ITEMS.map(x=>x.question),expectedP);
assert.equal(OPTIONAL_ITEM.question,'この相手に恋愛的な関心を感じますか？');
assert.deepEqual(RELATIONSHIP_OPTIONS,['恋人','友達','友達以上・恋人未満','親子','兄弟・姉妹','夫婦','初対面','その他','回答しない']);
assert.deepEqual(CONDITION_OPTIONS.map(x=>x.label),[
  '直前30分以内に息が上がる程度の運動をした',
  '現在、暑い・寒いなど環境による不快感が強い',
  'センサー装着部に違和感がある',
  '特になし',
]);
console.log('survey schema tests passed');
