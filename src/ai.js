import { CONFIG } from './config.js?v=0.4.0b5';

/**
 * LOVE METER NEO local AI runtime.
 * - ASR: Transformers.js + multilingual Whisper, runs in the participant browser.
 * - Talk analysis/comment: Transformers.js + Qwen2.5-0.5B-Instruct, runs in the controller browser.
 * - No participant audio is sent to an AI API. Model files are downloaded from CDN/Hugging Face on first use and cached by the browser.
 */

const status={
  asr:'IDLE', text:'IDLE', asrProgress:0, textProgress:0,
  asrMessage:'未準備', textMessage:'未準備', error:null,
  asrDevice:null,textDevice:null,
};
const listeners=new Set();
let transformersPromise=null,transcriberPromise=null,generatorPromise=null;

function emit(){const snapshot=getLocalAiStatus();for(const fn of listeners){try{fn(snapshot);}catch{}}}
function patch(next){Object.assign(status,next);emit();}
export function getLocalAiStatus(){return {...status};}
export function subscribeLocalAiStatus(fn){listeners.add(fn);try{fn(getLocalAiStatus());}catch{}return()=>listeners.delete(fn);}

function progressPct(x){
  const p=Number(x?.progress);
  if(Number.isFinite(p))return Math.max(0,Math.min(100,p));
  return null;
}
function progressLabel(x){
  const name=x?.file||x?.name||x?.status||'モデル';
  const pct=progressPct(x);
  return pct==null?String(name):`${name} ${Math.round(pct)}%`;
}

async function getTransformers(){
  if(transformersPromise)return transformersPromise;
  const v=CONFIG.ai?.local?.transformersVersion||'4.0.1';
  transformersPromise=import(`https://cdn.jsdelivr.net/npm/@huggingface/transformers@${v}`);
  return transformersPromise;
}

function hasWebGpu(){return !!globalThis.navigator?.gpu;}

async function loadAsr(){
  if(transcriberPromise)return transcriberPromise;
  patch({asr:'LOADING',asrProgress:0,asrMessage:'音声認識AIを読み込み中…',error:null});
  transcriberPromise=(async()=>{
    const {pipeline,env}=await getTransformers();
    env.allowLocalModels=false;
    const model=CONFIG.ai.local.asrModel;
    const callback=x=>{const pct=progressPct(x);patch({asrProgress:pct??status.asrProgress,asrMessage:progressLabel(x)});};
    if(CONFIG.ai.local.preferWebGPU&&hasWebGpu()){
      try{
        const pipe=await pipeline('automatic-speech-recognition',model,{device:'webgpu',dtype:'q4',progress_callback:callback});
        patch({asr:'READY',asrProgress:100,asrMessage:'音声認識AI READY（WebGPU）',asrDevice:'webgpu'});return pipe;
      }catch(e){console.warn('Local ASR WebGPU load failed; falling back to WASM',e);}
    }
    const pipe=await pipeline('automatic-speech-recognition',model,{device:'wasm',dtype:'q8',progress_callback:callback});
    patch({asr:'READY',asrProgress:100,asrMessage:'音声認識AI READY（CPU/WASM）',asrDevice:'wasm'});return pipe;
  })().catch(e=>{transcriberPromise=null;patch({asr:'ERROR',asrMessage:'音声認識AIの準備に失敗',error:String(e?.message||e)});throw e;});
  return transcriberPromise;
}

async function loadTextGenerator(){
  if(generatorPromise)return generatorPromise;
  patch({text:'LOADING',textProgress:0,textMessage:'会話分析AIを読み込み中…',error:null});
  generatorPromise=(async()=>{
    const {pipeline,env}=await getTransformers();
    env.allowLocalModels=false;
    const model=CONFIG.ai.local.textModel;
    const callback=x=>{const pct=progressPct(x);patch({textProgress:pct??status.textProgress,textMessage:progressLabel(x)});};
    if(CONFIG.ai.local.preferWebGPU&&hasWebGpu()){
      try{
        const pipe=await pipeline('text-generation',model,{device:'webgpu',dtype:'q4f16',progress_callback:callback});
        patch({text:'READY',textProgress:100,textMessage:'会話分析AI READY（WebGPU）',textDevice:'webgpu'});return pipe;
      }catch(e){console.warn('Local text WebGPU load failed; falling back to WASM',e);}
    }
    const pipe=await pipeline('text-generation',model,{device:'wasm',dtype:'q8',progress_callback:callback});
    patch({text:'READY',textProgress:100,textMessage:'会話分析AI READY（CPU/WASM・低速）',textDevice:'wasm'});return pipe;
  })().catch(e=>{generatorPromise=null;patch({text:'ERROR',textMessage:'会話分析AIの準備に失敗',error:String(e?.message||e)});throw e;});
  return generatorPromise;
}

