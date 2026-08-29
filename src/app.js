import {
  APP_VERSION, CONFIG, ROLE, SESSION_STATUS, QUESTION_BANK_VERSION, EVENT_QUESTION_BANK_VERSION,
  EVENT_GUIDE_VERSION, CONSENT_VERSION,
  PREPROCESSING_VERSION, METRICS_VERSION, DISPLAY_SCORE_VERSION, DISPLAY_SCALE_VERSION
} from './config.js';
import { getQuestionBankForProtocol, getQuestionCategoriesForProtocol } from './question-bank.js';
import { PROTOCOLS, SET_ORDERS, buildTimeline, getPhaseAtElapsed, isEventProtocol } from './protocols.js';
import {
  RELATIONSHIP_OPTIONS, PRE_RELATIONSHIP_ITEMS, PRE_STATE_ITEMS, OPTIONAL_ITEM,
  CONDITION_OPTIONS, POST_ITEMS, CONSENT_TEXT
} from './survey-schema.js';
import * as backend from './backend.js';
import { HeartRateSensor, DemoHeartRateSensor } from './bluetooth-hw9.js';
import { computeSessionMetrics } from './metrics.js';
import { radarSvg } from './radar.js';
import { isRecordsUnlocked, verifyRecordsPin, lockRecords, touchRecordsActivity } from './admin-gate.js';

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
};

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
  SESSION_CREATED:'セッション作成 (SESSION_CREATED)',DEVICE_JOINED:'端末参加 (DEVICE_JOINED)',HW9_CONNECTED:'心拍計接続 (HW9_CONNECTED)',DEMO_SENSOR_CONNECTED:'デモ心拍計接続 (DEMO_SENSOR_CONNECTED)',HEART_RATE_STREAM_READY:'心拍受信準備完了 (HEART_RATE_STREAM_READY)',SURVEY_SUBMITTED:'アンケート送信 (SURVEY_SUBMITTED)',ACCLIMATION_STARTED:'順応開始 (ACCLIMATION_STARTED)',MEASUREMENT_SCHEDULED:'測定開始予約 (MEASUREMENT_SCHEDULED)',PAUSED:'一時停止 (PAUSED)',RESUMED:'再開 (RESUMED)',MEASUREMENT_ENDED:'測定終了 (MEASUREMENT_ENDED)',RESULT_CALCULATED:'結果計算 (RESULT_CALCULATED)',CONTROLLER_TRANSFER:'操作端末変更 (CONTROLLER_TRANSFER)'
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
  if(state.sessionId&&roleSide())try{await backend.setSensorReady(state.sessionId,roleSide(),false);}catch{}
  stopTick();sessionStorage.removeItem('lmneo-role');sessionStorage.removeItem('lmneo-session');
  state.role=null;state.sessionId=null;state.session=null;state.sensor=null;state.sensorStatus='DISCONNECTED';state.sensorValidated=false;state.surveyStage=null;state.surveyLocked=null;render();
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
        <div class="event-options-head"><div><b>イベントモード</b><small>イベント用の6カテゴリから質問を選びます。アンケートは実施せず、測定中の質問は操作端末からスキップできます。</small></div><span class="event-chip">EVENT V2</span></div>
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
      metricsVersion:METRICS_VERSION,displayScoreVersion:DISPLAY_SCORE_VERSION,displayScaleVersion:DISPLAY_SCALE_VERSION,introPage:0,
      eventGuideVersion:protocolId==='EVENT_V2'?EVENT_GUIDE_VERSION:null,
      skippedQuestions:{},
      sensorReady:{A:false,B:false},surveyStatus,devicePresence:{[state.role]:now()},guardianOrSchoolConsent:'externally_managed'
    };
    await backend.createSession(s);state.session=await backend.loadSession(s.sessionId);state.sessionId=s.sessionId;sessionStorage.setItem('lmneo-session',s.sessionId);
    await backend.appendAuditLog(s.sessionId,{eventType:'SESSION_CREATED',details:{displayId,protocolId,category,setOrder}});render();
  }catch(e){alert(e?.message||'セッションを作成できませんでした。');console.error(e);}finally{state.busy=false;}
}
async function joinSession(){
  const code=document.querySelector('#join')?.value.trim()||'';
  try{
    const s=await backend.joinByCode(code);if(!s){alert('セッションが見つかりません。6桁コードを確認してください。');return;}
    state.session=s;state.sessionId=s.sessionId;sessionStorage.setItem('lmneo-session',s.sessionId);
    if(roleSide())await backend.setSensorReady(s.sessionId,roleSide(),false);
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
  const skipped=isQuestionSkipped(s,phase);
  return `<div class="callout event-question-assist ${skipped?'warn':''}"><b>${skipped?'この質問はスキップ済み':'イベント質問操作'}</b>${skipped?'<br>次の質問までそのままお待ちください。':''}${!skipped&&isController()?`<div class="actions event-question-actions"><button class="btn btn-quiet" data-action="skip-question">この質問をスキップ</button></div>`:''}</div>`;
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
    <div class="actions">${statusPill(connected?`${state.sensorName||'SENSOR'} CONNECTED`:state.sensorStatus,connected?'good':'bad')}${statusPill(s.stage,s.stage==='ABORTED'?'bad':s.stage==='RUNNING'?'good':'neutral')}</div>
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
      <div class="control-group"><div class="section-title">SENSOR ${side}</div><div class="grid2"><button class="btn" data-action="connect-hw9">HW9接続</button><button class="btn btn-quiet" data-action="connect-demo">DEMO HR</button></div>${preButton}</div>
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
function operatorResultSummary(s){const m=s.metrics||{};return `<section class="panel research-summary"><div class="section-title">研究用の生指標 (RESEARCH VALUES) · 実験者のみ</div><div class="grid5"><div class="kpi"><small>方向一致 (Direction)</small><strong>${num(m.direction,1)}</strong></div><div class="kpi"><small>反応の大きさ (Magnitude)</small><strong>${num(m.magnitude,2)}</strong></div><div class="kpi"><small>時間同期 (Temporal r)</small><strong>${num(m.temporal,2)}</strong></div><div class="kpi"><small>反応バランス (Balance)</small><strong>${num(m.balance,1)}</strong></div><div class="kpi"><small>質問反応量 (Q Response)</small><strong>${num(m.questionResponse,2)}</strong></div></div><p class="mini">NEO SCOREとは分離して保存します。科学的な総合関係値としては扱いません。</p></section>`;}
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
      if(rt.elapsed>=total){await finishMeasurement();return;}
      const key=phaseKey(state.session);if(key!==state.lastPhaseKey){state.lastPhaseKey=key;render();return;}
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
  const s=state.session;
  if(s.stage==='RESULT')return resultDisplay(s);if(s.stage==='ABORTED')return phaseDisplay('MEASUREMENT ENDED','計測を終了しました。スタッフの案内をお待ちください。');
  if(s.stage==='SETUP')return explainDisplay(s);
  if(s.stage==='ACCLIMATION')return phaseDisplay('CALIBRATING','心拍センサーをつけたまま、楽な姿勢でお待ちください。',(s.readyAtMs||now())-now());
  if(s.stage==='READY')return phaseDisplay('SYSTEM READY','準備ができました。スタッフの案内をお待ちください。');
  if(s.stage==='POST_SURVEY')return phaseDisplay('MEASUREMENT COMPLETE','最後のアンケートに回答してください。');
  if(s.stage==='CALCULATING')return phaseDisplay('ANALYZING HEART REACTIONS','二人の心拍リアクションを解析しています。');
  if(s.stage==='PAUSED')return phaseDisplay('MEASUREMENT PAUSED','しばらくお待ちください。');
  if(s.stage==='RUNNING'){
    const rt=runtimeInfo(s);if(!rt.phase)return phaseDisplay('PREPARING','まもなく始まります。',Math.max(0,(s.t0||now())-now()));
    if(rt.phase.phase==='QUESTION'){
      const skipped=isQuestionSkipped(s,rt.phase);
      if(skipped)return shell(`<div class="display-center question-display skipped-display"><div class="eyebrow">QUESTION ${String((rt.phase.globalQuestionIndex??0)+1).padStart(2,'0')}</div><div class="question-large">この質問はスキップしました</div><p class="display-hint">次の質問までお待ちください。</p><div id="live-countdown" class="countdown display-countdown">${fmt(rt.remaining)}</div><div class="progress"><span id="live-progress" style="width:${100*(1-rt.remaining/(rt.phase.durationSec*1000))}%"></span></div></div>`,{display:true});
      return shell(`<div class="display-center question-display"><div class="eyebrow">QUESTION ${String((rt.phase.globalQuestionIndex??0)+1).padStart(2,'0')}</div><div class="question-large">${esc(rt.phase.questionText)}</div><p class="display-hint">二人で自由に話してください。正解・不正解はありません。</p><div id="live-countdown" class="countdown display-countdown">${fmt(rt.remaining)}</div><div class="progress"><span id="live-progress" style="width:${100*(1-rt.remaining/(rt.phase.durationSec*1000))}%"></span></div><div class="twin-wave" aria-hidden="true"><i></i><i></i></div></div>`,{display:true});
    }
    if(rt.phase.phase==='BASELINE')return phaseDisplay('CALIBRATING','そのままお待ちください。',rt.remaining);
    if(rt.phase.phase==='RESET')return phaseDisplay('NEXT QUESTION','次の質問まで少しお待ちください。',rt.remaining);
    if(rt.phase.phase==='RECOVERY')return phaseDisplay('RECOVERY','そのままお待ちください。',rt.remaining);
  }
  return explainDisplay(s);
}
function explainDisplay(s){
  const event=s.protocolId==='EVENT_V2';
  const pages=event?[
    {n:'01',title:'LOVE METER NEOとは？',body:'二人で同じ質問に答えながら心拍を測り、二人の「心拍リアクション」を見える化する体験です。',sub:'心拍が同じ方向に動いたか、近いタイミングで反応したかなどを分析し、心拍反応と二人の関係とのつながりを調べています。'},
    {n:'02',title:'おねがい',body:'質問が表示されたら、二人とも自由に答えてください。',sub:'正解や不正解はありません。答えにくい質問は、スタッフに伝えればスキップできます。'},
    {n:'03',title:'結果について',body:'NEO SCOREは、今回の心拍リアクションを分かりやすく表示する体験用スコアです。',sub:'「なかよし度」や「相性」を断定する点数ではありません。途中でやめたい場合は、いつでもスタッフに伝えてください。'}
  ]:[
    {n:'01',title:'LOVE METER NEO について',body:'二人が同じ質問に答えている間の心拍を同時に記録し、心拍反応の方向・大きさ・タイミングなどを分析する研究システムです。',sub:'二人の心拍リアクションと、親しさ・安心感・信頼などの自己申告との関係を調べます。'},
    {n:'02',title:'この研究の目的',body:'実験データを積み重ね、二人の関係性にみられる特徴を0〜100の数値で表現できる指標をつくることを目指しています。',sub:'質問が表示されたら二人で自由に話してください。正解・不正解はありません。'},
    {n:'03',title:'大切なこと',body:'心拍は緊張・運動・暑さ・体調などでも変化します。',sub:'LOVE METER NEOは心拍だけで「好き」「相性が良い」などを断定するものではありません。アンケートの回答は相手には表示されません。'}
  ];
  const idx=clamp(Number(s.introPage||0),0,2),p=pages[idx];
  return shell(`<div class="display-center intro-display"><div class="intro-index">${p.n}</div><div class="eyebrow">PARTICIPANT GUIDE</div><h1>${esc(p.title)}</h1><p class="intro-main">${esc(p.body)}</p><p class="intro-sub">${esc(p.sub)}</p><div class="intro-dots">${pages.map((_,i)=>`<span class="${i===idx?'active':''}"></span>`).join('')}</div>${idx===2?`<p class="standby">準備ができたら、スタッフの案内をお待ちください。</p>`:''}</div>`,{display:true});
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
function resultDisplay(s){
  const d=s.displayResult||{},score=Number.isFinite(d.neoScore)?Math.round(d.neoScore):null,b=d.scoreBreakdown||s.metrics?.displayBreakdown||{};
  if(score==null)return shell(`<div class="display-center"><div class="eyebrow">測定不成立 (MEASUREMENT INCOMPLETE)</div><h1>十分なデータを取得できませんでした</h1><p class="subtitle">スタッフの案内に従って、必要に応じて再計測してください。</p><button class="btn btn-quiet" data-action="display-home">ホームへ戻る</button></div>`,{display:true});
  const caption='二人の「反応の似かた」と「心拍に現れた反応の強さ」を合わせた体験用スコアです。<br>感情そのものや相性を断定する値ではありません。';
  return shell(`<div class="result-page"><div class="result-grid"><section class="score-block"><div class="eyebrow">NEO SCORE</div><div class="big-number">${score}</div><div class="score-components"><div><small>心拍シンクロ (SYNC)</small><strong>${Number.isFinite(b.syncScore)?Math.round(b.syncScore):'—'}</strong></div><div><small>心拍リアクション (REACTION)</small><strong>${Number.isFinite(b.reactionScore)?Math.round(b.reactionScore):'—'}</strong></div></div><div class="score-caption">${caption}</div></section><section class="radar-block">${radarSvg(d.radar||{},500)}</section><section class="reaction-block"><div class="section-title">今回の反応パターン (REACTION STYLE)</div><h2>${esc(d.comment||'')}</h2><div class="section-title spaced">最も反応が大きかった質問 (MOST REACTIVE QUESTION)</div><div class="callout result-question">${esc(d.mostReactiveQuestion||'—')}</div><button class="btn btn-quiet result-home" data-action="display-home">ホームへ戻る</button></section></div><section class="timeline-block"><div class="timeline-head"><span>A 心拍リアクション (A HEART REACTION)</span><span>B 心拍リアクション (B HEART REACTION)</span></div>${miniTimelineSvg(d.miniTimeline)}</section></div>`,{display:true});
}
async function calculateResults(){
  const s=await backend.loadSession(state.sessionId);await backend.flushOutbox();const a=await backend.loadHr(s.sessionId,'A'),b=await backend.loadHr(s.sessionId,'B');
  const skippedQuestionIndexes=Object.keys(s.skippedQuestions||{}).map(Number).filter(Number.isFinite);
  const result=computeSessionMetrics({aSamples:a,bSamples:b,timeline:s.timeline,protocolId:s.protocolId,skippedQuestionIndexes});const most=result.perQuestion.filter(x=>!x.skipped&&Number.isFinite(x.pairQResponse)).sort((x,y)=>y.pairQResponse-x.pairQResponse)[0];
  const display={neoScore:result.session.neoScore,radar:result.session.radar,scoreBreakdown:result.session.displayBreakdown,mostReactiveQuestion:most?.question?.questionText||null,comment:reactionComment(result.session),miniTimeline:buildMiniTimeline(result.cleanA,result.cleanB)};
  await backend.updateSession(s.sessionId,{stage:'RESULT',status:SESSION_STATUS.COMPLETE,metrics:result.session,questionMetrics:result.perQuestion,quality:result.quality,displayResult:display,completedAt:now()});await backend.appendAuditLog(s.sessionId,{eventType:'RESULT_CALCULATED',details:{quality:result.quality?.label,score:display.neoScore,skippedQuestionIndexes}});
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
  const rows=filteredSessions();return `<div class="panel records-panel"><div class="records-controls"><input id="records-search" placeholder="測定ID / 参加者ID / ペアを検索" value="${esc(state.recordsSearch)}"><select id="records-protocol"><option value="ALL">すべての実験方式 (Protocol)</option>${['RESEARCH_V1','EVENT_V2','EVENT_V1'].map(x=>`<option value="${x}" ${state.recordsProtocol===x?'selected':''}>${protocolLabel(x)}</option>`).join('')}</select><select id="records-status"><option value="ALL">すべての状態 (Status)</option>${Object.values(SESSION_STATUS).map(x=>`<option value="${x}" ${state.recordsStatus===x?'selected':''}>${statusLabel(x)}</option>`).join('')}</select></div><div class="table-wrap"><table class="records-table"><thead><tr><th>測定ID (Measurement)</th><th>日時 (Date)</th><th>実験方式 (Protocol)</th><th>ペア (Pair)</th><th>関係カテゴリ (Category)</th><th>状態 (Status)</th><th>品質 (Quality)</th><th>NEO SCORE</th></tr></thead><tbody>${rows.map(s=>`<tr class="clickable" data-session-open="${esc(s.sessionId)}"><td><b>${esc(s.displayId)}</b></td><td>${new Date(s.createdAt||0).toLocaleString('ja-JP')}</td><td>${esc(protocolLabel(s.protocolId))}</td><td>${esc(s.participantAId)} × ${esc(s.participantBId)}</td><td>${esc(s.questionCategory||'—')}</td><td>${esc(statusLabel(s.status))}</td><td>${esc(qualityLabel(s.quality?.label||s.metrics?.quality?.label))}</td><td>${Number.isFinite(s.displayResult?.neoScore)?Math.round(s.displayResult.neoScore):'—'}</td></tr>`).join('')}</tbody></table></div>${!rows.length?'<p class="subtitle">条件に一致する記録がありません。</p>':''}</div>`;
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
function exportView(){return `<div class="panel"><div class="section-title">書き出し (EXPORT)</div><h2>研究データを書き出す</h2><p class="subtitle">標準出力に氏名は含めません。CSV / JSONの基本出力を用意しています。</p><div class="actions"><button class="btn primary" data-action="export-session-summary">セッション一覧CSV (session_summary.csv)</button><button class="btn" data-action="export-sessions-json">メタデータJSON (sessions_metadata.json)</button></div></div>`;}

async function renderSessionDetail(el){
  const s=state.recordsCache.find(x=>x.sessionId===state.recordsSelectedSessionId)||await backend.loadSession(state.recordsSelectedSessionId);if(!s){state.recordsSelectedSessionId=null;el.innerHTML=recordsListView();return;}
  const tabs=[['overview','概要 (Overview)'],['heart','心拍数 (Heart Rate)'],['metrics','指標 (Metrics)'],['questionnaire','アンケート (Questionnaire)'],['quality','品質・ログ (Quality & Logs)'],['raw','生データ (Raw Data)']];
  let content='';
  if(state.recordsTab==='heart')content=await recordsHeartTab(s);
  else if(state.recordsTab==='metrics')content=recordsMetricsTab(s);
  else if(state.recordsTab==='questionnaire')content=await recordsQuestionnaireTab(s);
  else if(state.recordsTab==='quality')content=await recordsQualityTab(s);
  else if(state.recordsTab==='raw')content=await recordsRawTab(s);
  else content=recordsOverviewTab(s);
  el.innerHTML=`<div class="records-detail-head"><button class="btn btn-quiet" data-action="records-back">← 記録一覧 (Records)</button><div><div class="section-title">測定詳細 (SESSION DETAIL)</div><h2>${esc(s.displayId)}</h2></div><div class="actions"><button class="btn" data-action="export-current-json">JSON</button><button class="btn" data-action="export-current-raw">生データCSV (RAW CSV)</button></div></div><div class="detail-tabs">${tabs.map(([id,label])=>`<button data-action="record-tab" data-tab="${id}" class="${state.recordsTab===id?'active':''}">${label}</button>`).join('')}</div><div class="panel detail-panel">${content}</div>`;
}
function recordsOverviewTab(s){return `<div class="overview-grid">${kv('測定ID (Measurement ID)',s.displayId)}${kv('内部ID (Internal UUID)',s.sessionId)}${kv('実験方式 (Protocol)',protocolLabel(s.protocolId))}${kv('状態 (Status)',statusLabel(s.status))}${kv('参加者A (Participant A)',s.participantAId)}${kv('参加者B (Participant B)',s.participantBId)}${kv('ペアID (Canonical Pair)',s.canonicalPairKey||canonicalPair(s.participantAId,s.participantBId))}${kv('関係カテゴリ (Question Category)',s.questionCategory)}${kv('質問セット順 (Set order)',s.setOrder)}${isEventProtocol(s.protocolId)?kv('イベント説明版 (Event Guide)',s.eventGuideVersion||'legacy'):''}${kv('質問スキップ数 (Skipped Questions)',Object.keys(s.skippedQuestions||{}).length)}${kv('操作端末 (Controller)',roleLabel(s.controllerDevice))}${kv('作成日時 (Created)',new Date(s.createdAt||0).toLocaleString('ja-JP'))}${kv('アプリ版 (APP)',s.appVersion)}${kv('質問バンク (Question Bank)',s.questionBankVersion)}${kv('前処理 (Preprocessing)',s.preprocessingVersion)}${kv('指標計算 (Metrics)',s.metricsVersion)}${kv('表示スコア方式 (Display Score)',s.displayScoreVersion)}${kv('表示尺度 (Display Scale)',s.displayScaleVersion)}</div><div class="callout" style="margin-top:18px">NEO SCOREは体験表示値です。質問をスキップした場合、その質問はセッション指標の集計から除外します。</div>`;}
const kv=(k,v)=>`<div class="kv"><span>${esc(k)}</span><b>${esc(v??'—')}</b></div>`;
async function recordsHeartTab(s){const [a,b]=await Promise.all([backend.loadHr(s.sessionId,'A'),backend.loadHr(s.sessionId,'B')]);return `<div class="section-title">実セッション経過時間 (TRUE SESSION ELAPSED TIME)</div><div class="dual-chart">${dualHrSvg(a,b)}</div><div class="legend"><span class="legend-a">参加者A (A)</span><span class="legend-b">参加者B (B)</span><span>欠測は線をつながず、空白 (gap) として表示</span></div><div class="grid3" style="margin-top:18px"><div class="kpi"><small>A 取得件数 (A samples)</small><strong>${a.length}</strong></div><div class="kpi"><small>B 取得件数 (B samples)</small><strong>${b.length}</strong></div><div class="kpi"><small>計測時間 (Duration)</small><strong>${fmt(Math.max(a.at(-1)?.sessionElapsedMs||0,b.at(-1)?.sessionElapsedMs||0))}</strong></div></div>`;}
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
  const pin=document.querySelector('#records-pin');if(pin)pin.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();handleAction('unlock-records',document.querySelector('[data-action="unlock-records"]'));}});
  syncSessionCreationForm();
}
function bindDynamic(){
  document.querySelectorAll('[data-session-open]').forEach(el=>el.addEventListener('click',()=>{state.recordsSelectedSessionId=el.dataset.sessionOpen;state.recordsTab='overview';renderRecordsBody();}));
  document.querySelectorAll('[data-action]').forEach(el=>{if(!el.dataset.bound){el.dataset.bound='1';el.addEventListener('click',()=>handleAction(el.dataset.action,el));}});
  const q=document.querySelector('#records-search');if(q)q.addEventListener('input',()=>{state.recordsSearch=q.value;renderRecordsBody();});
  const p=document.querySelector('#records-protocol');if(p)p.addEventListener('change',()=>{state.recordsProtocol=p.value;renderRecordsBody();});
  const st=document.querySelector('#records-status');if(st)st.addEventListener('change',()=>{state.recordsStatus=st.value;renderRecordsBody();});
}

