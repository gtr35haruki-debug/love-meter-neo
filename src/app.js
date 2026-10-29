import {
  APP_VERSION, CONFIG, ROLE, SESSION_STATUS, QUESTION_BANK_VERSION, EVENT_QUESTION_BANK_VERSION,
  CHILD_SUPPORT_VERSION, EVENT_GUIDE_VERSION, CONSENT_VERSION,
  PREPROCESSING_VERSION, METRICS_VERSION, DISPLAY_SCORE_VERSION, DISPLAY_SCALE_VERSION, VOICE_METRICS_VERSION, AI_TALK_VERSION
} from './config.js?v=0.4.0b5';
import { getQuestionBankForProtocol, getQuestionCategoriesForProtocol, childReadAloudPrompt } from './question-bank.js?v=0.4.0b5';
import { PROTOCOLS, SET_ORDERS, buildTimeline, getPhaseAtElapsed, isEventProtocol } from './protocols.js?v=0.4.0b5';
import {
  RELATIONSHIP_OPTIONS, PRE_RELATIONSHIP_ITEMS, PRE_STATE_ITEMS, OPTIONAL_ITEM,
  CONDITION_OPTIONS, POST_ITEMS, CONSENT_TEXT
} from './survey-schema.js?v=0.4.0b5';
import * as backend from './backend.js?v=0.4.0b5';
import { HeartRateSensor, DemoHeartRateSensor } from './bluetooth-hw9.js?v=0.4.0b5';
import { computeSessionMetrics } from './metrics.js?v=0.4.0b5';
import { VoiceCapture, computeVoiceSessionMetrics, classifySpeakerTimeline, summarizeSpeakerTimeline, listAudioInputDevices } from './voice.js?v=0.4.0b5';
import { transcribeParticipantAudio, analyzeConversationTranscripts, generateResultComment, prepareLocalAi, getLocalAiStatus, subscribeLocalAiStatus } from './ai.js?v=0.4.0b5';
import { buildExportFiles, zipFile, redact } from './research-export.js?v=0.4.0b5';
import { radarSvg } from './radar.js?v=0.4.0b5';
import { isRecordsUnlocked, verifyRecordsPin, lockRecords, touchRecordsActivity } from './admin-gate.js?v=0.4.0b5';

const app=document.querySelector('#app');
const state={
  role:sessionStorage.getItem('lmneo-role')||null,
  sessionId:sessionStorage.getItem('lmneo-session')||null,
  session:null,
  sensor:null,
  sensorStatus:'DISCONNECTED',
  sensorName:null,
  sensorStreamTimes:[],
  sensorValidated:false,
  voiceCapture:null,
  voiceStatus:'DISCONNECTED',
  voiceThreshold:null,
  voiceBaseline:null,
  voiceBaselineBusy:false,
  voiceBaselineRemainingMs:null,
  micMeta:null,
  micConnectionType:'UNKNOWN',
  micDevices:[],
  micDeviceId:'',
  voiceProcessing:0,
  voiceTransitionBusy:false,
  localAi:getLocalAiStatus(),
  localAiPreparing:false,
  bpm:null,
  lastSamples:[],
  surveyStage:null,
  surveySide:null,
  surveyLocked:null,
  timer:null,
  lastPhaseKey:null,
  finishing:false,
  backendStatus:backend.getBackendStatus(),
  busy:false,
  recordsView:'records',
  recordsSelectedSessionId:null,
  recordsTab:'overview',
  recordsCache:[],
  recordsSearch:'',
  recordsProtocol:'ALL',
  recordsStatus:'ALL',
  exportSelected:new Set(),
  exportBusy:false,
};

function localAiStateLabel(st=state.localAi){
  const asr=st?.asr==='READY'?'ASR READY':st?.asr==='LOADING'?`ASR ${Math.round(st.asrProgress||0)}%`:st?.asr==='ERROR'?'ASR ERROR':'ASR WAIT';
  const text=st?.text==='READY'?'TALK AI READY':st?.text==='LOADING'?`TALK AI ${Math.round(st.textProgress||0)}%`:st?.text==='ERROR'?'TALK AI ERROR':'TALK AI WAIT';
  return `${asr} / ${text}`;
}
subscribeLocalAiStatus(st=>{
  state.localAi=st;
  const label=document.querySelector('#local-ai-status');if(label)label.textContent=localAiStateLabel(st);
  const detail=document.querySelector('#local-ai-detail');if(detail)detail.textContent=[st.asrMessage,st.textMessage,st.error?`ERROR: ${st.error}`:''].filter(Boolean).join(' / ');
  const btn=document.querySelector('[data-action="prepare-local-ai"]');if(btn){const loading=st.asr==='LOADING'||st.text==='LOADING'||state.localAiPreparing;btn.disabled=loading;btn.textContent=loading?'ローカルAIを準備中…':'ローカルAIを準備';}
});

const esc=(s='')=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const fmt=ms=>{const s=Math.max(0,Math.ceil(Number(ms||0)/1000));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};
const uuid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const joinCode=()=>String(Math.floor(Math.random()*900000)+100000);
const roleSide=()=>state.role===ROLE.SENSOR_A?'A':state.role===ROLE.SENSOR_B?'B':null;
const isController=()=>state.session?.controllerDevice===state.role;
const now=()=>backend.now();
const otherSensorRole=()=>state.role===ROLE.SENSOR_A?ROLE.SENSOR_B:ROLE.SENSOR_A;
const canonicalPair=(a,b)=>[a,b].sort().join('|');
const skippedQuestionKey=phase=>String(phase?.globalQuestionIndex??'');
const isQuestionSkipped=(s,phase)=>!!(phase?.phase==='QUESTION'&&s?.skippedQuestions?.[skippedQuestionKey(phase)]);

const PROTOCOL_LABELS={RESEARCH_V1:'研究モード (RESEARCH_V1)',EVENT_V1:'旧イベントモード (EVENT_V1)',EVENT_V2:'イベントモード (EVENT_V2)'};
const STATUS_LABELS={DRAFT:'下書き (DRAFT)',READY:'準備完了 (READY)',RUNNING:'測定中 (RUNNING)',PAUSED:'一時停止 (PAUSED)',SYNC_PENDING:'同期待ち (SYNC_PENDING)',COMPLETE:'完了 (COMPLETE)',ABORTED:'中止 (ABORTED)'};
const QUALITY_LABELS={GOOD:'良好 (GOOD)',CAUTION:'注意 (CAUTION)',INVALID:'無効 (INVALID)'};
const ROLE_LABELS={DISPLAY:'表示端末 (DISPLAY)',SENSOR_A:'計測端末A (SENSOR_A)',SENSOR_B:'計測端末B (SENSOR_B)',RECORDS:'記録画面 (RECORDS)'};
const PHASE_LABELS={BASELINE:'基準計測 (BASELINE)',QUESTION:'質問 (QUESTION)',RESET:'休憩 (RESET)',RECOVERY:'回復計測 (RECOVERY)'};
const EVENT_LABELS={
  QUESTION_SKIPPED:'質問スキップ (QUESTION_SKIPPED)',
  SESSION_CREATED:'セッション作成 (SESSION_CREATED)',DEVICE_JOINED:'端末参加 (DEVICE_JOINED)',HW9_CONNECTED:'心拍計接続 (HW9_CONNECTED)',DEMO_SENSOR_CONNECTED:'デモ心拍計接続 (DEMO_SENSOR_CONNECTED)',HEART_RATE_STREAM_READY:'心拍受信準備完了 (HEART_RATE_STREAM_READY)',MIC_READY:'マイク準備完了 (MIC_READY)',VOICE_BASELINE_READY:'基準声取得 (VOICE_BASELINE_READY)',AI_TRANSCRIPTION_FAILED:'AI文字起こし失敗 (AI_TRANSCRIPTION_FAILED)',AI_TALK_FAILED:'AI会話分析失敗 (AI_TALK_FAILED)',LOCAL_AI_READY:'ローカルAI準備完了 (LOCAL_AI_READY)',SURVEY_SUBMITTED:'アンケート送信 (SURVEY_SUBMITTED)',ACCLIMATION_STARTED:'順応開始 (ACCLIMATION_STARTED)',MEASUREMENT_SCHEDULED:'測定開始予約 (MEASUREMENT_SCHEDULED)',PAUSED:'一時停止 (PAUSED)',RESUMED:'再開 (RESUMED)',MEASUREMENT_ENDED:'測定終了 (MEASUREMENT_ENDED)',RESULT_CALCULATED:'結果計算 (RESULT_CALCULATED)',CONTROLLER_TRANSFER:'操作端末変更 (CONTROLLER_TRANSFER)'
};
const REASON_LABELS={INSUFFICIENT_VALID_DATA:'有効データ不足 (INSUFFICIENT_VALID_DATA)',LOW_ACTIVITY:'反応量不足 (LOW_ACTIVITY)',CONTINUOUS_GAP:'連続欠測 (CONTINUOUS_GAP)',NO_VARIANCE:'変動不足 (NO_VARIANCE)',NO_REACTION:'反応量不足 (NO_REACTION)',MISSING_MAGNITUDE:'反応量データ不足 (MISSING_MAGNITUDE)',LOCAL_BASELINE_INVALID:'直前基準データ不足 (LOCAL_BASELINE_INVALID)',QUESTION_SKIPPED:'質問スキップ (QUESTION_SKIPPED)'};
const CONDITION_LABELS=Object.fromEntries(CONDITION_OPTIONS.map(x=>[x.value,`${x.label} (${x.value})`]));
const SURVEY_ITEM_LABELS=Object.fromEntries([...PRE_RELATIONSHIP_ITEMS,...PRE_STATE_ITEMS,OPTIONAL_ITEM,...POST_ITEMS].map(x=>[x.id,`${x.question} (${x.id})`]));
Object.assign(SURVEY_ITEM_LABELS,{consentAccepted:'研究参加への同意 (consentAccepted)',relationship:'現在の関係性 (relationship)',relationshipOther:'その他の関係 (relationshipOther)',condition:'測定条件 (condition)',freeText:'自由記述 (freeText)'});
const protocolLabel=x=>PROTOCOL_LABELS[x]||x||'—';
const statusLabel=x=>STATUS_LABELS[x]||x||'—';
const qualityLabel=x=>QUALITY_LABELS[x]||x||'—';
const roleLabel=x=>ROLE_LABELS[x]||x||'—';
const phaseLabel=x=>PHASE_LABELS[x]||x||'—';
const reasonLabel=x=>REASON_LABELS[x]||x||'';

function statusPill(label,tone='neutral'){return `<span class="status ${tone}"><span class="dot"></span>${esc(label)}</span>`;}
function shell(content,{participant=false,display=false}={}){
  const bs=state.backendStatus||{};
  const cloud=CONFIG.backendMode==='firebase'
    ? `${statusPill(bs.connected?'FIREBASE ONLINE':'FIREBASE OFFLINE',bs.connected?'good':'warn')}<span class="version">SERVER OFFSET ${Math.round(bs.serverOffsetMs||0)} ms</span>`
    : '<span class="dev-badge">LOCAL PROTOTYPE</span>';
  const displayLocked=['RUNNING','PAUSED','ACCLIMATION','CALCULATING'].includes(state.session?.stage);
  const displayTop=display?`<div class="actions"><span class="display-brand-tag">参加者表示 (DISPLAY)</span><button class="btn btn-quiet display-home-btn" data-action="display-home" ${displayLocked?'disabled title="測定中はホームへ戻れません"':''}>ホームへ戻る</button></div>`:'';
  return `<div class="app ${participant?'participant-app':''}"><div class="shell">
    <div class="topbar">
      <div class="brand"><span class="brand-mark"><i></i></span><span>LOVE METER NEO</span></div>
      ${participant?'<span class="status good"><span class="dot"></span>プライバシーモード (PRIVACY MODE)</span>':display?displayTop:`<div class="actions"><span class="version">APP ${APP_VERSION}</span>${cloud}<button class="btn btn-quiet" data-action="home">端末設定</button></div>`}
    </div>${content}</div></div>`;
}

async function refreshSession(){
  if(!state.sessionId)return;
  try{const s=await backend.loadSession(state.sessionId);if(s)state.session=s;}catch(e){console.warn('refreshSession',e);}
}

backend.subscribe(async msg=>{
  if(!state.sessionId||msg.sessionId!==state.sessionId)return;
  await refreshSession();
  if(state.surveyStage||state.surveyLocked){updateConnectionIndicators();return;}
  render();
});
backend.subscribeStatus(status=>{state.backendStatus=status;updateConnectionIndicators();});

function updateConnectionIndicators(){
  document.querySelectorAll('[data-live-backend]').forEach(el=>{
    el.textContent=state.backendStatus?.connected?'FIREBASE ONLINE':'FIREBASE OFFLINE';
    el.classList.toggle('good',!!state.backendStatus?.connected);el.classList.toggle('warn',!state.backendStatus?.connected);
  });
}

async function chooseRole(role){
  state.role=role;sessionStorage.setItem('lmneo-role',role);state.session=null;state.sessionId=null;sessionStorage.removeItem('lmneo-session');
  render();
}
async function clearRole(){
  try{if(state.sensor)await state.sensor.disconnect();}catch{}
  if(state.sessionId&&roleSide())try{await backend.setSensorReady(state.sessionId,roleSide(),false);await backend.setMicReady(state.sessionId,roleSide(),false);}catch{}
  stopTick();sessionStorage.removeItem('lmneo-role');sessionStorage.removeItem('lmneo-session');
  try{if(state.voiceCapture)await state.voiceCapture.disconnect();}catch{}
  state.role=null;state.sessionId=null;state.session=null;state.sensor=null;state.sensorStatus='DISCONNECTED';state.sensorValidated=false;state.voiceCapture=null;state.voiceStatus='DISCONNECTED';state.voiceThreshold=null;state.voiceBaseline=null;state.voiceBaselineBusy=false;state.voiceBaselineRemainingMs=null;state.micMeta=null;state.micConnectionType='UNKNOWN';state.micDevices=[];state.micDeviceId='';state.surveyStage=null;state.surveyLocked=null;render();
}

function roleSelection(){
  return shell(`<section class="landing">
    <div class="landing-orbit orbit-a"></div><div class="landing-orbit orbit-b"></div>
    <div class="eyebrow">HEART × SCIENCE × INTERACTION</div>
    <div class="title">LOVE METER <span>NEO</span></div>
    <p class="subtitle hero-copy">その場にある3台のPCを役割設定して使う、二者の心拍リアクション研究・体験システム。</p>
    <div class="signal-pair" aria-hidden="true"><span></span><span></span></div>
    <div class="role-grid">
      ${roleCard(ROLE.DISPLAY,'DISPLAY','参加者が見る画面','説明・質問・カウントダウン・結果だけを大きく表示します。')}
      ${roleCard(ROLE.SENSOR_A,'SENSOR A','A側の実験者端末','HW9接続・運用操作・Aの個別アンケートを担当します。')}
      ${roleCard(ROLE.SENSOR_B,'SENSOR B','B側の実験者端末','HW9接続・運用操作・Bの個別アンケートを担当します。')}
      ${roleCard(ROLE.RECORDS,'RECORDS','研究記録','PINで保護された研究記録・心拍・指標・アンケートを確認します。')}
    </div>
    <p class="footer-note">PC2 / PC3 はアンケート時だけ参加者に渡し、それ以外は実験者側に置く運用を前提にしています。</p>
  </section>`);
}
function roleCard(role,title,kicker,desc){return `<button class="card role-card" data-role="${role}"><span class="role-signal"></span><small>${esc(kicker)}</small><strong>${esc(title)}</strong><p>${esc(desc)}</p><span class="role-arrow">→</span></button>`;}

function systemCheckHtml(){
  const secure=location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname);
  const firebase=!!state.backendStatus?.connected;
  const idb='indexedDB' in window;
  const bt=!!navigator.bluetooth;
  const screenOk=screen.width>=1280&&screen.height>=720;
  const checks=[
    ['HTTPS',secure,secure?'安全な接続':'HTTPSで開いてください'],
    ['Firebase',firebase,firebase?'オンライン':'接続待機中'],
    ['IndexedDB',idb,idb?'利用可能':'利用不可'],
    ...(state.role===ROLE.SENSOR_A||state.role===ROLE.SENSOR_B?[['Web Bluetooth',bt,bt?'API利用可能':'Chrome / Edgeの対応PCが必要']]:[]),
    ['画面',screenOk,`${screen.width} × ${screen.height}${screenOk?'':'（1280×720以上推奨）'}`],
    ['Clock sync',true,`server offset ${Math.round(state.backendStatus?.serverOffsetMs||0)} ms`],
    ['App Version',true,APP_VERSION],
  ];
  return `<div class="system-check"><div class="section-title">NEO SYSTEM CHECK</div>${checks.map(([name,ok,detail])=>`<div class="check-row"><span class="check-icon ${ok?'ok':'warn'}">${ok?'✓':'!'}</span><span><b>${esc(name)}</b><small>${esc(detail)}</small></span></div>`).join('')}</div>`;
}

