const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {defineSecret}=require('firebase-functions/params');
const admin=require('firebase-admin');
const crypto=require('crypto');
admin.initializeApp();

const RECORDS_PIN_HASH=defineSecret('RECORDS_PIN_HASH');
const OPENAI_API_KEY=defineSecret('OPENAI_API_KEY');
const HASH_PREFIX='love-meter-neo-records-v1:';
const OPENAI_BASE='https://api.openai.com/v1';
const ANALYSIS_MODEL=process.env.AI_ANALYSIS_MODEL||'gpt-6-astra';

function hashPin(pin){return crypto.createHash('sha256').update(HASH_PREFIX+String(pin)).digest('hex');}
function safeEqualHex(a,b){
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  return crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}

exports.verifyRecordsPin=onCall({secrets:[RECORDS_PIN_HASH]},async req=>{
  if(!req.auth)throw new HttpsError('unauthenticated','Authentication required.');
  const uid=req.auth.uid; const pin=String(req.data?.pin||'');
  if(!/^\d{4,12}$/.test(pin))throw new HttpsError('invalid-argument','Invalid PIN format.');
  const ref=admin.database().ref(`security/records_pin_attempts/${uid}`);
  const snap=await ref.get(); const attempt=snap.val()||{}; const now=Date.now();
  if(attempt.lockUntil&&attempt.lockUntil>now)throw new HttpsError('resource-exhausted','Temporarily locked.');
  const ok=safeEqualHex(hashPin(pin),RECORDS_PIN_HASH.value());
  if(!ok){
    const failures=(attempt.failures||0)+1; const lockUntil=failures>=5?now+10*60*1000:null;
    await ref.set({failures:lockUntil?0:failures,lockUntil,lastFailureAt:now});
    throw new HttpsError('permission-denied','PIN is incorrect.');
  }
  await ref.remove();
  const user=await admin.auth().getUser(uid); const claims=user.customClaims||{};
  const recordsUntil=now+30*60*1000;
  await admin.auth().setCustomUserClaims(uid,{...claims,recordsUntil});
  return {ok:true,recordsUntil};
});

async function openaiFetch(path,options={}){
  const res=await fetch(`${OPENAI_BASE}${path}`,{...options,headers:{Authorization:`Bearer ${OPENAI_API_KEY.value()}`,...(options.headers||{})}});
  const text=await res.text();let body;
  try{body=JSON.parse(text);}catch{body={raw:text};}
  if(!res.ok){
    console.error('OpenAI request failed',res.status,body?.error?.type||'unknown');
    throw new HttpsError('internal',`AI request failed (${res.status}).`);
  }
  return body;
}

function extractResponseText(body){
  if(typeof body?.output_text==='string')return body.output_text;
  for(const item of body?.output||[])for(const content of item?.content||[])if(typeof content?.text==='string')return content.text;
  return '';
}

async function structuredResponse({instructions,input,name,schema}){
  const body=await openaiFetch('/responses',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      model:ANALYSIS_MODEL,
      instructions,
      input,
      text:{format:{type:'json_schema',name,strict:true,schema}},
    }),
  });
  const text=extractResponseText(body);
  try{return JSON.parse(text);}catch{throw new HttpsError('internal','AI returned an unreadable structured response.');}
}


async function transcribeAudioBuffer({audio,mimeType='audio/webm',side='?'}){
  const form=new FormData();
  form.append('file',new Blob([audio],{type:mimeType}),'love-meter-question.webm');
  form.append('model','gpt-transcribe');
  form.append('prompt',`日本語の短い二人会話です。このファイルは参加者${side}の口元マイクです。LOVE METER、心拍、ダイフェスタ等の固有語が出ることがあります。主にこのマイクの装着者の発話を忠実に文字起こししてください。遠くの相手の声や重複した回り込み音は、明瞭でない限り補完しないでください。`);
  const transcriptBody=await openaiFetch('/audio/transcriptions',{method:'POST',body:form});
  return String(transcriptBody?.text||'').trim();
}