export async function prepareLocalAi({asr=true,text=false}={}){
  const jobs=[];
  if(asr)jobs.push(loadAsr());
  if(text)jobs.push(loadTextGenerator());
  await Promise.all(jobs);
  return getLocalAiStatus();
}

async function blobToMono16k(blob){
  if(!blob?.size)throw new Error('音声データがありません。');
  const bytes=await blob.arrayBuffer();
  const Ctx=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!Ctx)throw new Error('このブラウザは音声デコードに対応していません。');
  let ctx;
  try{ctx=new Ctx({sampleRate:16000});}catch{ctx=new Ctx();}
  try{
    const decoded=await ctx.decodeAudioData(bytes.slice(0));
    const srcRate=decoded.sampleRate,channels=decoded.numberOfChannels,length=decoded.length;
    const mono=new Float32Array(length);
    for(let c=0;c<channels;c++){
      const ch=decoded.getChannelData(c);
      for(let i=0;i<length;i++)mono[i]+=ch[i]/channels;
    }
    if(srcRate===16000)return mono;
    const outLen=Math.max(1,Math.round(mono.length*16000/srcRate));
    const out=new Float32Array(outLen),ratio=srcRate/16000;
    for(let i=0;i<outLen;i++){
      const pos=i*ratio,j=Math.floor(pos),f=pos-j;
      const a=mono[Math.min(j,mono.length-1)],b=mono[Math.min(j+1,mono.length-1)];
      out[i]=a+(b-a)*f;
    }
    return out;
  }finally{try{await ctx.close();}catch{}}
}

function trimTranscript(text=''){
  return String(text||'').replace(/\s+/g,' ').trim();
}

export async function transcribeParticipantAudio({blob,sessionId,questionIndex,questionText,side}){
  if(!CONFIG.ai.enabled||!blob?.size)return null;
  if(blob.size>CONFIG.ai.maxAudioBytes)throw new Error('音声データが上限を超えました。');
  const transcriber=await loadAsr();
  const audio=await blobToMono16k(blob);
  const out=await transcriber(audio,{
    language:CONFIG.ai.local.asrLanguage||'japanese',
    task:CONFIG.ai.local.asrTask||'transcribe',
    return_timestamps:true,
    chunk_length_s:30,
    stride_length_s:3,
  });
  const transcript=trimTranscript(out?.text||'');
  return {
    ok:true,side,transcript,
    chunks:Array.isArray(out?.chunks)?out.chunks.slice(0,80):[],
    transcriptionModel:CONFIG.ai.local.asrModel,
    aiRuntime:'LOCAL_TRANSFORMERS_JS',
    aiDevice:status.asrDevice,
    sessionId,questionIndex,questionText,
  };
}

function generatedText(result){
  const x=Array.isArray(result)?result[0]?.generated_text:result?.generated_text;
  if(typeof x==='string')return x.trim();
  if(Array.isArray(x)){
    for(let i=x.length-1;i>=0;i--)if(x[i]?.role==='assistant'&&typeof x[i]?.content==='string')return x[i].content.trim();
  }
  return '';
}
function parseJsonLoose(text){
  const cleaned=String(text||'').replace(/```(?:json)?/gi,'').replace(/```/g,'').trim();
  try{return JSON.parse(cleaned);}catch{}
  const a=cleaned.indexOf('{'),b=cleaned.lastIndexOf('}');
  if(a>=0&&b>a){try{return JSON.parse(cleaned.slice(a,b+1));}catch{}}
  return null;
}
function int100(v){const n=Math.round(Number(v));return Number.isFinite(n)?Math.max(0,Math.min(100,n)):0;}
function int2(v){const n=Math.round(Number(v));return Number.isFinite(n)?Math.max(0,Math.min(2,n)):0;}
function short(s,n){return String(s||'').replace(/\s+/g,' ').trim().slice(0,n);}