function sessionLobby(){
  if(state.role===ROLE.DISPLAY)return displayJoin();
  const initialProtocol='RESEARCH_V1';
  const initialCategories=getQuestionCategoriesForProtocol(initialProtocol);
  return shell(`<div class="layout lobby-layout"><main class="panel panel-strong">
    <div class="section-title">${esc(state.role)}</div><h1>セッションを準備</h1><p class="subtitle">新しい計測を作成するか、別端末で発行された6桁コードに参加します。</p>
    <div class="lobby-columns"><section>
      <h3>新しい計測</h3>
      <div class="field"><label>モード</label><select id="protocol"><option value="RESEARCH_V1">研究モード (RESEARCH_V1)</option><option value="EVENT_V2">イベントモード (EVENT_V2)</option></select></div>
      <div class="field"><label>関係カテゴリ</label><select id="category">${initialCategories.map(x=>`<option>${esc(x)}</option>`).join('')}</select><small id="category-help">研究モードの質問カテゴリを選択します。</small></div>
      <div id="event-options" class="event-options" hidden>
        <div class="event-options-head"><div><b>イベント設定</b><small>イベント用の6カテゴリから質問を選びます。必要に応じて「こどもサポート」を使用できます。</small></div><span class="event-chip">EVENT V2</span></div>
        <label class="check-card child-toggle"><input type="checkbox" id="child-support"><span><b>こどもサポートを使う</b><small>質問内容と計測時間はそのままに、大きい表示・やさしい案内・スタッフ読み上げ補助を有効にします。アンケートはありません。</small></span></label>
      </div>
      <div class="grid2"><div class="field"><label>Participant A ID</label><input id="pa" placeholder="空欄で新規IDを発行"></div><div class="field"><label>Participant B ID</label><input id="pb" placeholder="空欄で新規IDを発行"></div></div>
      <button class="btn primary full" data-action="create-session">新しい計測を作成</button>
    </section><section class="join-section"><h3>既存セッションへ参加</h3><div class="field"><label>6桁コード</label><input id="join" maxlength="6" inputmode="numeric" autocomplete="one-time-code" class="code-input" placeholder="123456"></div><button class="btn full" data-action="join-session">このセッションに参加</button><div class="callout compact">同じコードを DISPLAY / SENSOR A / SENSOR B の3台で使います。</div></section></div>
  </main><aside class="panel">${systemCheckHtml()}<div class="callout info" style="margin-top:16px">上部が <b>FIREBASE ONLINE</b> なら、別PCとの同期準備ができています。</div></aside></div>`);
}
function syncSessionCreationForm(){
  const protocol=document.querySelector('#protocol'),category=document.querySelector('#category');
  if(!protocol||!category)return;
  const apply=()=>{
    const pid=protocol.value||'RESEARCH_V1';
    const cats=getQuestionCategoriesForProtocol(pid);
    const prev=category.value;
    category.innerHTML=cats.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
    category.value=cats.includes(prev)?prev:(pid==='EVENT_V2'&&cats.includes('親子')?'親子':cats[0]);
    const eventOptions=document.querySelector('#event-options'),help=document.querySelector('#category-help');
    if(eventOptions)eventOptions.hidden=pid!=='EVENT_V2';
    if(help)help.textContent=pid==='EVENT_V2'?'今回のイベントで使う6カテゴリから選択します。':'研究モードの質問カテゴリを選択します。';
  };
  protocol.addEventListener('change',apply);apply();
}


function displayJoin(){
  return shell(`<div class="display-center join-display"><div class="display-ring"></div><div class="eyebrow">DISPLAY</div><h1>セッションへ接続</h1><p class="subtitle">SENSOR端末に表示されている6桁コードを入力してください。</p><div class="field display-code-field"><input id="join" maxlength="6" inputmode="numeric" autocomplete="one-time-code" class="code-input giant" placeholder="000000"></div><button class="btn primary" data-action="join-session">DISPLAYを接続</button></div>`);
}

async function chooseLeastUsedOrder(protocolId,category,pa,pb){const candidates=protocolId==='RESEARCH_V1'?SET_ORDERS:['A','B','C'];return backend.chooseSetOrder(protocolId,category,pa,pb,candidates);}
async function createSession(){
  if(state.busy)return;state.busy=true;
  try{
    const protocolId=document.querySelector('#protocol')?.value||'RESEARCH_V1';
    const category=document.querySelector('#category')?.value||'友達';
    const childSupport=protocolId==='EVENT_V2'&&!!document.querySelector('#child-support')?.checked;
    let pa=document.querySelector('#pa')?.value.trim();let pb=document.querySelector('#pb')?.value.trim();
    if(!pa)pa=await backend.allocateParticipantId();if(!pb)pb=await backend.allocateParticipantId();
    const bank=getQuestionBankForProtocol(protocolId);
    if(!bank?.[category])throw new Error('このモードでは選択した関係カテゴリを使用できません。');
    const setOrder=await chooseLeastUsedOrder(protocolId,category,pa,pb);
    const timeline=buildTimeline(protocolId,setOrder,bank[category]);
    const displayId=await backend.allocateDisplayId();
    const surveyStatus={preA:false,preB:false,postA:false,postB:false};
    const s={
      sessionId:uuid(),displayId,joinCode:joinCode(),status:SESSION_STATUS.DRAFT,stage:'SETUP',protocolId,questionCategory:category,
      participantAId:pa,participantBId:pb,canonicalPairKey:canonicalPair(pa,pb),setOrder,assignmentMethod:'LEAST_USED_AVOID_PAIR_REPEAT_V1',controllerDevice:state.role,
      timeline,createdAt:now(),appVersion:APP_VERSION,
      questionBankVersion:protocolId==='EVENT_V2'?EVENT_QUESTION_BANK_VERSION:QUESTION_BANK_VERSION,
      consentVersion:CONSENT_VERSION,preprocessingVersion:PREPROCESSING_VERSION,
      metricsVersion:METRICS_VERSION,displayScoreVersion:DISPLAY_SCORE_VERSION,displayScaleVersion:DISPLAY_SCALE_VERSION,voiceMetricsVersion:VOICE_METRICS_VERSION,aiTalkVersion:AI_TALK_VERSION,introPage:0,
      childSupport,childSupportVersion:childSupport?CHILD_SUPPORT_VERSION:null,
      eventGuideVersion:protocolId==='EVENT_V2'?EVENT_GUIDE_VERSION:null,
      skippedQuestions:{},
      sensorReady:{A:false,B:false},micReady:{A:false,B:false},localAiReady:{A:null,B:null},surveyStatus,devicePresence:{[state.role]:now()},guardianOrSchoolConsent:'externally_managed'
    };
    await backend.createSession(s);state.session=await backend.loadSession(s.sessionId);state.sessionId=s.sessionId;sessionStorage.setItem('lmneo-session',s.sessionId);
    await backend.appendAuditLog(s.sessionId,{eventType:'SESSION_CREATED',details:{displayId,protocolId,category,setOrder,childSupport}});render();
  }catch(e){alert(e?.message||'セッションを作成できませんでした。');console.error(e);}finally{state.busy=false;}
}
async function joinSession(){
  const code=document.querySelector('#join')?.value.trim()||'';
  try{
    const s=await backend.joinByCode(code);if(!s){alert('セッションが見つかりません。6桁コードを確認してください。');return;}
    state.session=s;state.sessionId=s.sessionId;sessionStorage.setItem('lmneo-session',s.sessionId);
    if(roleSide()){await backend.setSensorReady(s.sessionId,roleSide(),false);await backend.setMicReady(s.sessionId,roleSide(),false);await backend.setLocalAiReady(s.sessionId,roleSide(),null).catch(()=>{});}
    await backend.appendAuditLog(s.sessionId,{eventType:'DEVICE_JOINED',details:{role:state.role}});render();
  }catch(e){alert(e?.message||'セッションへ参加できませんでした。');console.error(e);}
}

function runtimeInfo(s){
  if(!s)return{};
  if(s.stage==='ACCLIMATION')return{online:true,remaining:(s.readyAtMs||0)-now(),phase:null,elapsed:null};
  if(s.stage==='PAUSED')return{online:true,remaining:s.pauseRemainingMs||0,phase:s.pausedPhase||null,elapsed:null};
  if(s.stage!=='RUNNING')return{online:true,remaining:null,phase:null,elapsed:null};
  const elapsed=now()-(s.t0||now())-(s.totalPausedMs||0);const phase=getPhaseAtElapsed(s.timeline||[],elapsed);
  return {online:true,elapsed,phase,remaining:phase?phase.endOffsetMs-elapsed:0};
}
function phaseKey(s){const rt=runtimeInfo(s);return `${s?.stage||'NONE'}:${rt.phase?.startOffsetMs??'none'}`;}
function getStartBlockers(s){
  const blockers=[];const side=roleSide();
  if(!isController())blockers.push(`この端末は操作端末ではありません（現在: ${s.controllerDevice||'未設定'}）`);
  if(state.sensorStatus!=='CONNECTED'||!state.sensorValidated)blockers.push(`SENSOR ${side} で心拍ストリームの確認が必要です`);
  if(state.voiceStatus!=='READY')blockers.push(`SENSOR ${side} でマイク準備が必要です`);
  if(!s.micReady?.A)blockers.push('Microphone A が READY ではありません');
  if(!s.micReady?.B)blockers.push('Microphone B が READY ではありません');
  if(!s.voiceBaselineReady?.A)blockers.push('参加者Aの基準声が未測定です');
  if(!s.voiceBaselineReady?.B)blockers.push('参加者Bの基準声が未測定です');
  if(CONFIG.ai.enabled&&!s.localAiReady?.A?.asr)blockers.push('SENSOR A のローカル音声認識AIが未準備です');
  if(CONFIG.ai.enabled&&!s.localAiReady?.B?.asr)blockers.push('SENSOR B のローカル音声認識AIが未準備です');
  if(CONFIG.ai.enabled&&state.localAi?.asr!=='READY')blockers.push('この操作PCのローカル音声認識AIが未準備です');
  if(CONFIG.ai.enabled&&isController()&&state.localAi?.text!=='READY')blockers.push('この操作PCのローカル会話分析AIが未準備です');
  if(!s.sensorReady?.A)blockers.push('Sensor A が READY ではありません');
  if(!s.sensorReady?.B)blockers.push('Sensor B が READY ではありません');
  if(s.protocolId==='RESEARCH_V1'){
    if(!s.surveyStatus?.preA)blockers.push('Aの事前アンケートが未完了です');
    if(!s.surveyStatus?.preB)blockers.push('Bの事前アンケートが未完了です');
  }
  return blockers;
}

function readinessRow(label,ok,detail=''){return `<div class="readiness-row"><span class="readiness-icon ${ok?'ok':''}">${ok?'✓':'·'}</span><span><b>${esc(label)}</b>${detail?`<small>${esc(detail)}</small>`:''}</span><strong>${ok?'READY':'WAIT'}</strong></div>`;}
function eventQuestionAssistCard(s,phase){
  if(!(s.protocolId==='EVENT_V2'&&phase?.phase==='QUESTION'))return '';
  const skipped=isQuestionSkipped(s,phase),child=!!s.childSupport;
  return `<div class="callout event-question-assist ${child?'child-question-assist':''} ${skipped?'warn':''}"><b>${skipped?'この質問はスキップ済み':child?'スタッフ読み上げ例':'イベント質問操作'}</b>${child&&!skipped?`<br>${esc(childReadAloudPrompt(phase.questionText))}`:''}${skipped?'<br>次の質問までそのままお待ちください。':''}${!skipped&&isController()?`<div class="actions event-question-actions"><button class="btn btn-quiet" data-action="skip-question">この質問をスキップ</button></div>`:''}</div>`;
}

async function skipCurrentQuestion(){
  const s=state.session;if(!isController()||s?.protocolId!=='EVENT_V2')return;const rt=runtimeInfo(s),phase=rt.phase;
  if(phase?.phase!=='QUESTION')return;
  if(!confirm('この質問をスキップしますか？\n残り時間は待機し、この質問は結果の指標集計から除外します。'))return;
  const key=skippedQuestionKey(phase),skipped={...(s.skippedQuestions||{}),[key]:{questionText:phase.questionText,setId:phase.setId,questionIndex:phase.questionIndex,globalQuestionIndex:phase.globalQuestionIndex,skippedAt:now(),byRole:state.role}};
  await backend.updateSession(s.sessionId,{skippedQuestions:skipped});await backend.appendAuditLog(s.sessionId,{eventType:'QUESTION_SKIPPED',details:{globalQuestionIndex:phase.globalQuestionIndex,questionText:phase.questionText}});
}