exports.transcribeParticipantAudio=onCall({secrets:[OPENAI_API_KEY],timeoutSeconds:60,memory:'512MiB'},async req=>{
  if(!req.auth)throw new HttpsError('unauthenticated','Authentication required.');
  const audioBase64=String(req.data?.audioBase64||'');
  const mimeType=String(req.data?.mimeType||'audio/webm').slice(0,80);
  const side=String(req.data?.side||'').toUpperCase()==='B'?'B':'A';
  if(!audioBase64)throw new HttpsError('invalid-argument','Audio is required.');
  const audio=Buffer.from(audioBase64,'base64');
  if(!audio.length||audio.length>4*1024*1024)throw new HttpsError('invalid-argument','Audio size is invalid.');
  const transcript=await transcribeAudioBuffer({audio,mimeType,side});
  return {ok:true,side,transcript,transcriptionModel:'gpt-transcribe'};
});

exports.analyzeConversationTranscripts=onCall({secrets:[OPENAI_API_KEY],timeoutSeconds:30,memory:'256MiB'},async req=>{
  if(!req.auth)throw new HttpsError('unauthenticated','Authentication required.');
  const questionText=String(req.data?.questionText||'').slice(0,500);
  const transcriptA=String(req.data?.transcriptA||'').slice(0,6000).trim();
  const transcriptB=String(req.data?.transcriptB||'').slice(0,6000).trim();
  if(!transcriptA&&!transcriptB)return {ok:true,analysis:null,bonus:0};
  const schema={type:'object',additionalProperties:false,properties:{
    questionEngagement:{type:'integer',minimum:0,maximum:100},
    mutualResponse:{type:'integer',minimum:0,maximum:100},
    selfDisclosure:{type:'integer',minimum:0,maximum:100},
    emotionalExpression:{type:'integer',minimum:0,maximum:100},
    conversationalRichness:{type:'integer',minimum:0,maximum:100},
    bonus:{type:'integer',minimum:0,maximum:2},
    summary:{type:'string',maxLength:120},
    evidence:{type:'array',items:{type:'string',maxLength:80},maxItems:3},
  },required:['questionEngagement','mutualResponse','selfDisclosure','emotionalExpression','conversationalRichness','bonus','summary','evidence']};
  const analysis=await structuredResponse({
    name:'love_meter_dual_talk_analysis',schema,
    instructions:[
      'あなたはLOVE METERの会話内容分析モジュールです。',
      'A/Bは別々の口元マイクの文字起こしです。各トラックは主にその参加者の発話を示します。',
      'マイクの回り込みで同じ発話が両方に重複している可能性があります。明らかな重複は会話往復として二重計上しないでください。',
      '文字起こしに実際に現れている会話特徴だけを評価してください。',
      '恋愛感情、親密さ、相性、性格、関係の良し悪しを推測・断定してはいけません。',
      'questionEngagementは質問に沿って話している程度、mutualResponseは相手の発話を受けた応答の程度を評価します。',
      'bonusはエンタメ用の小さな加点です。0=特徴が読み取りにくい、1=会話特徴がある、2=複数の明確な特徴がある。',
      'summaryとevidenceは短い日本語にしてください。',
    ].join('\\n'),
    input:`質問: ${questionText||'（不明）'}\\n\\n参加者Aの主音声文字起こし:\\n${transcriptA||'（なし）'}\\n\\n参加者Bの主音声文字起こし:\\n${transcriptB||'（なし）'}`,
  });
  return {ok:true,analysis,bonus:analysis.bonus,model:ANALYSIS_MODEL};
});

