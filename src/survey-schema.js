export const RELATIONSHIP_OPTIONS = ['恋人','友達','友達以上・恋人未満','親子','兄弟・姉妹','夫婦','初対面','その他','回答しない'];

export const PRE_RELATIONSHIP_ITEMS = [
  {id:'R1', question:'この相手に親しさを感じますか？', low:'まったく当てはまらない', high:'とても当てはまる'},
  {id:'R2', question:'この相手と一緒にいると安心できますか？', low:'まったく当てはまらない', high:'とても当てはまる'},
  {id:'R3', question:'この相手とは自然に会話できますか？', low:'まったく当てはまらない', high:'とても当てはまる'},
  {id:'R4', question:'この相手の前で自然体でいられますか？', low:'まったく当てはまらない', high:'とても当てはまる'},
  {id:'R5', question:'この相手を信頼していますか？', low:'まったく当てはまらない', high:'とても当てはまる'},
  {id:'R6', question:'この相手との現在の関係に満足していますか？', low:'まったく当てはまらない', high:'とても当てはまる'},
  {id:'R7', question:'この相手は自分にとって大切な存在だと感じますか？', low:'まったく当てはまらない', high:'とても当てはまる'},
  {id:'R8', question:'これからもこの相手と関わっていきたいと思いますか？', low:'まったく当てはまらない', high:'とても当てはまる'},
];

export const PRE_STATE_ITEMS = [
  {id:'S1', question:'今、緊張していますか？', low:'まったく緊張していない', high:'とても緊張している'},
  {id:'S2', question:'今の体調は良いですか？', low:'とても悪い', high:'とても良い'},
];

export const OPTIONAL_ITEM = {
  id:'O1', question:'この相手に恋愛的な関心を感じますか？', low:'まったく感じない', high:'とても強く感じる'
};

export const CONDITION_OPTIONS = [
  {value:'recent_vigorous_exercise', label:'直前30分以内に息が上がる程度の運動をした'},
  {value:'environment_discomfort', label:'現在、暑い・寒いなど環境による不快感が強い'},
  {value:'sensor_discomfort', label:'センサー装着部に違和感がある'},
  {value:'none', label:'特になし'},
];

export const POST_ITEMS = [
  {id:'P1', question:'今回の質問に答えるとき、どのくらい緊張しましたか？', low:'まったく緊張しなかった', high:'とても緊張した'},
  {id:'P2', question:'今回の会話は、普段の二人の会話にどのくらい近かったですか？', low:'まったく普段と違う', high:'ほぼ普段どおり'},
  {id:'P3', question:'質問によって、自分の気持ちや心拍が変化したと感じましたか？', low:'まったく感じなかった', high:'とても強く感じた'},
  {id:'P4', question:'測定中の会話や質問にどのくらい集中できましたか？', low:'ほとんど集中できなかった', high:'とても集中できた'},
];

export const CONSENT_TEXT = {
  title:'研究参加の確認',
  body:[
    'この研究では、二人に同じ質問を提示したときの心拍の変化を記録し、反応の方向・大きさ・タイミングと、関係性についての自己評価との関連を調べます。',
    '記録するものは、心拍数・時刻情報・アンケート回答・計測条件です。',
    'NEO SCOREは医学的診断や、二人の相性・恋愛感情を正確に判定するものではありません。',
    '個別のアンケート回答は相手には表示されません。参加は自由で、途中でやめることもできます。任意項目は回答しなくても構いません。',
  ],
  checkbox:'説明を読み、内容を理解したうえで研究参加に同意します。'
};