function operatorScreen(){
  const s=state.session;const side=roleSide();if(state.surveyStage)return surveyScreen();if(state.surveyLocked)return surveyCompleteScreen();
  const rt=runtimeInfo(s);const connected=state.sensorStatus==='CONNECTED';const blockers=getStartBlockers(s);const canProceed=blockers.length===0;const currentQuestion=rt.phase?.questionText||'';
  const controllerLabel=isController()?'CONTROLLER':'MONITOR';
  const preButton=s.protocolId==='RESEARCH_V1'?`<button class="btn full ${s.surveyStatus?.[`pre${side}`]?'good':''}" data-action="open-pre-survey" ${s.surveyStatus?.[`pre${side}`]?'disabled':''}>${s.surveyStatus?.[`pre${side}`]?'事前アンケート 回答済み':`${side} 事前アンケート`}</button>`:'';
  let postButton='';
  if(s.stage==='POST_SURVEY'&&s.protocolId==='RESEARCH_V1'){
    postButton=`<button class="btn full ${s.surveyStatus?.[`post${side}`]?'good':''}" data-action="open-post-survey" ${s.surveyStatus?.[`post${side}`]?'disabled':''}>${s.surveyStatus?.[`post${side}`]?'事後アンケート 回答済み':`${side} 事後アンケート`}</button>`;
  }
  const resultMetrics=s.stage==='RESULT'?operatorResultSummary(s):'';
  const surveyReady=s.protocolId==='RESEARCH_V1'&&!!s.surveyStatus?.postA&&!!s.surveyStatus?.postB;
  const researchReadiness=s.protocolId==='RESEARCH_V1'?`${readinessRow('A 事前アンケート',!!s.surveyStatus?.preA,'個別・非公開')}${readinessRow('B 事前アンケート',!!s.surveyStatus?.preB,'個別・非公開')}`:'';
  return shell(`<div class="operator-head">
    <div><div class="section-title">${esc(state.role)} · ${controllerLabel}</div><h1 class="session-id">${esc(s.displayId)}</h1><div class="join-line">JOIN CODE <b class="join-code compact-code">${esc(s.joinCode)}</b></div></div>
    <div class="actions">${s.childSupport?'<span class="status child-mode"><span class="dot"></span>こどもサポート</span>':''}${statusPill(connected?`${state.sensorName||'SENSOR'} CONNECTED`:state.sensorStatus,connected?'good':'bad')}${statusPill(state.voiceStatus==='READY'?'MIC READY':state.voiceStatus,state.voiceStatus==='READY'?'good':state.voiceStatus==='RECORDING'?'good':'neutral')}${statusPill(s.stage,s.stage==='ABORTED'?'bad':s.stage==='RUNNING'?'good':'neutral')}</div>
  </div>
  <div class="layout operator-layout">
    <main>
      <section class="panel instrument-panel">
        <div class="instrument-top"><div><div class="section-title">LIVE SIGNAL · SENSOR ${side}</div><div class="hr-value"><span id="live-bpm">${state.bpm??'--'}</span><small>bpm</small></div><div class="mini">${esc(s[side==='A'?'participantAId':'participantBId'])} · ${state.sensorValidated?'STREAM VERIFIED':'STREAM CHECKING'}</div></div><div class="phase-stack"><span id="live-phase" class="phase-badge">${esc(rt.phase?.phase||s.stage)}</span><div id="live-countdown" class="countdown xl">${rt.remaining!=null?fmt(rt.remaining):'--:--'}</div></div></div>
        <div id="live-hr-chart" class="hr-chart">${hrSvg(state.lastSamples)}</div>
        <div class="instrument-grid"><div><small>Protocol</small><b>${esc(s.protocolId)}</b></div><div><small>Question Category</small><b>${esc(s.questionCategory)}</b></div><div><small>Set order</small><b>${esc(String(s.setOrder))}</b></div><div><small>Controller</small><b>${esc(s.controllerDevice||'—')}</b></div></div>
        ${currentQuestion?`<div class="current-question"><span>現在の質問</span><strong>${esc(currentQuestion)}</strong></div>`:''}
        ${eventQuestionAssistCard(s,rt.phase)}
      </section>
      ${resultMetrics}
    </main>
    <aside class="panel control-panel">
      <div class="section-title">SESSION READINESS</div>
      ${researchReadiness}
      ${readinessRow('Sensor A',!!s.sensorReady?.A,'実心拍を数秒受信してREADY')}
      ${readinessRow('Sensor B',!!s.sensorReady?.B,'実心拍を数秒受信してREADY')}
      ${readinessRow('Microphone A',!!s.micReady?.A,'音声解析READY')}${readinessRow('Voice Baseline A',!!s.voiceBaselineReady?.A,'本人基準声10秒')}${readinessRow('Microphone B',!!s.micReady?.B,'音声解析READY')}${readinessRow('Voice Baseline B',!!s.voiceBaselineReady?.B,'本人基準声10秒')}
      ${readinessRow('Local ASR · SENSOR A',!!s.localAiReady?.A?.asr,s.localAiReady?.A?.device||'A端末で準備')}${readinessRow('Local ASR · SENSOR B',!!s.localAiReady?.B?.asr,s.localAiReady?.B?.device||'B端末で準備')}${isController()?readinessRow('Local TALK AI · このPC',state.localAi?.text==='READY',state.localAi?.textMessage||'会話分析・コメント生成用'):''}
      <div class="control-group"><div class="section-title">SENSOR ${side}</div><div class="grid2"><button class="btn" data-action="connect-hw9">HW9接続</button><button class="btn btn-quiet" data-action="connect-demo">DEMO HR</button></div><label class="mini" style="display:block;margin-top:12px">マイク接続方式</label><select id="mic-connection-type" class="input" style="width:100%;margin:6px 0 10px"><option value="UNKNOWN" ${state.micConnectionType==='UNKNOWN'?'selected':''}>不明 / 自動判定</option><option value="WIRED" ${state.micConnectionType==='WIRED'?'selected':''}>有線イヤホン・マイク</option><option value="WIRELESS" ${state.micConnectionType==='WIRELESS'?'selected':''}>ワイヤレスイヤホン・マイク</option></select><label class="mini" style="display:block;margin-top:10px">使用するマイク</label><div class="grid2" style="align-items:end"><select id="mic-device-select" class="input" style="width:100%;margin:6px 0 10px"><option value="">既定のマイク</option>${state.micDevices.map((d,i)=>`<option value="${esc(d.deviceId)}" ${state.micDeviceId===d.deviceId?'selected':''}>${esc(d.label||`マイク ${i+1}`)}</option>`).join('')}</select><button class="btn btn-quiet" data-action="refresh-mics" style="margin-bottom:10px">マイク一覧更新</button></div><button class="btn full mic-btn ${state.voiceStatus==='READY'?'good':''}" data-action="connect-mic" ${state.voiceStatus==='READY'?'disabled':''}>${state.voiceStatus==='READY'?'マイク準備完了':'マイクを準備'}</button><button class="btn full ${s.voiceBaselineReady?.[side]?'good':''}" data-action="measure-voice-baseline" ${state.voiceStatus!=='READY'||state.voiceBaselineBusy?'disabled':''}>${state.voiceBaselineBusy?`基準声を測定中… ${Math.ceil((state.voiceBaselineRemainingMs||0)/1000)}秒`:s.voiceBaselineReady?.[side]?'基準声 10秒 測定済み':'基準声を10秒測定'}</button><div class="mini">A→Bの順で、相手は黙った状態で10秒測定します。基準用質問「今日ここに来るまで、何をしていましたか？」に自然な声で答えてください。基準F0・抑揚・音量を保存し、質問中は本人基準からの変化率で判定します。</div>${preButton}</div>
      <div class="control-group local-ai-control"><div class="section-title">LOCAL AI · 無料 / 端末内処理</div><button class="btn full ${state.localAi?.asr==='READY'&&(!isController()||state.localAi?.text==='READY')?'good':''}" data-action="prepare-local-ai" ${state.localAiPreparing||state.localAi?.asr==='LOADING'||state.localAi?.text==='LOADING'?'disabled':''}>${state.localAiPreparing||state.localAi?.asr==='LOADING'||state.localAi?.text==='LOADING'?'ローカルAIを準備中…':'ローカルAIを準備'}</button><div id="local-ai-status" class="mini" style="margin-top:10px"><b>${esc(localAiStateLabel())}</b></div><div id="local-ai-detail" class="mini">${esc([state.localAi?.asrMessage,state.localAi?.textMessage].filter(Boolean).join(' / '))}</div><div class="mini" style="margin-top:8px">初回のみAIモデルをダウンロードします。SENSOR A/Bは音声認識AIを準備し、操作端末は会話分析・一言コメント用AIも準備します。音声・文字起こしはAIサービスへ送信しません。</div></div>
      ${s.stage==='SETUP'&&isController()?`<div class="control-group"><div class="section-title">PC1 参加説明</div><div class="intro-control"><button class="btn btn-quiet" data-action="intro-prev" ${Number(s.introPage||0)===0?'disabled':''}>←</button><span>${Number(s.introPage||0)+1} / 3</span><button class="btn btn-quiet" data-action="intro-next" ${Number(s.introPage||0)>=2?'disabled':''}>→</button></div></div>`:''}
      ${s.stage==='SETUP'?`<div class="control-group"><button class="btn primary full" data-action="start-acclim" ${canProceed?'':'disabled'}>${s.protocolId==='RESEARCH_V1'?'5分の順応を開始':'計測準備完了'}</button>${!canProceed?`<div class="blocker"><b>開始できない理由</b>${blockers.map(x=>`<span>• ${esc(x)}</span>`).join('')}</div>`:''}</div>`:''}
      ${s.stage==='ACCLIMATION'?`<div class="control-group"><div class="callout info">順応中 <b id="live-acclim">${fmt((s.readyAtMs||0)-now())}</b><br><small>装着直後・初期緊張の影響を減らすための時間です。</small></div></div>`:''}
      ${s.stage==='READY'?`<div class="control-group"><button class="btn primary full" data-action="start-measure" ${canProceed?'':'disabled'}>3秒後に計測開始</button>${!canProceed?`<div class="blocker">${blockers.map(x=>`<span>• ${esc(x)}</span>`).join('')}</div>`:''}</div>`:''}
      ${s.stage==='RUNNING'||s.stage==='PAUSED'?`<div class="control-group">${isController()?`<div class="grid2"><button class="btn" data-action="${s.stage==='PAUSED'?'resume':'pause'}">${s.stage==='PAUSED'?'再開':'一時停止'}</button><button class="btn danger" data-action="abort">中断</button></div>`:`<div class="callout">操作は ${esc(s.controllerDevice)} から行います。</div>`}</div>`:''}
      ${postButton}
      ${s.stage==='POST_SURVEY'&&s.protocolId==='RESEARCH_V1'&&isController()&&surveyReady?'<button class="btn primary full" data-action="calculate">結果を計算</button>':''}
      ${(s.stage==='SETUP'||s.stage==='READY'||s.stage==='PAUSED')&&isController()?`<button class="btn btn-quiet full" data-action="transfer-controller">操作権を ${esc(otherSensorRole())} へ移す</button>`:''}
      <div class="footer-note">イベントモードではアンケートを行いません。研究モードのアンケート時以外、PC2 / PC3は参加者には見せません。</div>
    </aside>
  </div>`);
}
function operatorResultSummary(s){const m=s.metrics||{},v=s.voiceMetrics||{},d=s.displayResult||{};return `<section class="panel research-summary"><div class="section-title">研究用の生指標 (RESEARCH VALUES) · 実験者のみ</div><div class="grid5"><div class="kpi"><small>方向一致 (Direction)</small><strong>${num(m.direction,1)}</strong></div><div class="kpi"><small>反応の大きさ (Magnitude)</small><strong>${num(m.magnitude,2)}</strong></div><div class="kpi"><small>時間同期 (Temporal r)</small><strong>${num(m.temporal,2)}</strong></div><div class="kpi"><small>反応バランス (Balance)</small><strong>${num(m.balance,1)}</strong></div><div class="kpi"><small>質問反応量 (Q Response)</small><strong>${num(m.questionResponse,2)}</strong></div></div><div class="grid4 score-breakdown-record"><div class="kpi"><small>Heart V3 β</small><strong>${num(d.heartScore,1)}</strong></div><div class="kpi"><small>Legacy V2</small><strong>${num(m.legacyNeoScore,1)}</strong></div><div class="kpi"><small>Voice β</small><strong>${num(v.voiceScore,1)}</strong></div><div class="kpi"><small>AI Talk Bonus</small><strong>${Number.isFinite(d.aiTalkBonus)?'+'+Number(d.aiTalkBonus).toFixed(0):'—'}</strong></div></div><p class="mini">V3・VOICE・AI BONUSはいずれもβ版です。旧V2も比較用に保存し、科学的な総合関係値としては扱いません。</p></section>`;}
const num=(v,d=1)=>Number.isFinite(Number(v))?Number(v).toFixed(d):'算出不可 (NA)';

async function startAcclim(){
  const s=state.session;if(!isController())return;
  if(isEventProtocol(s.protocolId)){await backend.updateSession(s.sessionId,{stage:'READY',status:SESSION_STATUS.READY});await backend.appendAuditLog(s.sessionId,{eventType:'EVENT_READY',details:{protocolId:s.protocolId}});return;}
  const start=now(),ready=start+PROTOCOLS[s.protocolId].acclimationSec*1000;await backend.updateSession(s.sessionId,{stage:'ACCLIMATION',acclimationStartMs:start,readyAtMs:ready,status:SESSION_STATUS.READY});await backend.appendAuditLog(s.sessionId,{eventType:'ACCLIMATION_STARTED',details:{readyAtMs:ready}});
}
async function startMeasure(){
  if(!isController())return;const blockers=getStartBlockers(state.session);if(blockers.length){alert(blockers.join('\n'));return;}
  const t0=now()+CONFIG.controllerStartLeadMs;await backend.updateSession(state.sessionId,{stage:'RUNNING',status:SESSION_STATUS.RUNNING,t0,totalPausedMs:0,pauseStartedAt:null});await backend.appendAuditLog(state.sessionId,{eventType:'MEASUREMENT_SCHEDULED',details:{t0}});startTick();
}
async function pauseMeasure(reason=null){if(!isController()||state.session?.stage!=='RUNNING')return;const s=state.session,rt=runtimeInfo(s),pauseStartedAt=now();state.session={...s,stage:'PAUSED',status:SESSION_STATUS.PAUSED,pauseStartedAt,pauseRemainingMs:rt.remaining,pausedPhase:rt.phase};await backend.updateSession(s.sessionId,{stage:'PAUSED',status:SESSION_STATUS.PAUSED,pauseStartedAt,pauseRemainingMs:rt.remaining,pausedPhase:rt.phase});await backend.appendAuditLog(s.sessionId,{eventType:'PAUSED',details:{phase:rt.phase?.phase||null,reason:reason||'MANUAL'}});}
async function resumeMeasure(){if(!isController())return;const s=state.session,pausedDur=now()-(s.pauseStartedAt||now());await backend.updateSession(s.sessionId,{stage:'RUNNING',status:SESSION_STATUS.RUNNING,totalPausedMs:(s.totalPausedMs||0)+pausedDur,pauseStartedAt:null});await backend.appendAuditLog(s.sessionId,{eventType:'RESUMED',details:{pauseDurationMs:pausedDur}});}
async function abortMeasure(){if(!isController())return;if(confirm('計測を中断しますか？\n取得済みデータは消さず、ABORTEDとして保存します。')){await backend.updateSession(state.sessionId,{stage:'ABORTED',status:SESSION_STATUS.ABORTED,abortedAt:now()});await backend.appendAuditLog(state.sessionId,{eventType:'ABORTED'});}}
async function finishMeasurement(){
  if(state.finishing||state.session?.stage!=='RUNNING'||!isController())return;state.finishing=true;
  try{
    const s=state.session;
    const needsSurvey=s.protocolId==='RESEARCH_V1';
    const next=needsSurvey?'POST_SURVEY':'CALCULATING';
    await backend.updateSession(state.sessionId,{stage:next,status:SESSION_STATUS.SYNC_PENDING,measurementEndedAt:now()});
    await backend.appendAuditLog(state.sessionId,{eventType:'MEASUREMENT_ENDED',details:{nextStage:next}});
    if(isEventProtocol(s.protocolId)&&!needsSurvey)await calculateResults();
  }finally{state.finishing=false;}
}
async function transferController(){if(!isController())return;const target=otherSensorRole();if(!confirm(`操作権を ${target} に移しますか？`))return;await backend.updateSession(state.sessionId,{controllerDevice:target});await backend.appendAuditLog(state.sessionId,{eventType:'CONTROLLER_TRANSFER',details:{from:state.role,to:target}});}
async function setIntroPage(delta){if(!isController())return;const page=clamp(Number(state.session.introPage||0)+delta,0,2);await backend.updateSession(state.sessionId,{introPage:page});}

function startTick(){
  if(state.timer)return;
  state.lastPhaseKey=phaseKey(state.session);
  state.timer=setInterval(async()=>{
    if(!state.session||state.surveyStage||state.surveyLocked)return;
    if(state.session.stage==='ACCLIMATION'&&now()>=(state.session.readyAtMs||Infinity)&&isController()){
      await backend.updateSession(state.sessionId,{stage:'READY',status:SESSION_STATUS.READY});return;
    }
    if(state.session.stage==='RUNNING'){
      if(isController()&&(!state.session.sensorReady?.A||!state.session.sensorReady?.B)){await pauseMeasure('SENSOR_LOSS');return;}
      const rt=runtimeInfo(state.session);const total=state.session.timeline?.at(-1)?.endOffsetMs||0;
      await syncVoiceCapture(rt.phase);
      if(rt.elapsed>=total){await finishMeasurement();return;}
      const key=phaseKey(state.session);if(key!==state.lastPhaseKey){state.lastPhaseKey=key;render();return;}
    }else if(state.voiceCapture?.activeMeta){
      await syncVoiceCapture(null);
    }
    updateLiveUi();
  },250);
}
function stopTick(){if(state.timer)clearInterval(state.timer);state.timer=null;state.lastPhaseKey=null;}
function updateLiveUi(){
  const s=state.session;if(!s)return;const rt=runtimeInfo(s);
  const cd=document.querySelector('#live-countdown');if(cd)cd.textContent=rt.remaining!=null?fmt(rt.remaining):'--:--';
  const ac=document.querySelector('#live-acclim');if(ac)ac.textContent=fmt((s.readyAtMs||0)-now());
  const pr=document.querySelector('#live-progress');if(pr&&rt.phase){const pct=clamp(100*(1-rt.remaining/(rt.phase.durationSec*1000)),0,100);pr.style.width=`${pct}%`;}
  const bpm=document.querySelector('#live-bpm');if(bpm)bpm.textContent=state.bpm??'--';
}

async function connectSensor(demo=false){
  const side=roleSide();if(!side)return;
  try{if(state.sensor)await state.sensor.disconnect();}catch{}
  state.sensorValidated=false;state.sensorStreamTimes=[];state.sensorStatus='CONNECTING';await backend.setSensorReady(state.sessionId,side,false).catch(()=>{});
  const Sensor=demo?DemoHeartRateSensor:HeartRateSensor;
  state.sensor=new Sensor(side,onHeartRate,async st=>{
    state.sensorStatus=st.state;state.sensorName=st.name||state.sensorName;
    if(st.state==='DISCONNECTED'){state.sensorValidated=false;state.sensorStreamTimes=[];if(state.session)await backend.setSensorReady(state.sessionId,side,false).catch(()=>{});}
    if(!state.surveyStage&&!state.surveyLocked)render();
  });
  try{await state.sensor.connect();await backend.appendAuditLog(state.sessionId,{eventType:demo?'DEMO_SENSOR_CONNECTED':'HW9_CONNECTED',details:{side}});}
  catch(e){state.sensorStatus='ERROR';alert(`センサー接続に失敗しました。\n${e.message}`);render();}
}
async function prepareLocalAiForThisPc(){
  if(state.localAiPreparing)return;
  state.localAiPreparing=true;render();
  try{
    await prepareLocalAi({asr:true,text:isController()});
    const ai=getLocalAiStatus(),side=roleSide();
    if(side&&state.sessionId)await backend.setLocalAiReady(state.sessionId,side,{asr:ai.asr==='READY',device:ai.asrDevice||null,model:CONFIG.ai.local.asrModel,preparedAt:now()});
    await backend.appendAuditLog(state.sessionId,{eventType:'LOCAL_AI_READY',details:{role:state.role,asr:ai.asr,text:ai.text,asrDevice:ai.asrDevice,textDevice:ai.textDevice,asrModel:CONFIG.ai.local.asrModel,textModel:CONFIG.ai.local.textModel}}).catch(()=>{});
  }catch(e){alert(`ローカルAIの準備に失敗しました。
${e?.message||e}

Chrome / Edge最新版・十分な空き容量・初回のみインターネット接続を確認してください。`);}
  finally{state.localAiPreparing=false;render();}
}

async function refreshMicrophoneList(){
  try{
    state.micDevices=await listAudioInputDevices();
    if(state.micDeviceId&&!state.micDevices.some(d=>d.deviceId===state.micDeviceId))state.micDeviceId='';
    render();
  }catch(e){alert(`マイク一覧を取得できませんでした。\n${e?.message||e}`);}
}

async function connectMicrophone(){
  const side=roleSide();if(!side)return;
  try{if(state.voiceCapture)await state.voiceCapture.disconnect();}catch{}
  state.voiceStatus='REQUESTING';render();
  state.voiceCapture=new VoiceCapture({onStatus:st=>{
    state.voiceStatus=st.state; if(Number.isFinite(st.speechThreshold))state.voiceThreshold=st.speechThreshold;if(Number.isFinite(st.remainingMs))state.voiceBaselineRemainingMs=st.remainingMs;
    const el=document.querySelector('[data-action="connect-mic"]');if(el&&st.state==='READY'){el.textContent='マイク準備完了';el.disabled=true;el.classList.add('good');}
  }});
  try{
    const selected=document.querySelector('#mic-connection-type')?.value||state.micConnectionType||'UNKNOWN';state.micConnectionType=selected;
    const selectedDevice=document.querySelector('#mic-device-select')?.value||state.micDeviceId||'';state.micDeviceId=selectedDevice;
    const cal=await state.voiceCapture.connect({connectionType:selected,deviceId:selectedDevice||null});state.voiceStatus='READY';state.voiceThreshold=cal.speechThreshold;state.micMeta=cal.deviceMeta;state.micConnectionType=selected==='UNKNOWN'?(cal.deviceMeta?.connectionType||'UNKNOWN'):selected;
    const profile={...(cal.deviceMeta||{}),connectionType:state.micConnectionType,ambientRms:cal.ambientRms,speechThreshold:cal.speechThreshold,selectedDeviceLabel:cal.deviceMeta?.label||null,connectedAt:now()};await backend.setMicProfile(state.sessionId,side,profile);await backend.setMicReady(state.sessionId,side,true);await backend.setVoiceBaselineReady(state.sessionId,side,false);
    await backend.appendAuditLog(state.sessionId,{eventType:'MIC_READY',details:{side,connectionType:state.micConnectionType,label:cal.deviceMeta?.label||'',ambientRms:cal.ambientRms,speechThreshold:cal.speechThreshold}});render();
  }catch(e){state.voiceStatus='ERROR';alert(`マイクの準備に失敗しました。\n${e?.message||e}`);render();}
}