exports.analyzeConversation=onCall({secrets:[OPENAI_API_KEY],timeoutSeconds:60,memory:'512MiB'},async req=>{
  if(!req.auth)throw new HttpsError('unauthenticated','Authentication required.');
  const audioBase64=String(req.data?.audioBase64||'');
  const mimeType=String(req.data?.mimeType||'audio/webm').slice(0,80);
  const questionText=String(req.data?.questionText||'').slice(0,500);
  if(!audioBase64)throw new HttpsError('invalid-argument','Audio is required.');
  const audio=Buffer.from(audioBase64,'base64');
  if(!audio.length||audio.length>4*1024*1024)throw new HttpsError('invalid-argument','Audio size is invalid.');

  const form=new FormData();
  form.append('file',new Blob([audio],{type:mimeType}),'love-meter-question.webm');
  form.append('model','gpt-transcribe');
  form.append('prompt','日本語の短い二人会話です。LOVE METER、心拍、ダイフェスタ等の固有語が出ることがあります。聞こえた内容を忠実に文字起こししてください。');
  const transcriptBody=await openaiFetch('/audio/transcriptions',{method:'POST',body:form});
  const transcript=String(transcriptBody?.text||'').trim();
  if(!transcript)return {ok:true,transcript:'',analysis:null,bonus:0};

  const schema={type:'object',additionalProperties:false,properties:{
    questionEngagement:{type:'integer',minimum:0,maximum:100},
    selfDisclosure:{type:'integer',minimum:0,maximum:100},
    emotionalExpression:{type:'integer',minimum:0,maximum:100},
    conversationalRichness:{type:'integer',minimum:0,maximum:100},
    bonus:{type:'integer',minimum:0,maximum:2},
    summary:{type:'string',maxLength:120},
    evidence:{type:'array',items:{type:'string',maxLength:80},maxItems:3},
  },required:['questionEngagement','selfDisclosure','emotionalExpression','conversationalRichness','bonus','summary','evidence']};
  const analysis=await structuredResponse({
    name:'love_meter_talk_analysis',schema,
    instructions:[
      'あなたはLOVE METERの会話内容分析モジュールです。',
      '文字起こしに実際に現れている会話特徴だけを評価してください。',
      '恋愛感情、親密さ、相性、性格、関係の良し悪しを推測・断定してはいけません。',
      '話者分離がないため、誰が何を言ったかを推測せず、会話全体として評価してください。',
      'bonusはエンタメ用の小さな加点です。0=特徴が読み取りにくい、1=会話特徴がある、2=複数の明確な特徴がある。',
      'summaryとevidenceは短い日本語にしてください。',
    ].join('\n'),
    input:`質問: ${questionText||'（不明）'}\n\n文字起こし:\n${transcript.slice(0,9000)}`,
  });
  return {ok:true,transcript,analysis,bonus:analysis.bonus,model:ANALYSIS_MODEL,transcriptionModel:'gpt-transcribe'};
});

exports.generateResultComment=onCall({secrets:[OPENAI_API_KEY],timeoutSeconds:30,memory:'256MiB'},async req=>{
  if(!req.auth)throw new HttpsError('unauthenticated','Authentication required.');
  const heart=Number(req.data?.heartScore),voice=Number(req.data?.voiceScore),bonus=Number(req.data?.aiTalkBonus||0),final=Number(req.data?.finalScore);
  const highlights=Array.isArray(req.data?.highlights)?req.data.highlights.slice(0,6).map(x=>String(x).slice(0,80)):[];
  const seed=String(req.data?.variationSeed||Math.floor(Math.random()*100000));
  const schema={type:'object',additionalProperties:false,properties:{comment:{type:'string',minLength:8,maxLength:70},vibe:{type:'string',enum:['spark','warm','playful','cool']}},required:['comment','vibe']};
  return structuredResponse({
    name:'love_meter_result_comment',schema,
    instructions:[
      'LOVE METERの結果画面に出す、カラオケ採点画面のような楽しい一言コメントを1つ作ってください。',
      '結果データと矛盾しない内容にしてください。',
      '恋愛感情、親密さ、相性、将来の関係を断定しないでください。',
      '「〜かも！」「いいテンポ！」「ドキドキ強め！」のような軽い表現は可能です。',
      '低い点数でも否定的・傷つける表現にしないでください。',
      '毎回少し表現を変えてください。20〜35文字程度を目安にします。',
    ].join('\n'),
    input:JSON.stringify({heartScore:Number.isFinite(heart)?heart:null,voiceScore:Number.isFinite(voice)?voice:null,aiTalkBonus:bonus,finalScore:Number.isFinite(final)?final:null,highlights,variationSeed:seed}),
  });
});