async function handleAction(a,el){
  if(a==='display-home')return clearRole();if(a==='home')return clearRole();if(a==='create-session')return createSession();if(a==='join-session')return joinSession();
  if(a==='connect-hw9')return connectSensor(false);if(a==='connect-demo')return connectSensor(true);
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
  if(a==='export-session-summary')return exportSessionSummary();
  if(a==='export-sessions-json')return downloadText('sessions_metadata.json',JSON.stringify(state.recordsCache,null,2),'application/json');
  if(a==='export-current-json'){const s=state.recordsCache.find(x=>x.sessionId===state.recordsSelectedSessionId);if(s)downloadText(`${s.displayId}.json`,JSON.stringify(s,null,2),'application/json');return;}
  if(a==='export-current-raw')return exportCurrentRaw();
}

function render(){
  if(!state.role){stopTick();app.innerHTML=roleSelection();bind();return;}
  if(state.role===ROLE.RECORDS){stopTick();if(!isRecordsUnlocked()){app.innerHTML=recordsPinScreen();bind();return;}app.innerHTML=recordsScreen();bind();hydrateRecords();return;}
  if(!state.session){stopTick();app.innerHTML=sessionLobby();bind();return;}
  if(state.role===ROLE.DISPLAY){app.innerHTML=displayScreen();bind();startTick();state.lastPhaseKey=phaseKey(state.session);return;}
  app.innerHTML=operatorScreen();bind();startTick();state.lastPhaseKey=phaseKey(state.session);
}

window.addEventListener('beforeunload',()=>{try{if(state.sessionId&&roleSide())backend.setSensorReady(state.sessionId,roleSide(),false);}catch{}});
(async()=>{if(state.sessionId)await refreshSession();render();})();