async function measureVoiceBaseline(){
  const side=roleSide(),vc=state.voiceCapture;if(!side||!vc||state.voiceStatus!=='READY'||state.voiceBaselineBusy)return;
  await refreshSession();
  const latest=state.session||{};
  if(side==='B'&&!latest.voiceBaselineReady?.A){alert('基準声は A → B の順で測定します。\n先に参加者Aの10秒基準声を測定してください。');return;}
  const prompt=CONFIG.voice.baselinePrompt||'今日ここに来るまで、何をしていましたか？';
  if(!confirm(`参加者${side}の基準声を10秒測定します。

【基準用の質問】
「${prompt}」

参加者${side}だけが自然な声で話してください。相手はこの10秒間話さないでください。
片耳イヤホンのマイクは口元の近くに固定します。
準備ができたらOKを押してください。`))return;
  state.voiceBaselineBusy=true;state.voiceBaselineRemainingMs=CONFIG.voice.baselineDurationMs;render();
  try{
    await backend.updateSession(state.sessionId,{voiceBaselineActiveSide:side});
    const rec=await vc.captureBaseline(CONFIG.voice.baselineDurationMs);
    if(!rec?.quality?.valid){alert('基準声を十分に取得できませんでした。\n10秒間、普段の声量で話し続けてもう一度測定してください。');return;}
    const data={summary:rec.summary,frames:rec.frames,quality:rec.quality,durationMs:rec.durationMs,prompt,micMeta:{...(state.micMeta||rec.deviceMeta||{}),connectionType:state.micConnectionType},voiceMetricsVersion:VOICE_METRICS_VERSION,capturedAt:now()};
    state.voiceBaseline=data;vc.setBaselineSummary(rec.summary);await backend.saveVoiceBaseline(state.sessionId,side,data);
    await backend.appendAuditLog(state.sessionId,{eventType:'VOICE_BASELINE_READY',details:{side,durationMs:rec.durationMs,prompt,pitchMeanHz:rec.summary?.pitchMeanHz,pitchStdHz:rec.summary?.pitchStdHz,rmsMean:rec.summary?.rmsMean,speechRatio:rec.summary?.speechRatio,connectionType:state.micConnectionType}});await refreshSession();
  }catch(e){alert(`基準声測定に失敗しました。
${e?.message||e}`);}finally{await backend.updateSession(state.sessionId,{voiceBaselineActiveSide:null}).catch(()=>{});state.voiceBaselineBusy=false;state.voiceBaselineRemainingMs=null;state.voiceStatus='READY';render();}
}

async function processAiTranscript(captured,feature){
  const side=roleSide();if(!side||!captured?.blob?.size||feature.skipped)return;
  state.voiceProcessing++;
  try{
    const tr=await transcribeParticipantAudio({blob:captured.blob,sessionId:state.sessionId,questionIndex:feature.questionIndex,questionText:feature.questionText,side});
    if(tr)await backend.saveAiTranscript(state.sessionId,feature.questionIndex,side,{...tr,questionText:feature.questionText,micMeta:{...(state.micMeta||{}),connectionType:state.micConnectionType}});
  }catch(e){console.warn('AI transcription failed',e);await backend.appendAuditLog(state.sessionId,{eventType:'AI_TRANSCRIPTION_FAILED',details:{side,questionIndex:feature.questionIndex,message:String(e?.message||e).slice(0,160)}}).catch(()=>{});}
  finally{state.voiceProcessing=Math.max(0,state.voiceProcessing-1);}
}

async function syncVoiceCapture(phase){
  const vc=state.voiceCapture;if(!vc||state.voiceTransitionBusy)return;
  const active=vc.activeMeta;
  const skipped=phase?.phase==='QUESTION'&&isQuestionSkipped(state.session,phase);
  const shouldRecord=state.session?.stage==='RUNNING'&&phase?.phase==='QUESTION'&&!skipped;
  const qIndex=Number(phase?.globalQuestionIndex);
  if(active && (!shouldRecord || Number(active.questionIndex)!==qIndex)){
    state.voiceTransitionBusy=true;
    try{
      const captured=await vc.stopQuestion();
      if(captured){
        const meta=captured.meta||{};
        const wasSkipped=!!state.session?.skippedQuestions?.[String(meta.questionIndex)];
        const feature={questionIndex:Number(meta.questionIndex),questionText:meta.questionText||'',setId:meta.setId||null,summary:captured.summary,frames:captured.frames,skipped:wasSkipped,mimeType:captured.mimeType,micMeta:{...(state.micMeta||{}),connectionType:state.micConnectionType},baselineCapturedAt:state.voiceBaseline?.capturedAt||null,voiceMetricsVersion:VOICE_METRICS_VERSION};
        await backend.saveVoiceFeature(state.sessionId,roleSide(),feature.questionIndex,feature);
        processAiTranscript(captured,feature);
      }
    }finally{state.voiceTransitionBusy=false;}
  }
  if(shouldRecord&&!vc.activeMeta&&state.voiceStatus==='READY'){
    const rt=runtimeInfo(state.session);
    vc.startQuestion({questionIndex:qIndex,questionText:phase.questionText||'',setId:phase.setId||null,sessionElapsedAtStartMs:rt.elapsed,phaseStartOffsetMs:phase.startOffsetMs});
  }
}

async function onHeartRate({bpm,receivedAtMs,deviceId}){
  if(!Number.isFinite(bpm)||bpm<25||bpm>240)return;
  state.bpm=bpm;state.lastSamples.push({bpm,t:receivedAtMs});if(state.lastSamples.length>120)state.lastSamples.shift();
  const cutoff=receivedAtMs-CONFIG.sensorStreamValidationWindowMs;state.sensorStreamTimes=state.sensorStreamTimes.filter(t=>t>=cutoff);state.sensorStreamTimes.push(receivedAtMs);
  if(!state.sensorValidated&&state.sensorStreamTimes.length>=CONFIG.sensorStreamValidationSamples){state.sensorValidated=true;if(state.session)await backend.setSensorReady(state.sessionId,roleSide(),true);await backend.appendAuditLog(state.sessionId,{eventType:'HEART_RATE_STREAM_READY',details:{side:roleSide(),deviceId}});}
  const bpmEl=document.querySelector('#live-bpm');if(bpmEl)bpmEl.textContent=String(bpm);const chart=document.querySelector('#live-hr-chart');if(chart)chart.innerHTML=hrSvg(state.lastSamples);
  const s=state.session;if(!s||s.stage!=='RUNNING')return;
  const normalizedReceivedAtMs=receivedAtMs+backend.getClockOffsetMs();const elapsed=normalizedReceivedAtMs-s.t0-(s.totalPausedMs||0);if(elapsed<0)return;
  const phase=getPhaseAtElapsed(s.timeline,elapsed);const side=roleSide();
  await backend.saveHr({sampleId:uuid(),sessionId:s.sessionId,side,bpm,localReceiveTimeMs:receivedAtMs,timestampMs:normalizedReceivedAtMs,sessionElapsedMs:elapsed,phase:phase?.phase||null,phaseElapsedMs:phase?elapsed-phase.startOffsetMs:null,setIndex:phase?.setIndex??null,questionIndex:phase?.questionIndex??null,deviceId,sequence:Math.floor(elapsed/1000),syncOffsetMs:backend.getClockOffsetMs(),appVersion:APP_VERSION});
}