async function generate(messages,{maxNewTokens=220,doSample=false,temperature=0.2,repetitionPenalty=1.08,topP=0.9}={}){
  const gen=await loadTextGenerator();
  const result=await gen(messages,{max_new_tokens:maxNewTokens,do_sample:doSample,temperature,top_p:topP,repetition_penalty:repetitionPenalty,return_full_text:false});
  return generatedText(result);
}

const ANALYSIS_KEYS=['questionEngagement','mutualResponse','selfDisclosure','emotionalExpression','conversationalRichness'];
function suspiciousGeneratedText(input,{minJapanese=4,maxDigits=8,maxLen=90}={}){
  const text=String(input||'').replace(/\s+/g,' ').trim();
  if(!text||text.length>maxLen)return {ok:false,reason:'LENGTH'};
  const jp=(text.match(/[ぁ-んァ-ヶ一-龠々ー]/g)||[]).length;
  if(jp<minJapanese)return {ok:false,reason:'TOO_LITTLE_JAPANESE'};
  const digits=(text.match(/[0-9０-９]/g)||[]).length;
  if(digits>maxDigits||digits/Math.max(1,text.length)>0.18)return {ok:false,reason:'TOO_MANY_DIGITS'};
  if(/\b[A-Z]{5,}\b/.test(text))return {ok:false,reason:'UNEXPECTED_UPPERCASE_TOKEN'};
  if(/([0-9０-９]{1,4})(?:[^0-9０-９]{0,8}\1){2,}/.test(text))return {ok:false,reason:'REPEATED_NUMBER'};
  if(/(.{2,10})\1\1/u.test(text))return {ok:false,reason:'REPEATED_PHRASE'};
  const compact=[...text.replace(/[\s、。！？!?,.「」『』（）()・:：]/g,'')];
  if(compact.length>=18&&new Set(compact).size/compact.length<0.28)return {ok:false,reason:'LOW_CHARACTER_DIVERSITY'};
  return {ok:true,text};
}
export function validateResultCommentText(input){
  const text=String(input||'').replace(/^['\"「『]+|['\"」』]+$/g,'').replace(/\s+/g,' ').trim();
  if(text.length<8||text.length>60)return {ok:false,reason:'COMMENT_LENGTH',text};
  return suspiciousGeneratedText(text,{minJapanese:6,maxDigits:4,maxLen:60});
}
function validMetricNumber(v,min=0,max=100){const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max;}
function normalizeAnalysisJson(j){
  if(!j||typeof j!=='object')return {ok:false,reason:'NOT_OBJECT'};
  for(const key of ANALYSIS_KEYS)if(!validMetricNumber(j[key]))return {ok:false,reason:`INVALID_${key}`};
  if(!validMetricNumber(j.bonus,0,2))return {ok:false,reason:'INVALID_BONUS'};
  const summaryCheck=suspiciousGeneratedText(short(j.summary,120),{minJapanese:3,maxDigits:5,maxLen:120});
  const evidence=(Array.isArray(j.evidence)?j.evidence:[]).slice(0,3).map(x=>short(x,80)).filter(x=>suspiciousGeneratedText(x,{minJapanese:2,maxDigits:5,maxLen:80}).ok);
  return {ok:true,analysis:{
    questionEngagement:int100(j.questionEngagement),mutualResponse:int100(j.mutualResponse),selfDisclosure:int100(j.selfDisclosure),
    emotionalExpression:int100(j.emotionalExpression),conversationalRichness:int100(j.conversationalRichness),bonus:int2(j.bonus),
    summary:summaryCheck.ok?summaryCheck.text:'',evidence,
  }};
}
function transcriptUsability(text){
  const s=short(text,5000);
  if(!s)return {ok:false,reason:'EMPTY_TRANSCRIPT'};
  const jp=(s.match(/[ぁ-んァ-ヶ一-龠々ー]/g)||[]).length;
  if(s.length<3||jp<2)return {ok:false,reason:'TRANSCRIPT_TOO_SHORT'};
  if(/(.{2,12})\1\1/u.test(s)&&s.length<120)return {ok:false,reason:'TRANSCRIPT_REPETITION'};
  return {ok:true};
}


export async function analyzeConversationTranscripts({sessionId,questionIndex,questionText,transcriptA,transcriptB}){
  if(!CONFIG.ai.enabled)return null;
  const A=short(transcriptA,5000),B=short(transcriptB,5000);
  const qa=transcriptUsability(A),qb=transcriptUsability(B);
  if(!qa.ok||!qb.ok){
    return {ok:false,analysis:null,bonus:0,errorCode:'TRANSCRIPT_QUALITY_LOW',errorMessage:`A:${qa.reason||'OK'} / B:${qb.reason||'OK'}`,model:CONFIG.ai.local.textModel,aiRuntime:'LOCAL_TRANSFORMERS_JS',sessionId,questionIndex};
  }
  const system=[
    'あなたは高校生の研究装置LOVE METERの会話特徴分析AIです。',
    '恋愛感情、親密さ、相性、性格、関係の良し悪しを推測・断定してはいけません。',
    '文字起こしに実際に現れている特徴だけを評価します。A/Bは別々の口元マイクです。回り込みで同じ言葉が重複する場合があります。',
    '必ずJSONだけを出力してください。説明文やMarkdownは禁止です。',
    'JSONキー: questionEngagement, mutualResponse, selfDisclosure, emotionalExpression, conversationalRichness は0〜100の整数。bonusは0〜2。summaryは60文字以内。evidenceは短い根拠を最大3個。',
    'bonus: 0=特徴が読み取りにくい、1=会話特徴がある、2=複数の明確な特徴がある。点数はエンタメ用の小さな補助加点です。',
  ].join('\n');
  const shape='{"questionEngagement":0,"mutualResponse":0,"selfDisclosure":0,"emotionalExpression":0,"conversationalRichness":0,"bonus":0,"summary":"","evidence":[]}';
  const user=`質問: ${short(questionText,400)||'（不明）'}\n\nAの文字起こし:\n${A}\n\nBの文字起こし:\n${B}\n\n次の形のJSONだけを返してください:\n${shape}`;
  const attempts=[
    [{role:'system',content:system},{role:'user',content:user}],
    [{role:'system',content:'JSONだけを返してください。数値は指定範囲内。説明・Markdown・繰り返しは禁止。'},{role:'user',content:`質問:${short(questionText,180)}\nA:${short(A,1200)}\nB:${short(B,1200)}\n出力:${shape}`}],
  ];
  let lastRaw='',lastReason='AI_JSON_INVALID';
  for(let i=0;i<attempts.length;i++){
    try{
      const raw=await generate(attempts[i],{maxNewTokens:i===0?(CONFIG.ai.local.textMaxNewTokens||260):180,doSample:false,temperature:0.05,repetitionPenalty:1.15,topP:0.8});
      lastRaw=raw;
      const j=parseJsonLoose(raw);
      if(!j){lastReason='JSON_PARSE_FAILED';continue;}
      const checked=normalizeAnalysisJson(j);
      if(!checked.ok){lastReason=checked.reason;continue;}
      const analysis=checked.analysis;
      return {ok:true,analysis,bonus:analysis.bonus,model:CONFIG.ai.local.textModel,aiRuntime:'LOCAL_TRANSFORMERS_JS',aiDevice:status.textDevice,sessionId,questionIndex,attempt:i+1};
    }catch(e){lastReason=String(e?.message||e).slice(0,120);}
  }
  return {ok:false,analysis:null,bonus:0,errorCode:'AI_ANALYSIS_INVALID',errorMessage:lastReason,rawPreview:short(lastRaw,160),model:CONFIG.ai.local.textModel,aiRuntime:'LOCAL_TRANSFORMERS_JS',aiDevice:status.textDevice,sessionId,questionIndex};
}
export async function analyzeConversationAudio({blob,sessionId,questionIndex,questionText,side='A'}){
  return transcribeParticipantAudio({blob,sessionId,questionIndex,questionText,side});
}

const fallbackCommentGroups={
  bothHigh:['心拍も声もよく動いた、リアクション豊かな回でした！','心拍と声の両方に、はっきりした変化が出ています！'],
  heartHigh:['心拍のリアクションが目立った一回でした！','声よりも心拍に大きな動きが見えた結果です！'],
  voiceHigh:['声の変化が目立った、表情豊かな会話でした！','今回は声のリアクションが特に大きく出ています！'],
  balanced:['心拍と声、それぞれに違う動きが見えました！','二人らしい反応の組み合わせが出た一回でした！'],
  low:['今回は落ち着いた反応。次の会話では別の動きが見えるかも！','大きな変化は少なめ。会話ごとの違いにも注目です！'],
};
function fallbackResultComment(payload={}){
  const heart=Number(payload.heartScore),voice=Number(payload.voiceScore),seed=Math.abs(Number(payload.variationSeed)||0);
  let key='balanced';
  if(Number.isFinite(heart)&&Number.isFinite(voice)){
    if(heart>=70&&voice>=70)key='bothHigh';
    else if(heart>=70&&heart-voice>=10)key='heartHigh';
    else if(voice>=70&&voice-heart>=10)key='voiceHigh';
    else if(heart<50&&voice<50)key='low';
  }
  const pool=fallbackCommentGroups[key]||fallbackCommentGroups.balanced;
  return pool[seed%pool.length];
}
export async function generateResultComment(payload){
  if(!CONFIG.ai.enabled)return null;
  const heart=Number(payload?.heartScore),voice=Number(payload?.voiceScore),bonus=Number(payload?.aiTalkBonus||0),final=Number(payload?.finalScore);
  const highlights=Array.isArray(payload?.highlights)?payload.highlights.slice(0,6).map(x=>short(x,80)):[];
  const seed=String(payload?.variationSeed||Math.floor(Math.random()*100000));
  const system=[
    'LOVE METERのカラオケ採点風結果画面に出す一言コメントを作ります。',
    '日本語1文、18〜35文字程度。数字・英単語・ランキング表現は使わないでください。',
    '同じ語句の繰り返しは禁止。引用符や前置きは不要です。',
    '結果データと矛盾しないこと。恋愛感情、親密さ、相性、将来の関係を断定しないこと。',
    '低得点でも傷つける表現は禁止。「〜かも！」「いいテンポ！」「ドキドキ強め！」のような遊び心はOKです。',
  ].join('\n');
  const user=`HEART=${Number.isFinite(heart)?Math.round(heart):'NA'}, VOICE=${Number.isFinite(voice)?Math.round(voice):'NA'}, AI BONUS=+${bonus}, FINAL=${Number.isFinite(final)?Math.round(final):'NA'}\n目立った特徴: ${highlights.join(' / ')||'特になし'}\n表現変化用番号: ${seed}`;
  try{
    const raw=await generate([{role:'system',content:system},{role:'user',content:user}],{maxNewTokens:CONFIG.ai.local.resultCommentMaxNewTokens||70,doSample:true,temperature:0.55,repetitionPenalty:1.2,topP:0.8});
    const checked=validateResultCommentText(raw);
    if(checked.ok)return {comment:checked.text,vibe:'playful',model:CONFIG.ai.local.textModel,aiRuntime:'LOCAL_TRANSFORMERS_JS',fallback:false};
    console.warn('Rejected local AI result comment',checked.reason,raw);
    return {comment:fallbackResultComment(payload),vibe:'playful',fallback:true,rejectionReason:checked.reason,aiRuntime:'LOCAL_FALLBACK'};
  }catch(e){
    console.warn('Local result comment generation failed',e);
    return {comment:fallbackResultComment(payload),vibe:'playful',fallback:true,rejectionReason:'GENERATION_ERROR',aiRuntime:'LOCAL_FALLBACK'};
  }
}