function hrSvg(samples){
  if(!samples.length)return '<div class="chart-empty">心拍ストリーム待機中</div>';
  const vals=samples.map(x=>x.bpm),min=Math.min(...vals)-3,max=Math.max(...vals)+3,w=800,h=210;const pts=samples.map((p,i)=>`${i/(samples.length-1||1)*w},${h-(p.bpm-min)/(max-min||1)*h}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" class="${roleSide()==='A'?'lineA':'lineB'}"/></svg>`;
}

function surveyScreen(){
  const stage=state.surveyStage,side=state.surveySide;
  return shell(`<main class="privacy">
    <div class="privacy-title"><div><div class="section-title">PARTICIPANT ${side}</div><h1>${stage==='pre'?'測定前アンケート':'測定後アンケート'}</h1></div><div class="privacy-lock">PRIVATE RESPONSE</div></div>
    <div class="callout privacy-note">この回答は相手には表示されません。回答中は心拍・相手のID・研究者用情報を表示しません。正解や不正解はありません。</div>
    <form id="survey-form" class="survey-form">
      ${stage==='pre'?preSurveyHtml():postSurveyHtml()}
      <div class="survey-actions"><button class="btn btn-quiet" type="button" data-action="cancel-survey">スタッフ用：アンケートを閉じる</button><button class="btn primary" type="submit">回答を確認して保存</button></div>
    </form>
  </main>`,{participant:true});
}
function preSurveyHtml(){return `
  <section class="survey-section consent-section"><div class="survey-section-head"><span>01</span><div><h2>${esc(CONSENT_TEXT.title)}</h2><p>心拍測定を始める前に確認してください。</p></div></div>${CONSENT_TEXT.body.map(x=>`<p class="consent-line">${esc(x)}</p>`).join('')}<label class="check-card important"><input type="checkbox" name="consentAccepted" value="yes" required><span>${esc(CONSENT_TEXT.checkbox)}</span></label></section>
  <section class="survey-section"><div class="survey-section-head"><span>02</span><div><h2>あなたが考える現在の関係性</h2><p>この相手との現在の関係として、最も近いものを1つ選んでください。</p></div></div><div class="relationship-grid">${RELATIONSHIP_OPTIONS.map((x,i)=>`<label class="choice-card"><input type="radio" name="relationship" value="${esc(x)}" ${i===0?'required':''}><span>${esc(x)}</span></label>`).join('')}</div><div id="relationship-other-wrap" class="field relationship-other" hidden><label>その他の場合</label><input name="relationshipOther" id="relationship-other" placeholder="現在の関係を入力してください" disabled></div></section>
  <section class="survey-section"><div class="survey-section-head"><span>03</span><div><h2>相手との関係について</h2><p>今の自分の感覚に最も近い数値を選んでください。</p></div></div>${PRE_RELATIONSHIP_ITEMS.map(rangeField).join('')}</section>
  <section class="survey-section"><div class="survey-section-head"><span>04</span><div><h2>今のあなたの状態</h2><p>心拍に影響する現在の状態を確認します。</p></div></div>${PRE_STATE_ITEMS.map(rangeField).join('')}</section>
  <section class="survey-section optional-section"><div class="survey-section-head"><span>05</span><div><h2>任意項目（研究で必要な場合のみ）</h2><p>この項目は任意回答です。回答したくない場合は「回答しない」を選んでください。個別の回答は相手に表示しません。</p></div></div>${rangeField(OPTIONAL_ITEM,{optional:true})}<label class="check-card"><input type="checkbox" name="O1_skip" value="yes"><span>回答しない</span></label></section>
  <section class="survey-section"><div class="survey-section-head"><span>06</span><div><h2>測定前の簡易確認</h2><p>該当するものをすべて選んでください。</p></div></div><div class="check-grid">${CONDITION_OPTIONS.map(x=>`<label class="check-card"><input type="checkbox" name="condition" value="${esc(x.value)}"><span>${esc(x.label)}</span></label>`).join('')}</div></section>`;}
function postSurveyHtml(){return `
  <div class="callout info"><b>NEO SCOREを見る前に回答してください。</b><br>結果を先に見ると、その点数が自己評価に影響する可能性があります。</div>
  <section class="survey-section"><div class="survey-section-head"><span>01</span><div><h2>測定後の状態</h2><p>今回の会話・質問について回答してください。</p></div></div>${POST_ITEMS.map(rangeField).join('')}</section>
  <section class="survey-section"><div class="survey-section-head"><span>02</span><div><h2>自由記述（任意）</h2><p>今回の測定で気になったこと、普段と違ったことなどがあれば記入してください。</p></div></div><textarea name="freeText" rows="5" placeholder="任意で入力してください"></textarea></section>`;}
function rangeField(item,{optional=false}={}){
  return `<div class="survey-question" data-question="${item.id}"><div class="survey-question-title"><span>${esc(item.id)}</span><strong>${esc(item.question)}</strong></div><div class="scale-anchors"><span><b>0</b>${esc(item.low)}</span><span><b>100</b>${esc(item.high)}</span></div><div class="range-row"><span>0</span><input type="range" min="0" max="100" step="1" value="50" name="${item.id}" data-range="${item.id}" ${optional?'data-optional="true"':''}><output id="out-${item.id}" class="range-value">50</output></div><div class="range-ticks"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div></div>`;
}
function surveyCompleteScreen(){
  const x=state.surveyLocked;
  return shell(`<div class="display-center survey-complete"><div class="complete-mark">✓</div><div class="eyebrow">RESPONSE SAVED</div><h1>回答を保存しました</h1><p class="subtitle">個別の回答内容は相手には表示されません。<br><b>PCを実験担当者へ返してください。</b></p><button class="btn btn-quiet staff-return" data-action="staff-return">スタッフ用：運用画面に戻る</button><p class="mini">${esc(x?.stage==='pre'?'測定前':'測定後')} · Participant ${esc(x?.side||'')}</p></div>`,{participant:true});
}
async function submitSurvey(form){
  const button=form.querySelector('button[type="submit"]');if(button){button.disabled=true;button.textContent='保存中…';}
  try{
    const fd=new FormData(form),data={};for(const [k,v] of fd.entries()){if(k==='condition'){data.condition??=[];data.condition.push(v);}else data[k]=v;}
    for(const [k,v] of Object.entries(data))if(/^(R\d|S\d|P\d|O1)$/.test(k))data[k]=Number(v);
    if(data.O1_skip){data.O1=null;delete data.O1_skip;}
    if(data.condition?.includes('none'))data.condition=['none'];
    data.consentVersion=CONSENT_VERSION;if(state.surveyStage==='pre')data.consentAccepted=data.consentAccepted==='yes';data.submittedFromRole=state.role;
    const side=state.surveySide,stage=state.surveyStage;
    const storageStage=stage;
    const statusKey=`${stage}${side}`;
    await backend.saveSurvey(state.sessionId,side,storageStage,data);await backend.setSurveyStatus(state.sessionId,statusKey,true);await backend.appendAuditLog(state.sessionId,{eventType:'SURVEY_SUBMITTED',details:{side,stage:storageStage,questionnaireVersion:data.questionnaireVersion||null}});
    state.surveyLocked={side,stage};state.surveyStage=null;state.surveySide=null;render();
  }catch(e){alert(`回答を保存できませんでした。\n${e?.message||e}`);if(button){button.disabled=false;button.textContent='回答を確認して保存';}}
}
function displayScreen(){
  const s=state.session;const child=!!(s.protocolId==='EVENT_V2'&&s.childSupport);
  if(s.stage==='RESULT')return resultDisplay(s);if(s.stage==='ABORTED')return phaseDisplay('MEASUREMENT ENDED','計測を終了しました。スタッフの案内をお待ちください。');
  if(s.stage==='SETUP')return explainDisplay(s);
  if(s.stage==='ACCLIMATION')return phaseDisplay('CALIBRATING','心拍センサーをつけたまま、楽な姿勢でお待ちください。',(s.readyAtMs||now())-now());
  if(s.stage==='READY')return phaseDisplay(child?'じゅんび OK！':'SYSTEM READY',child?'スタッフがスタートするまで まっていてね。':'準備ができました。スタッフの案内をお待ちください。');
  if(s.stage==='POST_SURVEY')return phaseDisplay('MEASUREMENT COMPLETE','最後のアンケートに回答してください。');
  if(s.stage==='CALCULATING')return phaseDisplay(child?'けっかを つくっているよ':'ANALYZING REACTIONS',child?'ドキドキと こえを しらべています。':'心拍・声・会話リアクションを解析しています。');
  if(s.stage==='PAUSED')return phaseDisplay(child?'ちょっと まってね':'MEASUREMENT PAUSED',child?'スタッフが かくにんしています。':'しばらくお待ちください。');
  if(s.stage==='RUNNING'){
    const rt=runtimeInfo(s);if(!rt.phase)return phaseDisplay(child?'もうすぐ はじまるよ':'PREPARING',child?'そのまま まっていてね。':'まもなく始まります。',Math.max(0,(s.t0||now())-now()));
    if(rt.phase.phase==='QUESTION'){
      const skipped=isQuestionSkipped(s,rt.phase);
      if(child&&skipped)return shell(`<div class="display-center question-display child-display skipped-display"><div class="eyebrow">しつもん ${(rt.phase.globalQuestionIndex??0)+1}</div><div class="question-large child-question-large">このしつもんは<br>スキップしました</div><p class="display-hint child-hint">つぎのしつもんまで まっていてね。</p><div id="live-countdown" class="countdown display-countdown">${fmt(rt.remaining)}</div><div class="progress"><span id="live-progress" style="width:${100*(1-rt.remaining/(rt.phase.durationSec*1000))}%"></span></div></div>`,{display:true});
      if(!child&&skipped)return shell(`<div class="display-center question-display skipped-display"><div class="eyebrow">QUESTION ${String((rt.phase.globalQuestionIndex??0)+1).padStart(2,'0')}</div><div class="question-large">この質問はスキップしました</div><p class="display-hint">次の質問までお待ちください。</p><div id="live-countdown" class="countdown display-countdown">${fmt(rt.remaining)}</div><div class="progress"><span id="live-progress" style="width:${100*(1-rt.remaining/(rt.phase.durationSec*1000))}%"></span></div></div>`,{display:true});
      return shell(`<div class="display-center question-display ${child?'child-display':''}"><div class="eyebrow">${child?'しつもん':'QUESTION'} ${String((rt.phase.globalQuestionIndex??0)+1).padStart(2,'0')}</div><div class="question-large ${child?'child-question-large':''}">${esc(rt.phase.questionText)}</div><p class="display-hint ${child?'child-hint':''}">${child?'二人とも こたえてみてね！':'二人で自由に話してください。正解・不正解はありません。'}</p><div id="live-countdown" class="countdown display-countdown">${fmt(rt.remaining)}</div><div class="progress"><span id="live-progress" style="width:${100*(1-rt.remaining/(rt.phase.durationSec*1000))}%"></span></div>${child?'':'<div class="twin-wave" aria-hidden="true"><i></i><i></i></div>'}</div>`,{display:true});
    }
    if(rt.phase.phase==='BASELINE')return phaseDisplay(child?'まずは そのまま':'CALIBRATING',child?'そのまま まっていてね。':'そのままお待ちください。',rt.remaining);
    if(rt.phase.phase==='RESET')return phaseDisplay(child?'つぎの しつもんへ':'NEXT QUESTION',child?'すこし まっていてね。':'次の質問まで少しお待ちください。',rt.remaining);
    if(rt.phase.phase==='RECOVERY')return phaseDisplay(child?'さいごに そのまま':'RECOVERY',child?'もうすこしだけ まっていてね。':'そのままお待ちください。',rt.remaining);
  }
  return explainDisplay(s);
}
function explainDisplay(s){
  const child=!!(s.protocolId==='EVENT_V2'&&s.childSupport),event=s.protocolId==='EVENT_V2';
  const pages=child?[
    {n:'01',title:'LOVE METER NEOって なに？',body:'二人で しつもんに こたえながら、「ドキドキ」と こえのへんかを はかるよ。',sub:'ドキドキや こえが どんなふうに うごくかを見ながら、二人のはんのうを けんきゅうしています。'},
    {n:'02',title:'どうするの？',body:'しつもんが でたら、二人とも こたえてみてね。',sub:'わからない・こたえたくない しつもんは、スタッフに言えばスキップできるよ。'},
    {n:'03',title:'だいじょうぶだよ',body:'せいかいや まちがいは ありません。',sub:'しつもんちゅうの こえはAIで ぶんせきします。LOVE METERには こえのファイルを のこしません。いやだと おもったらスタッフに おしえてね。'}
  ]:event?[
    {n:'01',title:'LOVE METER NEOとは？',body:'二人で同じ質問に答えながら、心拍と声・会話の反応を測って見える化する体験です。',sub:'心拍の動きに加え、声の抑揚や会話の特徴も分析し、二人の反応と関係性のつながりを研究しています。'},
    {n:'02',title:'おねがい',body:'質問が表示されたら、二人とも自由に答えてください。',sub:'正解や不正解はありません。答えにくい質問は、スタッフに伝えればスキップできます。'},
    {n:'03',title:'結果について',body:'結果は、今回の心拍・声・会話リアクションを分かりやすく表示する体験用スコアです。',sub:'「なかよし度」や「相性」を断定する点数ではありません。質問中の音声はAI分析に使い、生音声はLOVE METER側には保存しません。途中でやめたい場合はスタッフに伝えてください。'}
  ]:[
    {n:'01',title:'LOVE METER NEO について',body:'二人が同じ質問に答えている間の心拍と音声を同時に記録し、心拍反応・声の特徴・会話内容を分析する研究システムです。',sub:'心拍・音声・会話特徴と、親しさ・安心感・信頼などの自己申告との関係を調べます。'},
    {n:'02',title:'この研究の目的',body:'実験データを積み重ね、二人の関係性にみられる特徴を0〜100の数値で表現できる指標をつくることを目指しています。',sub:'質問が表示されたら二人で自由に話してください。正解・不正解はありません。'},
    {n:'03',title:'大切なこと',body:'心拍は緊張・運動・暑さ・体調などでも変化します。',sub:'LOVE METER NEOは心拍・音声・AIだけで「好き」「相性が良い」などを断定するものではありません。質問中の音声はAI分析に使い、生音声はLOVE METER側には保存しません。アンケート回答は相手には表示されません。'}
  ];
  const idx=clamp(Number(s.introPage||0),0,2),p=pages[idx];
  return shell(`<div class="display-center intro-display ${child?'child-intro-display':''}"><div class="intro-index">${p.n}</div><div class="eyebrow">${child?'こどもサポート':'PARTICIPANT GUIDE'}</div><h1>${esc(p.title)}</h1><p class="intro-main">${esc(p.body)}</p><p class="intro-sub">${esc(p.sub)}</p><div class="intro-dots">${pages.map((_,i)=>`<span class="${i===idx?'active':''}"></span>`).join('')}</div>${idx===2?`<p class="standby">${child?'スタッフが はじめるまで まっていてね。':'準備ができたら、スタッフの案内をお待ちください。'}</p>`:''}</div>`,{display:true});
}
function phaseDisplay(title,msg,remaining=null){return shell(`<div class="display-center phase-display"><div class="phase-visual"><span></span><span></span><span></span></div><div class="eyebrow">LOVE METER NEO</div><h1>${esc(title)}</h1><p class="subtitle">${esc(msg)}</p>${remaining!=null?`<div id="live-countdown" class="countdown display-countdown">${fmt(remaining)}</div>`:''}</div>`,{display:true});}

function buildMiniTimeline(cleanA,cleanB,maxPoints=70){
  const sample=(arr)=>{if(!arr?.length)return[];const step=Math.max(1,Math.ceil(arr.length/maxPoints));return arr.filter((_,i)=>i%step===0).map(x=>({t:x.elapsedMs,bpm:x.cleanBpm})).filter(x=>Number.isFinite(x.bpm));};
  return {A:sample(cleanA),B:sample(cleanB)};
}
function miniTimelineSvg(tl){
  const A=tl?.A||[],B=tl?.B||[];const all=[...A,...B];if(!all.length)return '<div class="chart-empty">タイムラインデータなし</div>';
  const w=1000,h=120,minT=Math.min(...all.map(x=>x.t)),maxT=Math.max(...all.map(x=>x.t)),minB=Math.min(...all.map(x=>x.bpm))-2,maxB=Math.max(...all.map(x=>x.bpm))+2;
  const path=arr=>arr.map(p=>`${(p.t-minT)/(maxT-minT||1)*w},${h-(p.bpm-minB)/(maxB-minB||1)*h}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="A/B heart reaction timeline"><polyline class="lineA" points="${path(A)}"/><polyline class="lineB" points="${path(B)}"/></svg>`;
}
function scoreRank(score){
  if(score>=95)return 'SSS';if(score>=90)return 'SS';if(score>=85)return 'S';if(score>=75)return 'A';if(score>=65)return 'B';return 'C';
}
function metricChip(label,value,suffix=''){
  return `<div class="karaoke-metric"><small>${esc(label)}</small><strong>${Number.isFinite(value)?Math.round(value)+suffix:'—'}</strong></div>`;
}
function resultDisplay(s){
  const d=s.displayResult||{},score=Number.isFinite(d.neoScore)?Math.round(d.neoScore):null,child=!!(s.protocolId==='EVENT_V2'&&s.childSupport);
  if(score==null)return shell(`<div class="display-center ${child?'child-display':''}"><div class="eyebrow">測定不成立 (MEASUREMENT INCOMPLETE)</div><h1>十分なデータを取得できませんでした</h1><p class="subtitle">スタッフの案内に従って、必要に応じて再計測してください。</p><button class="btn btn-quiet" data-action="display-home">ホームへ戻る</button></div>`,{display:true});
  const rank=d.rank||scoreRank(score),heart=d.heartScore,voice=d.voiceScore,bonus=d.aiTalkBonus||0,vm=d.voiceMetrics||{};
  const comment=d.aiComment||d.comment||'今回のリアクションをチェックしてみよう！';
  return shell(`<div class="result-page karaoke-result ${child?'child-result-page':''}">
    <div class="result-sparkles" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="karaoke-head"><div><div class="eyebrow">HEART × VOICE × AI TALK</div><h1>LOVE METER RESULT</h1></div><div class="karaoke-beta">EXPERIENCE SCORE β</div></div>
    <section class="karaoke-hero">
      <div class="score-orbit"><div class="score-ring"><small>SCORE</small><strong>${score}</strong><span>pts</span></div><div class="rank-badge"><small>RANK</small><b>${esc(rank)}</b></div></div>
      <div class="karaoke-breakdown">
        <div class="score-lane heart-lane"><span>HEART</span><b>${Number.isFinite(heart)?Math.round(heart):'—'}</b><i style="--v:${Number.isFinite(heart)?clamp(heart,0,100):0}%"></i></div>
        <div class="score-lane voice-lane"><span>VOICE</span><b>${Number.isFinite(voice)?Math.round(voice):'—'}</b><i style="--v:${Number.isFinite(voice)?clamp(voice,0,100):0}%"></i></div>
        <div class="score-lane bonus-lane"><span>AI TALK BONUS</span><b>+${Math.round(bonus)}</b><i style="--v:${clamp((bonus/CONFIG.experienceScore.aiTalkBonusMax)*100,0,100)}%"></i></div>
      </div>
      <div class="ai-comment-card"><div class="ai-comment-label">AI RESULT COMMENT</div><p>“${esc(comment)}”</p></div>
    </section>
    <section class="karaoke-detail-grid">
      <div class="karaoke-panel"><div class="section-title">VOICE ANALYSIS β</div><div class="karaoke-metrics">${metricChip('PITCH DYNAMICS β',vm.pitchResponse)}${metricChip('EXPRESSIVENESS',vm.expressiveness)}${metricChip('SPEECH BALANCE',vm.speechBalance)}${metricChip('TURN TAKING',vm.turnTaking)}</div></div>
      <div class="karaoke-panel radar-mini"><div class="section-title">HEART 5 METRICS</div>${radarSvg(d.radar||{},360,child)}</div>
      <div class="karaoke-panel"><div class="section-title">MOST REACTIVE QUESTION</div><div class="result-question karaoke-question">${esc(d.mostReactiveQuestion||'—')}</div><div class="ai-talk-note"><b>AI TALK BONUS</b><span>${d.aiTalkSummary?esc(d.aiTalkSummary):'会話内容は補助的なボーナス評価です。'}</span></div></div>
    </section>
    <div class="karaoke-disclaimer">このスコアは体験用β版です。心拍・声・AIだけで、親密さ・恋愛感情・相性を断定するものではありません。</div>
    <button class="btn btn-quiet result-home karaoke-home" data-action="display-home">ホームへ戻る</button>
  </div>`,{display:true});
}
async function loadSupplementalForResult(sessionId,expectedQuestions){
  let voiceA=[],voiceB=[],transcripts=[],ai=[];
  for(let i=0;i<90;i++){
    [voiceA,voiceB,transcripts,ai]=await Promise.all([backend.loadVoiceFeatures(sessionId,'A'),backend.loadVoiceFeatures(sessionId,'B'),backend.loadAiTranscripts(sessionId),backend.loadAiAnalyses(sessionId)]);
    const pairs=new Map();for(const t of transcripts){const q=Number(t.questionIndex);if(!Number.isFinite(q))continue;const x=pairs.get(q)||{};x[t.side]=t;pairs.set(q,x);}
    const completePairs=[...pairs.values()].filter(x=>x.A&&x.B).length;
    const voiceReady=voiceA.length>=expectedQuestions&&voiceB.length>=expectedQuestions;
    const transcriptReady=!CONFIG.ai.enabled||!CONFIG.ai.requireBothTranscriptsForBonus||completePairs>=expectedQuestions;
    if(voiceReady&&transcriptReady)break;
    await new Promise(r=>setTimeout(r,1000));
  }
  return {voiceA,voiceB,transcripts,ai};
}

async function ensureAiTalkAnalyses(sessionId,supplemental,skippedQuestionIndexes=[]){
  if(!CONFIG.ai.enabled)return supplemental.ai||[];
  const existing=new Map((supplemental.ai||[]).map(x=>[Number(x.questionIndex),x]));
  const byQ=new Map();for(const t of supplemental.transcripts||[]){const q=Number(t.questionIndex);if(!Number.isFinite(q))continue;const row=byQ.get(q)||{};row[t.side]=t;byQ.set(q,row);}
  const voiceByQ=new Map([...(supplemental.voiceA||[]),...(supplemental.voiceB||[])].map(x=>[Number(x.questionIndex),x]));
  for(const [q,row] of [...byQ.entries()].sort((a,b)=>a[0]-b[0])){
    if(skippedQuestionIndexes.includes(q)||existing.has(q))continue;
    if(CONFIG.ai.requireBothTranscriptsForBonus&&(!row.A||!row.B))continue;
    const transcriptA=String(row.A?.transcript||''),transcriptB=String(row.B?.transcript||'');
    if(!transcriptA&&!transcriptB)continue;
    const questionText=row.A?.questionText||row.B?.questionText||voiceByQ.get(q)?.questionText||'';
    try{
      const ai=await analyzeConversationTranscripts({sessionId,questionIndex:q,questionText,transcriptA,transcriptB});
      if(ai){const saved={...ai,questionText,transcriptSides:{A:!!row.A,B:!!row.B},aiTalkVersion:AI_TALK_VERSION};await backend.saveAiAnalysis(sessionId,q,saved);existing.set(q,{...saved,questionIndex:q});}
    }catch(e){console.warn('AI paired talk analysis failed',e);await backend.appendAuditLog(sessionId,{eventType:'AI_TALK_FAILED',details:{questionIndex:q,message:String(e?.message||e).slice(0,160)}}).catch(()=>{});}
  }
  return [...existing.values()].sort((a,b)=>Number(a.questionIndex)-Number(b.questionIndex));
}

async function calculateResults(){
  const s=await backend.loadSession(state.sessionId);await backend.flushOutbox();const a=await backend.loadHr(s.sessionId,'A'),b=await backend.loadHr(s.sessionId,'B');
  const skippedQuestionIndexes=Object.keys(s.skippedQuestions||{}).map(Number).filter(Number.isFinite);
  const result=computeSessionMetrics({aSamples:a,bSamples:b,timeline:s.timeline,protocolId:s.protocolId,skippedQuestionIndexes});
  const expectedQuestions=(s.timeline||[]).filter(x=>x.phase==='QUESTION'&&!skippedQuestionIndexes.includes(Number(x.globalQuestionIndex))).length;
  const supplemental=await loadSupplementalForResult(s.sessionId,expectedQuestions);
  const validA=supplemental.voiceA.filter(x=>!x.skipped),validB=supplemental.voiceB.filter(x=>!x.skipped);
  const voiceMetrics=computeVoiceSessionMetrics(validA,validB);
  supplemental.ai=await ensureAiTalkAnalyses(s.sessionId,supplemental,skippedQuestionIndexes);
  const aiRows=supplemental.ai.filter(x=>!skippedQuestionIndexes.includes(Number(x.questionIndex)));
  const aiTalkBonus=clamp(aiRows.reduce((sum,x)=>sum+Number(x.bonus||x.analysis?.bonus||0),0),0,CONFIG.experienceScore.aiTalkBonusMax);
  const heartScore=result.session.neoScore,voiceScore=voiceMetrics.valid?voiceMetrics.voiceScore:null;
  const baseScore=Number.isFinite(heartScore)&&Number.isFinite(voiceScore)
    ?CONFIG.experienceScore.heartWeight*heartScore+CONFIG.experienceScore.voiceWeight*voiceScore
    :heartScore;
  const finalScore=Number.isFinite(baseScore)?clamp(baseScore+aiTalkBonus,0,100):null;
  const most=result.perQuestion.filter(x=>!x.skipped&&Number.isFinite(x.pairQResponse)).sort((x,y)=>y.pairQResponse-x.pairQResponse)[0];
  const aiTalkSummary=aiRows.map(x=>x.analysis?.summary).filter(Boolean).slice(0,2).join(' / ');
  const highlights=[];
  if(Number.isFinite(voiceMetrics.turnTaking))highlights.push(`会話交代 ${Math.round(voiceMetrics.turnTaking)}点`);
  if(Number.isFinite(voiceMetrics.speechBalance))highlights.push(`発話バランス ${Math.round(voiceMetrics.speechBalance)}点`);
  if(Number.isFinite(result.session.balance))highlights.push(`心拍Balance ${Math.round(result.session.balance)}点`);
  if(aiTalkSummary)highlights.push(aiTalkSummary);
  let aiComment=null;
  try{
    const generated=await generateResultComment({heartScore,voiceScore,aiTalkBonus,finalScore,highlights,variationSeed:Math.floor(Math.random()*1000000)});
    aiComment=generated?.comment||null;
  }catch(e){console.warn('AI result comment failed',e);}
  const display={
    neoScore:finalScore,heartScore,voiceScore,aiTalkBonus,rank:Number.isFinite(finalScore)?scoreRank(finalScore):null,
    radar:result.session.radar,scoreBreakdown:result.session.displayBreakdown,voiceMetrics,
    mostReactiveQuestion:most?.question?.questionText||null,comment:reactionComment(result.session),aiComment:aiComment||reactionComment(result.session),aiTalkSummary,
    miniTimeline:buildMiniTimeline(result.cleanA,result.cleanB),
  };
  await backend.updateSession(s.sessionId,{stage:'RESULT',status:SESSION_STATUS.COMPLETE,metrics:result.session,questionMetrics:result.perQuestion,quality:result.quality,voiceMetrics,aiTalkAnalysis:aiRows,displayResult:display,completedAt:now()});
  await backend.appendAuditLog(s.sessionId,{eventType:'RESULT_CALCULATED',details:{quality:result.quality?.label,heartScore,voiceScore,aiTalkBonus,finalScore,skippedQuestionIndexes}});
}

function reactionComment(m){
  const d=m.displayBreakdown||{},sync=d.syncScore,reaction=d.reactionScore;
  if(!Number.isFinite(sync)||!Number.isFinite(reaction))return '今回は十分なデータを取得できませんでした。';
  if(sync>=75&&reaction>=75)return '二人とも心拍が大きく反応し、反応の方向やタイミングにも強い重なりが見られました。';
  if(sync>=70)return '二人の心拍は、反応の方向やタイミングが比較的よく重なる場面が見られました。';
  if(reaction>=70)return '質問に対して、二人の心拍に比較的大きなリアクションが見られました。';
  if(sync>=55&&reaction>=55)return '心拍の反応量と二人の反応パターンの両方に、中程度の重なりが見られました。';
  if(reaction>=55)return '質問によって心拍が動く場面はありましたが、二人の反応パターンには違いも見られました。';
  return '今回の二人には、それぞれ異なる心拍リアクションのパターンが見られました。';
}

function recordsPinScreen(){return shell(`<div class="display-center records-pin"><div class="records-lock-icon">⌁</div><div class="eyebrow">研究記録 (RESEARCH RECORDS)</div><h1>管理PIN</h1><p class="subtitle">研究記録を表示するには管理PINを入力してください。</p><div class="field pin-field"><input id="records-pin" type="password" inputmode="numeric" maxlength="12" autocomplete="off" placeholder="••••"></div><button class="btn primary" data-action="unlock-records">記録画面を開く (RECORDS)</button><p class="mini">30分間操作がない場合は自動でロックします。</p></div>`);}
function recordsScreen(){return shell(`<div class="records-header"><div><div class="section-title">研究ダッシュボード (RESEARCH DASHBOARD)</div><h1>LOVE METER NEO 記録 (Records)</h1></div><div class="actions"><button class="btn" data-action="reload-records">更新</button><button class="btn btn-quiet" data-action="lock-records">記録をロック (LOCK)</button></div></div><nav class="records-nav">${[['records','記録 (Records)'],['participants','参加者 (Participants)'],['pairs','ペア (Pairs)'],['analysis','分析 (Analysis)'],['export','書き出し (Export)']].map(([id,label])=>`<button data-action="records-view" data-view="${id}" class="${state.recordsView===id?'active':''}">${label}</button>`).join('')}</nav><div id="records-body" class="records-body"><div class="panel"><p class="subtitle">読み込み中...</p></div></div><div class="security-footnote">現在のGitHub公開開発版ではPINはブラウザ側のハッシュ照合です。実参加者データを本番運用する前に、Cloud Function＋本番Security Rulesへ切り替えます。</div>`);}

async function hydrateRecords(){
  const el=document.querySelector('#records-body');if(!el)return;touchRecordsActivity();
  try{state.recordsCache=(await backend.allSessions()).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));await renderRecordsBody();}
  catch(e){el.innerHTML=`<div class="panel"><div class="callout bad">記録を読み込めませんでした。<br>${esc(e?.message||e)}</div></div>`;}
}
async function renderRecordsBody(){
  const el=document.querySelector('#records-body');if(!el)return;touchRecordsActivity();
  if(state.recordsSelectedSessionId){await renderSessionDetail(el);bindDynamic();return;}
  if(state.recordsView==='participants')el.innerHTML=participantsView();
  else if(state.recordsView==='pairs')el.innerHTML=pairsView();
  else if(state.recordsView==='analysis')el.innerHTML=analysisView();
  else if(state.recordsView==='export')el.innerHTML=exportView();
  else el.innerHTML=recordsListView();
  bindDynamic();
}
function filteredSessions(){const q=state.recordsSearch.toLowerCase();return state.recordsCache.filter(s=>{
  if(state.recordsProtocol!=='ALL'&&s.protocolId!==state.recordsProtocol)return false;if(state.recordsStatus!=='ALL'&&s.status!==state.recordsStatus)return false;
  if(!q)return true;return [s.displayId,s.participantAId,s.participantBId,s.canonicalPairKey,s.questionCategory].some(x=>String(x||'').toLowerCase().includes(q));
});}
function recordsListView(){
  const rows=filteredSessions(),selected=state.exportSelected.size;
  return `<div class="panel records-panel"><div class="records-controls"><input id="records-search" placeholder="測定ID / 参加者ID / ペアを検索" value="${esc(state.recordsSearch)}"><select id="records-protocol"><option value="ALL">すべての実験方式 (Protocol)</option>${['RESEARCH_V1','EVENT_V2','EVENT_V1'].map(x=>`<option value="${x}" ${state.recordsProtocol===x?'selected':''}>${protocolLabel(x)}</option>`).join('')}</select><select id="records-status"><option value="ALL">すべての状態 (Status)</option>${Object.values(SESSION_STATUS).map(x=>`<option value="${x}" ${state.recordsStatus===x?'selected':''}>${statusLabel(x)}</option>`).join('')}</select></div>
    <div class="export-selection-bar"><span><b>${selected} 件</b> 選択中</span><button class="btn btn-quiet" data-action="export-select-visible">表示中をすべて選択</button><button class="btn btn-quiet" data-action="export-clear-selected">選択解除</button><button class="btn primary" data-action="export-open" ${selected?'':'disabled'}>選択した実験をまとめて書き出す →</button></div>
    <div class="table-wrap"><table class="records-table"><thead><tr><th>選択</th><th>測定ID (Measurement)</th><th>日時 (Date)</th><th>実験方式 (Protocol)</th><th>ペア (Pair)</th><th>関係カテゴリ (Category)</th><th>状態 (Status)</th><th>品質 (Quality)</th><th>VOICE</th><th>NEO SCORE</th></tr></thead><tbody>${rows.map(s=>`<tr class="clickable" data-session-open="${esc(s.sessionId)}"><td><input class="export-session-checkbox" type="checkbox" aria-label="${esc(s.displayId)} を選択" data-export-session="${esc(s.sessionId)}" ${state.exportSelected.has(s.sessionId)?'checked':''}></td><td><b>${esc(s.displayId)}</b></td><td>${new Date(s.createdAt||0).toLocaleString('ja-JP')}</td><td>${esc(protocolLabel(s.protocolId))}</td><td>${esc(s.participantAId)} × ${esc(s.participantBId)}</td><td>${esc(s.questionCategory||'—')}</td><td>${esc(statusLabel(s.status))}</td><td>${esc(qualityLabel(s.quality?.label||s.metrics?.quality?.label))}</td><td>${Number.isFinite(s.voiceMetrics?.voiceScore)?Math.round(s.voiceMetrics.voiceScore):'—'}</td><td>${Number.isFinite(s.displayResult?.neoScore)?Math.round(s.displayResult.neoScore):'—'}</td></tr>`).join('')}</tbody></table></div>${!rows.length?'<p class="subtitle">条件に一致する記録がありません。</p>':''}</div>`;
}
function participantsView(){
  const map=new Map();for(const s of state.recordsCache)for(const id of [s.participantAId,s.participantBId]){if(!id)continue;const x=map.get(id)||{id,count:0,last:0,partners:new Set()};x.count++;x.last=Math.max(x.last,s.createdAt||0);const other=id===s.participantAId?s.participantBId:s.participantAId;if(other)x.partners.add(other);map.set(id,x);}
  const rows=[...map.values()].sort((a,b)=>b.last-a.last);return `<div class="panel"><div class="section-title">参加者 (PARTICIPANTS)</div><h2>参加者ID別の履歴</h2><table class="records-table"><thead><tr><th>参加者ID (Participant ID)</th><th>測定回数 (Sessions)</th><th>相手人数 (Counterparts)</th><th>最終測定 (Last session)</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.id)}</b></td><td>${x.count}</td><td>${x.partners.size}</td><td>${new Date(x.last).toLocaleString('ja-JP')}</td></tr>`).join('')}</tbody></table></div>`;
}
function pairsView(){
  const map=new Map();for(const s of state.recordsCache){const k=s.canonicalPairKey||canonicalPair(s.participantAId,s.participantBId);const x=map.get(k)||{key:k,count:0,last:0,scores:[]};x.count++;x.last=Math.max(x.last,s.createdAt||0);if(Number.isFinite(s.displayResult?.neoScore))x.scores.push(s.displayResult.neoScore);map.set(k,x);}
  const rows=[...map.values()].sort((a,b)=>b.last-a.last);return `<div class="panel"><div class="section-title">ペア (PAIRS)</div><h2>ペアの反復測定</h2><p class="mini">自動的に「関係が良くなった／悪くなった」とは判定しません。</p><table class="records-table"><thead><tr><th>ペアID (Canonical Pair)</th><th>測定回数 (Sessions)</th><th>最新測定 (Latest)</th><th>表示スコア平均 (Display score avg.)</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.key)}</td><td>${x.count}</td><td>${new Date(x.last).toLocaleString('ja-JP')}</td><td>${x.scores.length?(x.scores.reduce((a,b)=>a+b,0)/x.scores.length).toFixed(1):'—'}</td></tr>`).join('')}</tbody></table></div>`;
}
function analysisView(){
  const total=state.recordsCache.length,research=state.recordsCache.filter(x=>x.protocolId==='RESEARCH_V1').length,event=state.recordsCache.filter(x=>isEventProtocol(x.protocolId)).length,complete=state.recordsCache.filter(x=>x.status==='COMPLETE').length,good=state.recordsCache.filter(x=>(x.quality?.label||x.metrics?.quality?.label)==='GOOD').length;
  return `<div class="panel"><div class="section-title">分析 (ANALYSIS) · V1 BASIC</div><h2>データセット概要</h2><div class="grid5"><div class="kpi"><small>全件 (All)</small><strong>${total}</strong></div><div class="kpi"><small>研究 (Research)</small><strong>${research}</strong></div><div class="kpi"><small>イベント (Event)</small><strong>${event}</strong></div><div class="kpi"><small>完了 (Complete)</small><strong>${complete}</strong></div><div class="kpi"><small>良好 (GOOD)</small><strong>${good}</strong></div></div><div class="callout info" style="margin-top:18px">研究モード (RESEARCH_V1) とイベントモード (EVENT_V2 / 旧EVENT_V1) は統計的に混ぜず、フィルタ・エクスポート時も別の実験方式として扱います。</div></div>`;
}
function exportView(){
  const total=state.exportSelected.size;
  return `<div class="panel"><div class="section-title">研究データ共有 (RESEARCH EXPORT / EXPORT_V1)</div><h2>複数の実験を、1つのZIPファイルに</h2>
    <p class="subtitle">選択した実験のRAW心拍A/B（全件）、1Hz補正後の心拍、保存済み5指標・質問別結果・VOICE特徴量・AI会話分析・NEO SCORE・品質・質問・イベントログをまとめて保存します。研究用アンケートも追加できます。</p>
    <div class="export-selection-bar"><span>選択中：<b>${total} セッション</b></span><button class="btn btn-quiet" data-action="export-select-visible">表示中をすべて選択</button><button class="btn btn-quiet" data-action="export-select-all">全セッションを選択</button><button class="btn btn-quiet" data-action="export-clear-selected">選択解除</button></div>
    <div class="export-selected-list">${state.recordsCache.filter(s=>state.exportSelected.has(s.sessionId)).map(s=>`<span>${esc(s.displayId||s.sessionId)}　${esc(s.questionCategory||'')}　${esc(s.status||'')}</span>`).join('')||'<span>「記録」画面でチェックするか、ここで全セッションを選択してください。</span>'}</div>
    <div class="export-options"><label class="export-option"><input type="checkbox" id="export-surveys"> <span>研究アンケートも含める（個別回答・任意の恋愛項目を含むことがあります）</span></label><label class="export-option"><input type="checkbox" id="export-free-text" disabled> <span>自由記述・「その他」入力・AI文字起こしも含める（個人情報が書かれていないか送信前に確認）</span></label></div>
    <div class="callout info">研究ID・計測時刻は解析に必要なため保持します。氏名／端末ID／認証情報／セッション参加コードは書き出しません。研究IDも複数記録の照合が可能なため、共有相手を確認してください。アンケートの内容は相手の参加者に見せないでください。</div>
    <div class="callout warn">取りこぼし防止：書き出し前に計測端末A・Bをオンラインに戻し、未送信データの同期を確認してください。取得に失敗した場合は不完全なZIPを作りません。</div>
    <div class="actions"><button class="btn primary" data-action="export-full-zip" ${!total||state.exportBusy?'disabled':''}>${state.exportBusy?'ZIPを準備中…':`選択した${total}件の全データを1つのZIPに保存`}</button></div>
    <p class="subtitle export-progress" id="export-progress" aria-live="polite"></p>
    <hr class="export-divider"><h3>従来の軽量エクスポート</h3><div class="actions"><button class="btn" data-action="export-session-summary">セッション一覧CSV</button><button class="btn" data-action="export-sessions-json">メタデータJSON</button></div>
    </div>`;
}
async function renderSessionDetail(el){
  const s=state.recordsCache.find(x=>x.sessionId===state.recordsSelectedSessionId)||await backend.loadSession(state.recordsSelectedSessionId);if(!s){state.recordsSelectedSessionId=null;el.innerHTML=recordsListView();return;}
  const tabs=[['overview','概要 (Overview)'],['heart','心拍数 (Heart Rate)'],['voice','音声・AI (Voice / AI)'],['metrics','指標 (Metrics)'],['questionnaire','アンケート (Questionnaire)'],['quality','品質・ログ (Quality & Logs)'],['raw','生データ (Raw Data)']];
  let content='';
  if(state.recordsTab==='heart')content=await recordsHeartTab(s);
  else if(state.recordsTab==='voice')content=await recordsVoiceTab(s);
  else if(state.recordsTab==='metrics')content=recordsMetricsTab(s);
  else if(state.recordsTab==='questionnaire')content=await recordsQuestionnaireTab(s);
  else if(state.recordsTab==='quality')content=await recordsQualityTab(s);
  else if(state.recordsTab==='raw')content=await recordsRawTab(s);
  else content=recordsOverviewTab(s);
  el.innerHTML=`<div class="records-detail-head"><button class="btn btn-quiet" data-action="records-back">← 記録一覧 (Records)</button><div><div class="section-title">測定詳細 (SESSION DETAIL)</div><h2>${esc(s.displayId)}</h2></div><div class="actions"><button class="btn" data-action="export-current-json">JSON</button><button class="btn" data-action="export-current-raw">生データCSV (RAW CSV)</button></div></div><div class="detail-tabs">${tabs.map(([id,label])=>`<button data-action="record-tab" data-tab="${id}" class="${state.recordsTab===id?'active':''}">${label}</button>`).join('')}</div><div class="panel detail-panel">${content}</div>`;
}
function recordsOverviewTab(s){return `<div class="overview-grid">${kv('測定ID (Measurement ID)',s.displayId)}${kv('内部ID (Internal UUID)',s.sessionId)}${kv('実験方式 (Protocol)',protocolLabel(s.protocolId))}${kv('状態 (Status)',statusLabel(s.status))}${kv('参加者A (Participant A)',s.participantAId)}${kv('参加者B (Participant B)',s.participantBId)}${kv('ペアID (Canonical Pair)',s.canonicalPairKey||canonicalPair(s.participantAId,s.participantBId))}${kv('関係カテゴリ (Question Category)',s.questionCategory)}${kv('質問セット順 (Set order)',s.setOrder)}${isEventProtocol(s.protocolId)?kv('こどもサポート (Child Support)',s.childSupport?'ON':'OFF'):''}${s.childSupport?kv('こどもサポート版 (Child Support Version)',s.childSupportVersion||'legacy'):''}${isEventProtocol(s.protocolId)?kv('イベント説明版 (Event Guide)',s.eventGuideVersion||'legacy'):''}${kv('質問スキップ数 (Skipped Questions)',Object.keys(s.skippedQuestions||{}).length)}${kv('操作端末 (Controller)',roleLabel(s.controllerDevice))}${kv('作成日時 (Created)',new Date(s.createdAt||0).toLocaleString('ja-JP'))}${kv('アプリ版 (APP)',s.appVersion)}${kv('質問バンク (Question Bank)',s.questionBankVersion)}${kv('前処理 (Preprocessing)',s.preprocessingVersion)}${kv('指標計算 (Metrics)',s.metricsVersion)}${kv('表示スコア方式 (Display Score)',s.displayScoreVersion)}${kv('表示尺度 (Display Scale)',s.displayScaleVersion)}</div><div class="callout" style="margin-top:18px">NEO SCOREは体験表示値です。質問をスキップした場合、その質問はセッション指標の集計から除外します。</div>`;}
const kv=(k,v)=>`<div class="kv"><span>${esc(k)}</span><b>${esc(v??'—')}</b></div>`;
async function recordsHeartTab(s){const [a,b]=await Promise.all([backend.loadHr(s.sessionId,'A'),backend.loadHr(s.sessionId,'B')]);return `<div class="section-title">実セッション経過時間 (TRUE SESSION ELAPSED TIME)</div><div class="dual-chart">${dualHrSvg(a,b)}</div><div class="legend"><span class="legend-a">参加者A (A)</span><span class="legend-b">参加者B (B)</span><span>欠測は線をつながず、空白 (gap) として表示</span></div><div class="grid3" style="margin-top:18px"><div class="kpi"><small>A 取得件数 (A samples)</small><strong>${a.length}</strong></div><div class="kpi"><small>B 取得件数 (B samples)</small><strong>${b.length}</strong></div><div class="kpi"><small>計測時間 (Duration)</small><strong>${fmt(Math.max(a.at(-1)?.sessionElapsedMs||0,b.at(-1)?.sessionElapsedMs||0))}</strong></div></div>`;}
async function recordsVoiceTab(s){
  const [voiceA,voiceB,baselineA,baselineB,aiTranscripts,aiTalk]=await Promise.all([
    backend.loadVoiceFeatures(s.sessionId,'A'),backend.loadVoiceFeatures(s.sessionId,'B'),backend.loadVoiceBaseline(s.sessionId,'A'),backend.loadVoiceBaseline(s.sessionId,'B'),backend.loadAiTranscripts(s.sessionId),backend.loadAiAnalyses(s.sessionId)
  ]);
  const vm=s.voiceMetrics||s.displayResult?.voiceMetrics||{};
  const bonus=clamp(aiTalk.reduce((sum,x)=>sum+Number(x?.bonus||x?.analysis?.bonus||0),0),0,CONFIG.experienceScore.aiTalkBonusMax);
  const byQ=(rows)=>new Map((rows||[]).map(x=>[Number(x.questionIndex),x]));
  const A=byQ(voiceA),B=byQ(voiceB),AI=byQ(aiTalk);
  const TR=new Map();for(const t of aiTranscripts||[]){const q=Number(t.questionIndex);const row=TR.get(q)||{};row[t.side]=t;TR.set(q,row);}
  const qs=[...new Set([...A.keys(),...B.keys(),...AI.keys(),...TR.keys(),...(vm.questions||[]).map(x=>Number(x.questionIndex))])].filter(Number.isFinite).sort((a,b)=>a-b);
  const f=(x,d=1)=>Number.isFinite(Number(x))?Number(x).toFixed(d):'—';
  const pct=x=>Number.isFinite(Number(x))?(Number(x)*100).toFixed(1)+'%':'—';
  const score=x=>Number.isFinite(Number(x))?Math.round(Number(x)):'—';
  const speakerLabel=x=>({A:'A',B:'B',BOTH:'BOTH',UNKNOWN:'UNKNOWN',SILENCE:'SILENCE'}[x]||'UNKNOWN');
  const speakerRows=(a,b)=>{
    if(!a?.frames?.length&&!b?.frames?.length)return '<p class="subtitle">話者タイムラインはありません。</p>';
    const timeline=classifySpeakerTimeline(a?.frames||[],b?.frames||[],{thresholdA:Number(a?.summary?.speechThreshold)||CONFIG.voice.speechRmsThreshold,thresholdB:Number(b?.summary?.speechThreshold)||CONFIG.voice.speechRmsThreshold});
    const stats=summarizeSpeakerTimeline(timeline);
    return `<div class="grid5" style="margin:12px 0"><div class="kpi"><small>A判定</small><strong>${stats.counts.A}</strong></div><div class="kpi"><small>B判定</small><strong>${stats.counts.B}</strong></div><div class="kpi"><small>BOTH</small><strong>${stats.counts.BOTH}</strong></div><div class="kpi"><small>UNKNOWN</small><strong>${stats.counts.UNKNOWN}</strong></div><div class="kpi"><small>SILENCE</small><strong>${stats.counts.SILENCE}</strong></div></div><div class="table-wrap"><table class="records-table raw-table"><thead><tr><th>質問内経過ms</th><th>話者判定</th><th>A RMS</th><th>B RMS</th><th>A Pitch</th><th>B Pitch</th><th>確信度</th></tr></thead><tbody>${timeline.map(x=>`<tr><td>${Math.round(x.tMs||0)}</td><td><b>${speakerLabel(x.speaker)}</b></td><td>${f(x.a?.rms,4)}</td><td>${f(x.b?.rms,4)}</td><td>${f(x.a?.pitch,1)}</td><td>${f(x.b?.pitch,1)}</td><td>${f(x.confidence,2)}</td></tr>`).join('')}</tbody></table></div>`;
  };
  const frameRows=(a,b)=>{
    const rows=[...(a?.frames||[]).map(x=>({...x,side:'A'})),...(b?.frames||[]).map(x=>({...x,side:'B'}))].sort((x,y)=>(x.phaseElapsedMs??x.tOffsetMs??0)-(y.phaseElapsedMs??y.tOffsetMs??0)||String(x.side).localeCompare(String(y.side)));
    if(!rows.length)return '<p class="subtitle">時系列音声特徴データはありません。</p>';
    return `<div class="table-wrap"><table class="records-table raw-table"><thead><tr><th>側</th><th>質問内経過ms</th><th>セッション経過ms</th><th>RMS</th><th>Pitch Hz</th><th>発話判定</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.side}</td><td>${Math.round(x.phaseElapsedMs??x.tOffsetMs??0)}</td><td>${Number.isFinite(Number(x.sessionElapsedMs))?Math.round(x.sessionElapsedMs):'—'}</td><td>${f(x.rms,4)}</td><td>${f(x.pitch,1)}</td><td>${x.active?'VOICE':'—'}</td></tr>`).join('')}</tbody></table></div>`;
  };
  const questionBlocks=qs.map(q=>{
    const a=A.get(q),b=B.get(q),ai=AI.get(q),tr=TR.get(q)||{},combined=(vm.questions||[]).find(x=>Number(x.questionIndex)===q)||{};
    const sa=a?.summary||{},sb=b?.summary||{},an=ai?.analysis||{};
    const qtext=a?.questionText||b?.questionText||tr.A?.questionText||tr.B?.questionText||ai?.questionText||`質問 ${q+1}`;
    return `<section style="margin-top:24px"><h3>Q${q+1}　${esc(qtext)}</h3>
      <div class="grid4" style="margin-top:12px"><div class="kpi"><small>Pitch Response</small><strong>${score(combined.pitchResponse)}</strong></div><div class="kpi"><small>Expressiveness</small><strong>${score(combined.expressiveness)}</strong></div><div class="kpi"><small>Speech Balance</small><strong>${score(combined.speechBalance)}</strong></div><div class="kpi"><small>Turn Taking</small><strong>${score(combined.turnTaking)}</strong></div></div>
      <div class="table-wrap" style="margin-top:14px"><table class="records-table"><thead><tr><th>音声特徴</th><th>参加者A</th><th>参加者B</th></tr></thead><tbody>
        <tr><td>平均声高 (Pitch mean)</td><td>${f(sa.pitchMeanHz,1)} Hz</td><td>${f(sb.pitchMeanHz,1)} Hz</td></tr>
        <tr><td>本人基準からの変化</td><td>${f(sa.pitchDeltaHz,1)} Hz / ${f(sa.pitchDeltaPct,1)}% / ${esc(sa.pitchDirection||'—')}</td><td>${f(sb.pitchDeltaHz,1)} Hz / ${f(sb.pitchDeltaPct,1)}% / ${esc(sb.pitchDirection||'—')}</td></tr>
        <tr><td>基準比（cents / z）</td><td>${f(sa.pitchDeltaCents,0)} cents / ${f(sa.pitchDeltaZ,2)}</td><td>${f(sb.pitchDeltaCents,0)} cents / ${f(sb.pitchDeltaZ,2)}</td></tr>
        <tr><td>基準からの音量差</td><td>${f(sa.rmsDeltaDb,1)} dB</td><td>${f(sb.rmsDeltaDb,1)} dB</td></tr>
        <tr><td>声高SD (Pitch SD)</td><td>${f(sa.pitchStdHz,1)} Hz</td><td>${f(sb.pitchStdHz,1)} Hz</td></tr>
        <tr><td>Pitch P10–P90</td><td>${f(sa.pitchP10Hz,1)} – ${f(sa.pitchP90Hz,1)} Hz</td><td>${f(sb.pitchP10Hz,1)} – ${f(sb.pitchP90Hz,1)} Hz</td></tr>
        <tr><td>RMS平均 / RMS CV</td><td>${f(sa.rmsMean,4)} / ${f(sa.rmsCv,3)}</td><td>${f(sb.rmsMean,4)} / ${f(sb.rmsCv,3)}</td></tr>
        <tr><td>発話率 (Speech ratio)</td><td>${pct(sa.speechRatio)}</td><td>${pct(sb.speechRatio)}</td></tr>
      </tbody></table></div>
      <div class="grid4" style="margin-top:14px"><div class="kpi"><small>会話交代回数</small><strong>${combined.turnCount??'—'}</strong></div><div class="kpi"><small>同時発話率</small><strong>${pct(combined.overlapRatio)}</strong></div><div class="kpi"><small>UNKNOWN率</small><strong>${pct(combined.unknownRatio)}</strong></div><div class="kpi"><small>AI TALK BONUS</small><strong>${Number.isFinite(Number(ai?.bonus))?'+'+Number(ai.bonus):'—'}</strong></div></div>
      <div class="dual-transcript" style="margin-top:14px"><div class="callout info"><b>A側マイク文字起こし</b><br>${esc(tr.A?.transcript||'（なし）')}</div><div class="callout info"><b>B側マイク文字起こし</b><br>${esc(tr.B?.transcript||'（なし）')}</div></div>
      ${ai?`<div class="callout" style="margin-top:10px"><b>AI会話分析：</b>${esc(an.summary||'分析結果なし')}<br><span class="mini">質問への関与 ${score(an.questionEngagement)} / 相互応答 ${score(an.mutualResponse)} / 自己開示 ${score(an.selfDisclosure)} / 感情表現 ${score(an.emotionalExpression)} / 会話の豊かさ ${score(an.conversationalRichness)}</span>${Array.isArray(an.evidence)&&an.evidence.length?`<br><span class="mini">根拠：${an.evidence.map(esc).join(' ／ ')}</span>`:''}</div>`:'<div class="callout" style="margin-top:10px">AI会話分析は未保存、またはA/B両方の文字起こしが揃っていません。</div>'}
      <details style="margin-top:14px"><summary>A / B / BOTH / UNKNOWN / SILENCE の話者判定を表示</summary>${speakerRows(a,b)}</details>
      <details style="margin-top:14px"><summary>200msごとの元音声特徴データを表示</summary>${frameRows(a,b)}</details>
    </section>`;
  }).join('');
  const baselineSummary=(row,side)=>{const b=row?.summary||{},m=row?.micMeta||s.micProfile?.[side]||{};return `<tr><td>${side}</td><td>${esc(m.connectionType||'UNKNOWN')}</td><td>${esc(m.label||'—')}</td><td>${f(b.pitchMeanHz,1)} Hz</td><td>${f(b.pitchStdHz,1)} Hz</td><td>${f(b.rmsMean,4)}</td><td>${pct(b.speechRatio)}</td><td>${Number.isFinite(Number(m.reportedInputLatencyMs))?f(m.reportedInputLatencyMs,1)+' ms':'—'}</td><td>${f(m.latencyCorrectionMs,1)} ms</td></tr>`;};
  return `<div class="section-title">VOICE / AI RECORD</div><div class="table-wrap" style="margin-bottom:18px"><table class="records-table"><thead><tr><th>側</th><th>接続方式</th><th>マイク名</th><th>基準F0</th><th>基準F0 SD</th><th>基準RMS</th><th>基準発話率</th><th>報告入力遅延</th><th>適用補正</th></tr></thead><tbody>${baselineSummary(baselineA,'A')}${baselineSummary(baselineB,'B')}</tbody></table></div>
    <div class="callout info" style="margin-bottom:18px"><b>「声が元々高い＝高反応」にはしません。</b><br>Pitch Responseは各自の10秒基準声に対するΔHz・Δ%・centsを保存し、主判定は本人内の相対変化率です。UP / DOWN / SAMEは方向として別保存し、UPだから高得点という扱いもしません。</div>
    <div class="callout info" style="margin-bottom:18px"><b>話者判定：</b>片耳マイク2本の時系列を共通時間軸で比較し、A / B / BOTH / UNKNOWN / SILENCE の5種類で保存・表示します。判別が曖昧な音はUNKNOWNのまま残します。</div>
    <div class="grid5"><div class="kpi"><small>VOICE SCORE β</small><strong>${score(vm.voiceScore)}</strong></div><div class="kpi"><small>Pitch Response</small><strong>${score(vm.pitchResponse)}</strong></div><div class="kpi"><small>Expressiveness</small><strong>${score(vm.expressiveness)}</strong></div><div class="kpi"><small>Speech Balance</small><strong>${score(vm.speechBalance)}</strong></div><div class="kpi"><small>Turn Taking</small><strong>${score(vm.turnTaking)}</strong></div></div>
    <div class="callout info" style="margin-top:18px"><b>AI TALK BONUS 合計：+${bonus} / ${CONFIG.experienceScore.aiTalkBonusMax}</b><br>A/Bそれぞれの口元マイク音声を各PC内のローカルAIで別々に文字起こしし、その2本を操作PC内のローカルAIで合わせて会話特徴だけを補助評価します。AIは親密さ・恋愛感情を直接判定しません。生音声ファイルは研究DBには保存せず、特徴量・文字起こし・AI結果を保存します。</div>${questionBlocks||'<p class="subtitle" style="margin-top:18px">このセッションには音声記録がありません。</p>'}`;
}

function splitByGap(arr,gap=CONFIG.graphGapMs){const chunks=[];let cur=[];for(const p of arr){if(cur.length&&p.sessionElapsedMs-cur.at(-1).sessionElapsedMs>gap){chunks.push(cur);cur=[];}cur.push(p);}if(cur.length)chunks.push(cur);return chunks;}
function dualHrSvg(a,b){const all=[...a,...b].filter(x=>Number.isFinite(x.bpm)&&Number.isFinite(x.sessionElapsedMs));if(!all.length)return '<div class="chart-empty">心拍データなし</div>';const w=1100,h=330,minT=0,maxT=Math.max(...all.map(x=>x.sessionElapsedMs),1),minB=Math.min(...all.map(x=>x.bpm))-4,maxB=Math.max(...all.map(x=>x.bpm))+4;const points=arr=>arr.map(p=>`${p.sessionElapsedMs/maxT*w},${h-(p.bpm-minB)/(maxB-minB||1)*h}`).join(' ');return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${splitByGap(a).map(c=>`<polyline class="lineA" points="${points(c)}"/>`).join('')}${splitByGap(b).map(c=>`<polyline class="lineB" points="${points(c)}"/>`).join('')}</svg>`;}
const metricCell=(value,reason=null,digits=1)=>Number.isFinite(value)?num(value,digits):`<span class="na-value" title="${esc(reasonLabel(reason)||'算出条件を満たしませんでした')}">算出不可 (NA)</span>`;
function recordsMetricsTab(s){const m=s.metrics||{},qs=s.questionMetrics||[],bd=m.displayBreakdown||s.displayResult?.scoreBreakdown||{};return `<div class="metric-guide"><div><b>方向一致 (Direction)</b><span>二人の心拍が同じ方向へ変化した割合</span></div><div><b>反応の大きさ (Magnitude)</b><span>基準時と比べた心拍変化の大きさ</span></div><div><b>時間同期 (Temporal r)</b><span>少しの時間差を含めた反応タイミングの似かた</span></div><div><b>反応バランス (Balance)</b><span>二人の反応量がどの程度近いか</span></div><div><b>質問反応量 (Q Response)</b><span>質問によって心拍がどれだけ動いたか</span></div></div><div class="grid5"><div class="kpi"><small>方向一致 (Direction)</small><strong>${num(m.direction,1)}</strong></div><div class="kpi"><small>反応の大きさ (Magnitude)</small><strong>${num(m.magnitude,2)}</strong></div><div class="kpi"><small>時間同期 (Temporal r)</small><strong>${num(m.temporal,2)}</strong></div><div class="kpi"><small>反応バランス (Balance)</small><strong>${num(m.balance,1)}</strong></div><div class="kpi"><small>質問反応量 (Q Response)</small><strong>${num(m.questionResponse,2)}</strong></div></div>${Number.isFinite(bd.syncScore)?`<div class="grid2 score-breakdown-record"><div class="kpi"><small>心拍シンクロ表示値 (SYNC)</small><strong>${Math.round(bd.syncScore)}</strong></div><div class="kpi"><small>心拍リアクション表示値 (REACTION)</small><strong>${Math.round(bd.reactionScore)}</strong></div></div>`:''}<h3 style="margin-top:24px">質問別 (Question level)</h3>${qs.length?`<div class="table-wrap"><table class="records-table"><thead><tr><th>番号 (Q)</th><th>質問 (Question)</th><th>方向一致 (Direction)</th><th>反応量 (Magnitude)</th><th>時間同期 (Temporal)</th><th>時間差 (Lag)</th><th>バランス (Balance)</th><th>質問反応 (Q Response)</th></tr></thead><tbody>${qs.map((x,i)=>x.skipped?`<tr class="skipped-row"><td>${i+1}</td><td>${esc(x.question?.questionText||'')}</td><td colspan="6"><span class="na-value">質問スキップ (QUESTION_SKIPPED) · 集計対象外</span></td></tr>`:`<tr><td>${i+1}</td><td>${esc(x.question?.questionText||'')}</td><td>${metricCell(x.direction?.directionSync,x.direction?.reason,1)}</td><td>${metricCell(x.pairMagnitude,null,2)}</td><td>${metricCell(x.temporal?.rMax,x.temporal?.reason,2)}</td><td>${Number.isFinite(x.temporal?.bestLag)?`${x.temporal.bestLag} 秒`:'算出不可 (NA)'}</td><td>${metricCell(x.balance?.balance,x.balance?.reason,1)}</td><td>${metricCell(x.pairQResponse,null,2)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="subtitle">このセッションには質問別指標がまだ保存されていません。</p>'}`;}
async function recordsQuestionnaireTab(s){
  if(s.protocolId!=='RESEARCH_V1')return '<div class="callout info"><b>イベントモードではアンケートを実施しません。</b><br>このタブにイベント用アンケートデータは保存されません。</div>';
  const stages=['pre','post'];
  const vals=await Promise.all(['A','B'].flatMap(side=>stages.map(stage=>backend.loadSurvey(s.sessionId,side,stage))));let idx=0;
  return `<div class="grid2">${['A','B'].map(side=>`<section><h3>参加者${side} (Participant ${side})</h3>${stages.map(stage=>surveyRecordBlock(stage,vals[idx++])).join('')}</section>`).join('')}</div>`;
}
function surveyRecordBlock(stage,row){const title=stage==='pre'?'測定前 (PRE)':'測定後 (POST)';if(!row)return `<div class="record-survey"><b>${title}</b><p class="mini">未回答</p></div>`;const d=row.data||row;const formatSurveyValue=(k,v)=>{if(k==='condition'&&Array.isArray(v))return v.map(x=>CONDITION_LABELS[x]||x).join(' / ');if(v===null)return '回答なし (NA)';if(typeof v==='boolean')return v?'はい (true)':'いいえ (false)';return Array.isArray(v)?v.join(', '):String(v);};return `<div class="record-survey"><b>${title}</b>${Object.entries(d).filter(([k])=>!['submittedFromRole','consentVersion'].includes(k)).map(([k,v])=>`<div class="metric-row"><span>${esc(SURVEY_ITEM_LABELS[k]||k)}</span><b>${esc(formatSurveyValue(k,v))}</b></div>`).join('')}</div>`;}
function logDetailsHtml(details={}){const labels={category:'関係カテゴリ',displayId:'測定ID',protocolId:'実験方式',setOrder:'セット順',role:'端末役割',side:'側',stage:'段階',deviceId:'機器ID',readyAtMs:'準備完了時刻ms',t0:'開始時刻ms',phase:'フェーズ',pauseDurationMs:'停止時間ms',quality:'品質',score:'スコア',reason:'理由',from:'変更前',to:'変更後'};const entries=Object.entries(details||{});if(!entries.length)return '—';return `<div class="log-details">${entries.map(([k,v])=>`<span><b>${esc(labels[k]||k)} (${esc(k)})</b>: ${esc(k==='protocolId'?protocolLabel(v):k==='role'||k==='from'||k==='to'?roleLabel(v):k==='phase'?phaseLabel(v):k==='quality'?qualityLabel(v):k==='reason'?(v==='SENSOR_LOSS'?'心拍センサー切断 (SENSOR_LOSS)':v==='MANUAL'?'手動 (MANUAL)':String(v)):String(v))}</span>`).join('')}</div>`;}
async function recordsQualityTab(s){const logs=await backend.listAuditLogs(s.sessionId);const q=s.quality||s.metrics?.quality||{};return `<div class="grid4"><div class="kpi"><small>データ品質 (Quality)</small><strong>${esc(qualityLabel(q.label))}</strong></div><div class="kpi"><small>A 取得率 (Coverage A)</small><strong>${Number.isFinite(q.coverageA)?(q.coverageA*100).toFixed(1)+'%':'—'}</strong></div><div class="kpi"><small>B 取得率 (Coverage B)</small><strong>${Number.isFinite(q.coverageB)?(q.coverageB*100).toFixed(1)+'%':'—'}</strong></div><div class="kpi"><small>最大連続欠測 (Max continuous gap)</small><strong>${Number.isFinite(q.maxContinuousGapSec)?q.maxContinuousGapSec+' 秒':'—'}</strong></div></div><h3 style="margin-top:24px">操作・イベントログ (Operation / event log)</h3>${logs.length?`<table class="records-table"><thead><tr><th>時刻 (Time)</th><th>イベント (Event)</th><th>端末役割 (Role)</th><th>詳細 (Details)</th></tr></thead><tbody>${logs.map(x=>`<tr><td>${new Date(x.timestamp||0).toLocaleString('ja-JP')}</td><td>${esc(EVENT_LABELS[x.eventType]||x.eventType||'')}</td><td>${esc(roleLabel(x.actorRole))}</td><td>${logDetailsHtml(x.details||{})}</td></tr>`).join('')}</tbody></table>`:'<p class="subtitle">ログはありません。</p>'}`;}
async function recordsRawTab(s){const [a,b]=await Promise.all([backend.loadHr(s.sessionId,'A'),backend.loadHr(s.sessionId,'B')]);const rows=[...a.map(x=>({...x,side:'A'})),...b.map(x=>({...x,side:'B'}))].sort((x,y)=>x.sessionElapsedMs-y.sessionElapsedMs).slice(0,200);return `<div class="callout info">生データ (RAW) は読み取り専用です。先頭200行を表示しています。解析では受信時刻から1秒系列を作り、sequence値そのものは欠測判定に使いません。</div><div class="table-wrap"><table class="records-table raw-table"><thead><tr><th>側 (Side)</th><th>経過ms (Elapsed ms)</th><th>心拍数 (BPM)</th><th>フェーズ (Phase)</th><th>セット (Set)</th><th>質問 (Q)</th><th>時刻ms (Timestamp)</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.side}</td><td>${Math.round(x.sessionElapsedMs||0)}</td><td>${x.bpm}</td><td>${esc(phaseLabel(x.phase))}</td><td>${x.setIndex??''}</td><td>${x.questionIndex??''}</td><td>${Math.round(x.timestampMs||0)}</td></tr>`).join('')}</tbody></table></div>`;}

function csvEscape(v){const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
function downloadText(name,text,type='text/plain;charset=utf-8'){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportSessionSummary(){const rows=[['display_id','session_uuid','created_at','protocol','participant_a','participant_b','question_category','set_order','status','quality','neo_score','app_version'],...state.recordsCache.map(s=>[s.displayId,s.sessionId,new Date(s.createdAt||0).toISOString(),s.protocolId,s.participantAId,s.participantBId,s.questionCategory,s.setOrder,s.status,s.quality?.label||s.metrics?.quality?.label||'',s.displayResult?.neoScore??'',s.appVersion])];downloadText('session_summary.csv','\ufeff'+rows.map(r=>r.map(csvEscape).join(',')).join('\r\n'),'text/csv;charset=utf-8');}
async function exportCurrentRaw(){const s=state.recordsCache.find(x=>x.sessionId===state.recordsSelectedSessionId);if(!s)return;const [a,b]=await Promise.all([backend.loadHr(s.sessionId,'A'),backend.loadHr(s.sessionId,'B')]);const rows=[['session_id','participant_id','side','sample_id','sequence','bpm','timestamp_ms','session_elapsed_ms','phase','phase_elapsed_ms','set_index','question_index','sync_offset_ms'],...a.map(x=>[s.displayId,s.participantAId,'A',x.sampleId,x.sequence,x.bpm,x.timestampMs,x.sessionElapsedMs,x.phase,x.phaseElapsedMs,x.setIndex,x.questionIndex,x.syncOffsetMs]),...b.map(x=>[s.displayId,s.participantBId,'B',x.sampleId,x.sequence,x.bpm,x.timestampMs,x.sessionElapsedMs,x.phase,x.phaseElapsedMs,x.setIndex,x.questionIndex,x.syncOffsetMs])];downloadText(`${s.displayId}_heart_rate_raw.csv`,'\ufeff'+rows.map(r=>r.map(csvEscape).join(',')).join('\r\n'),'text/csv;charset=utf-8');}

async function exportFullZip(){
  if(state.exportBusy||!isRecordsUnlocked())return;
  const ids=[...state.exportSelected].filter(id=>state.recordsCache.some(s=>s.sessionId===id));
  if(!ids.length){alert('書き出したいセッションを選択してください。');return;}
  const includeSurveys=!!document.querySelector('#export-surveys')?.checked;
  const includeFreeText=includeSurveys&&!!document.querySelector('#export-free-text')?.checked;
  const warning=includeSurveys?'\n\n※個別のアンケート回答も含みます。相手の参加者には公開しないでください。':'';
  if(!confirm(`${ids.length}件の実験データを、RAW心拍を含む1つのZIPに保存します。${warning}\n\n続けますか？`))return;
  state.exportBusy=true;
  const button=document.querySelector('[data-action="export-full-zip"]'),progress=document.querySelector('#export-progress');
  if(button){button.disabled=true;button.textContent='収集中…';}
  const report=s=>{if(progress)progress.textContent=s;};
  try{
    if(CONFIG.backendMode==='firebase'&&!backend.getBackendStatus()?.connected)throw new Error('Firebaseがオフラインです。計測PCを同期してから再度お試しください。');
    const bundles=[];
    for(let i=0;i<ids.length;i++){
      if(!isRecordsUnlocked())throw new Error('記録画面がロックされました。PINを入力し直してから書き出してください。');
      const id=ids[i];report(`取得中 ${i+1}/${ids.length}：${state.recordsCache.find(s=>s.sessionId===id)?.displayId||id}`);
      const bundle=await backend.loadExportBundle(id,{includeSurveys});
      if(!bundle?.session)throw new Error(`${id} のセッション情報が取得できませんでした。`);
      if(bundle.session.status==='COMPLETE'&&(!bundle.rawA?.length||!bundle.rawB?.length))throw new Error(`${bundle.session.displayId||id} のRAW心拍A/Bが揃っていません。アップロード状況を確認してください。`);
      bundles.push(bundle);
    }
    if(!isRecordsUnlocked())throw new Error('記録画面がロックされました。ZIPは作成されませんでした。');
    report(`取得完了 ${ids.length}/${ids.length}。ZIPを作成しています…`);
    const result=buildExportFiles(bundles,{includeSurveys,includeFreeText});
    const archive=zipFile(result.files);
    if(archive.size>150*1024*1024&&!confirm(`ZIPが約${(archive.size/1024/1024).toFixed(1)}MBあります。保存を続けますか？`)){report('大容量のため保存を中止しました。');return;}
    if(!isRecordsUnlocked())throw new Error('記録画面がロックされました。ZIPは保存されませんでした。');
    const url=URL.createObjectURL(archive),link=document.createElement('a');link.href=url;link.download=result.filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    const warnings=result.manifest.manifest.flatMap(x=>x.warnings.map(w=>x.displayId+'：'+w));
    report(`${ids.length}件のZIP保存を開始しました。RAW A/B・指標・質問・ログを収録。${warnings.length?` 要確認 ${warnings.length}件（ZIP内READMEを確認）`:''}`);
  }catch(e){console.error('research export failed',e);report('書き出し失敗：'+String(e?.message||e));alert('ZIPを作成できませんでした。\n不完全なファイルは保存していません。\n'+String(e?.message||e));}
  finally{state.exportBusy=false;if(button){button.disabled=false;button.textContent=`選択した${state.exportSelected.size}件の全データを1つのZIPに保存`;}}
}

function bind(){
  document.querySelectorAll('[data-role]').forEach(el=>el.addEventListener('click',()=>chooseRole(el.dataset.role)));
  document.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',()=>handleAction(el.dataset.action,el)));
  document.querySelectorAll('[data-range]').forEach(el=>el.addEventListener('input',()=>{const o=document.querySelector(`#out-${CSS.escape(el.dataset.range)}`);if(o)o.textContent=el.value;}));
  const form=document.querySelector('#survey-form');if(form){
    form.addEventListener('submit',e=>{e.preventDefault();if(confirm('この内容で回答を確定しますか？\n確定後、この端末から回答内容は再表示しません。'))submitSurvey(form);});
    const skip=form.querySelector('input[name="O1_skip"]');const o1=form.querySelector('input[name="O1"]');if(skip&&o1)skip.addEventListener('change',()=>{o1.disabled=skip.checked;const out=document.querySelector('#out-O1');if(out)out.textContent=skip.checked?'—':o1.value;});
    const conditions=[...form.querySelectorAll('input[name="condition"]')];for(const c of conditions)c.addEventListener('change',()=>{if(c.value==='none'&&c.checked)conditions.filter(x=>x!==c).forEach(x=>x.checked=false);else if(c.checked){const none=conditions.find(x=>x.value==='none');if(none)none.checked=false;}});
    const rels=[...form.querySelectorAll('input[name="relationship"]')],otherWrap=form.querySelector('#relationship-other-wrap'),otherInput=form.querySelector('#relationship-other');
    const syncRelationshipOther=()=>{const isOther=rels.some(x=>x.checked&&x.value==='その他');if(otherWrap)otherWrap.hidden=!isOther;if(otherInput){otherInput.disabled=!isOther;otherInput.required=isOther;if(!isOther)otherInput.value='';}};
    rels.forEach(x=>x.addEventListener('change',syncRelationshipOther));syncRelationshipOther();
  }
  const micType=document.querySelector('#mic-connection-type');if(micType)micType.addEventListener('change',()=>{state.micConnectionType=micType.value||'UNKNOWN';});
  const micDevice=document.querySelector('#mic-device-select');if(micDevice)micDevice.addEventListener('change',()=>{state.micDeviceId=micDevice.value||'';});
  const pin=document.querySelector('#records-pin');if(pin)pin.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();handleAction('unlock-records',document.querySelector('[data-action="unlock-records"]'));}});
  syncSessionCreationForm();
}
function bindDynamic(){
  document.querySelectorAll('[data-session-open]').forEach(el=>el.addEventListener('click',e=>{if(e.target.closest('input,button,label,a'))return;state.recordsSelectedSessionId=el.dataset.sessionOpen;state.recordsTab='overview';renderRecordsBody();}));
  document.querySelectorAll('[data-export-session]').forEach(el=>el.addEventListener('change',()=>{if(el.checked)state.exportSelected.add(el.dataset.exportSession);else state.exportSelected.delete(el.dataset.exportSession);renderRecordsBody();}));
  const surveys=document.querySelector('#export-surveys'),free=document.querySelector('#export-free-text');if(surveys&&free)surveys.addEventListener('change',()=>{free.disabled=!surveys.checked;if(!surveys.checked)free.checked=false;});
  document.querySelectorAll('[data-action]').forEach(el=>{if(!el.dataset.bound){el.dataset.bound='1';el.addEventListener('click',()=>handleAction(el.dataset.action,el));}});
  const q=document.querySelector('#records-search');if(q)q.addEventListener('input',()=>{state.recordsSearch=q.value;renderRecordsBody();});
  const p=document.querySelector('#records-protocol');if(p)p.addEventListener('change',()=>{state.recordsProtocol=p.value;renderRecordsBody();});
  const st=document.querySelector('#records-status');if(st)st.addEventListener('change',()=>{state.recordsStatus=st.value;renderRecordsBody();});
}

async function handleAction(a,el){
  if(a==='display-home')return clearRole();if(a==='home')return clearRole();if(a==='create-session')return createSession();if(a==='join-session')return joinSession();
  if(a==='connect-hw9')return connectSensor(false);if(a==='connect-demo')return connectSensor(true);if(a==='refresh-mics')return refreshMicrophoneList();if(a==='connect-mic')return connectMicrophone();if(a==='measure-voice-baseline')return measureVoiceBaseline();if(a==='prepare-local-ai')return prepareLocalAiForThisPc();
  if(a==='open-pre-survey'){state.surveyStage='pre';state.surveySide=roleSide();return render();}if(a==='open-post-survey'){state.surveyStage='post';state.surveySide=roleSide();return render();}
  if(a==='cancel-survey'){if(confirm('アンケートを閉じて運用画面へ戻りますか？入力中の内容は保存されません。')){state.surveyStage=null;state.surveySide=null;render();}return;}
  if(a==='staff-return'){if(confirm('実験担当者の操作画面へ戻りますか？')){state.surveyLocked=null;await refreshSession();render();}return;}
  if(a==='skip-question')return skipCurrentQuestion();if(a==='start-acclim')return startAcclim();if(a==='start-measure')return startMeasure();if(a==='pause')return pauseMeasure();if(a==='resume')return resumeMeasure();if(a==='abort')return abortMeasure();if(a==='calculate')return calculateResults();
  if(a==='transfer-controller')return transferController();if(a==='intro-prev')return setIntroPage(-1);if(a==='intro-next')return setIntroPage(1);
  if(a==='unlock-records'){const pin=document.querySelector('#records-pin')?.value||'';try{await verifyRecordsPin(pin);render();}catch(e){alert(e?.message||'PINを確認できませんでした。');}return;}
  if(a==='lock-records'){lockRecords();state.recordsSelectedSessionId=null;return render();}
  if(a==='reload-records')return hydrateRecords();
  if(a==='records-view'){state.recordsView=el.dataset.view||'records';state.recordsSelectedSessionId=null;state.recordsTab='overview';render();return;}
  if(a==='records-back'){state.recordsSelectedSessionId=null;return renderRecordsBody();}
  if(a==='record-tab'){state.recordsTab=el.dataset.tab||'overview';return renderRecordsBody();}
  if(a==='export-select-visible'){filteredSessions().forEach(s=>state.exportSelected.add(s.sessionId));return renderRecordsBody();}
  if(a==='export-select-all'){state.recordsCache.forEach(s=>state.exportSelected.add(s.sessionId));return renderRecordsBody();}
  if(a==='export-clear-selected'){state.exportSelected.clear();return renderRecordsBody();}
  if(a==='export-open'){state.recordsView='export';state.recordsSelectedSessionId=null;return renderRecordsBody();}
  if(a==='export-full-zip')return exportFullZip();
  if(a==='export-session-summary')return exportSessionSummary();
  if(a==='export-sessions-json')return downloadText('sessions_metadata.json',JSON.stringify(redact(state.recordsCache),null,2),'application/json');
  if(a==='export-current-json'){const s=state.recordsCache.find(x=>x.sessionId===state.recordsSelectedSessionId);if(s)downloadText(`${s.displayId}.json`,JSON.stringify(redact(s),null,2),'application/json');return;}
  if(a==='export-current-raw')return exportCurrentRaw();
}

function render(){
  if(!state.role){stopTick();app.innerHTML=roleSelection();bind();return;}
  if(state.role===ROLE.RECORDS){stopTick();if(!isRecordsUnlocked()){app.innerHTML=recordsPinScreen();bind();return;}app.innerHTML=recordsScreen();bind();hydrateRecords();return;}
  if(!state.session){stopTick();app.innerHTML=sessionLobby();bind();return;}
  if(state.role===ROLE.DISPLAY){app.innerHTML=displayScreen();bind();startTick();state.lastPhaseKey=phaseKey(state.session);return;}
  app.innerHTML=operatorScreen();bind();startTick();state.lastPhaseKey=phaseKey(state.session);
}

window.addEventListener('beforeunload',()=>{try{if(state.sessionId&&roleSide()){backend.setSensorReady(state.sessionId,roleSide(),false);backend.setLocalAiReady(state.sessionId,roleSide(),null);}}catch{}});
(async()=>{if(state.sessionId)await refreshSession();render();})();
