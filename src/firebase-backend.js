import { CONFIG, APP_VERSION } from './config.js';
import { putHr, getHr as getLocalHr, putSurvey, getSurvey as getLocalSurvey, putOutbox, deleteOutbox, listOutbox } from './idb.js';

const SDK='12.17.1';
const [{initializeApp,getApps},{getDatabase,ref,set,update,get,onValue,runTransaction,onDisconnect,push},{getAuth,signInAnonymously,onAuthStateChanged}] = await Promise.all([
  import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`),
  import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-database.js`),
  import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-auth.js`),
]);

if(!CONFIG.firebase.apiKey || !CONFIG.firebase.databaseURL) throw new Error('Firebase config is missing in src/config.js');
const app=getApps().length?getApps()[0]:initializeApp(CONFIG.firebase);
const db=getDatabase(app);const auth=getAuth(app);

async function ensureAuth(){
  if(auth.currentUser) return auth.currentUser;
  const existing=await new Promise(resolve=>{
    let done=false;const finish=v=>{if(done)return;done=true;try{off();}catch{};resolve(v)};
    const off=onAuthStateChanged(auth,user=>finish(user||null));setTimeout(()=>finish(null),1500);
  });
  if(existing) return existing;
  return (await signInAnonymously(auth)).user;
}
const user=await ensureAuth();const uid=user.uid;

let serverOffsetMs=0,connected=false,lastClockUpdateAt=0,flushing=false;
const statusListeners=new Set(),listeners=new Set(),watched=new Map();
const currentRole=()=>sessionStorage.getItem('lmneo-role')||'DISPLAY';
const canonical=(a,b)=>[a,b].sort().join('|');
const enc=x=>encodeURIComponent(String(x));

onValue(ref(db,'.info/serverTimeOffset'),snap=>{serverOffsetMs=Number(snap.val()||0);lastClockUpdateAt=Date.now();emitStatus();});
onValue(ref(db,'.info/connected'),snap=>{connected=!!snap.val();emitStatus();if(connected)flushOutbox().catch(console.error);});
function emitStatus(){const status=getBackendStatus();statusListeners.forEach(fn=>fn(status));}
export function subscribeStatus(fn){statusListeners.add(fn);fn(getBackendStatus());return()=>statusListeners.delete(fn);}
export function getBackendStatus(){return {connected,serverOffsetMs,lastClockUpdateAt,uid,backend:'firebase'};}
export function now(){return Date.now()+serverOffsetMs;}
export function getClockOffsetMs(){return serverOffsetMs;}
export function subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}

function watch(sessionId){
  const key=`${sessionId}:${currentRole()}`;if(watched.has(key))return;
  const path=currentRole()==='DISPLAY'?`public_display/${sessionId}`:`session_meta/${sessionId}`;
  const unsub=onValue(ref(db,path),()=>listeners.forEach(fn=>fn({type:'session-updated',sessionId})));
  watched.set(key,unsub);
}

function publicView(s){
  if(!s)return null;
  return {
    sessionId:s.sessionId,displayId:s.displayId,joinCode:s.joinCode,stage:s.stage,status:s.status,
    protocolId:s.protocolId,t0:s.t0||null,totalPausedMs:s.totalPausedMs||0,readyAtMs:s.readyAtMs||null,
    timeline:s.timeline||[],displayResult:s.displayResult||null,appVersion:s.appVersion,
    pausedPhase:s.pausedPhase||null,pauseRemainingMs:s.pauseRemainingMs||null,
    introPage:Number(s.introPage||0),devicePresence:s.devicePresence||{},questionCategory:s.questionCategory||null,
    skippedQuestions:s.skippedQuestions||{},eventGuideVersion:s.eventGuideVersion||null,
  };
}
async function loadPrivateSession(sessionId){const s=await get(ref(db,`session_meta/${sessionId}`));return s.exists()?s.val():null;}
async function refreshPublic(sessionId){const s=await loadPrivateSession(sessionId);if(s)await set(ref(db,`public_display/${sessionId}`),publicView(s));return s;}

function dateKey(){const d=new Date(now());return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;}
export async function allocateDisplayId(){
  const key=dateKey();const tx=await runTransaction(ref(db,`indexes/display_counter/${key}`),v=>(Number(v)||0)+1,{applyLocally:false});
  return `LM-${key}-${String(Number(tx.snapshot.val()||1)).padStart(3,'0')}`;
}
export async function allocateParticipantId(){
  const tx=await runTransaction(ref(db,'indexes/participant_counter'),v=>(Number(v)||0)+1,{applyLocally:false});
  return `P-${String(Number(tx.snapshot.val()||1)).padStart(4,'0')}`;
}

async function registerPresence(sessionId,role){
  const presenceRef=ref(db,`device_presence/${sessionId}/${uid}`);
  await set(presenceRef,{role,lastSeenAt:now()});
  try{await onDisconnect(presenceRef).remove();}catch{}
  if(role==='SENSOR_A'||role==='SENSOR_B'){
    const side=role==='SENSOR_A'?'A':'B';
    try{await onDisconnect(ref(db,`session_meta/${sessionId}/sensorReady/${side}`)).set(false);}catch{}
  }
}
export async function setPresence(sessionId,role,present=true){
  const presenceRef=ref(db,`device_presence/${sessionId}/${uid}`);
  if(present)await set(presenceRef,{role,lastSeenAt:now()});else await set(presenceRef,null);
}

export async function createSession(session){
  const enriched={...session,createdByUid:uid};
  await set(ref(db,`session_meta/${session.sessionId}`),enriched);
  await set(ref(db,`session_members/${session.sessionId}/${uid}`),currentRole());
  const codeResult=await runTransaction(ref(db,`indexes/join_code/${session.joinCode}`),cur=>cur==null?session.sessionId:undefined,{applyLocally:false});
  if(!codeResult.committed) throw new Error('6桁コードが偶然重複しました。もう一度「新しい計測を作成」を押してください。');
  await registerPresence(session.sessionId,currentRole());
  await set(ref(db,`public_display/${session.sessionId}`),publicView(enriched));
  watch(session.sessionId);return loadPrivateSession(session.sessionId);
}

export async function updateSession(sessionId,patch){
  const role=currentRole();if(role==='DISPLAY')throw new Error('DISPLAY cannot update private session state');
  const before=await loadPrivateSession(sessionId);
  await update(ref(db,`session_meta/${sessionId}`),{...patch,updatedAt:now()});
  if((patch.status==='COMPLETE'||patch.status==='ABORTED')&&before?.joinCode){
    const codeRef=ref(db,`indexes/join_code/${before.joinCode}`);const cur=await get(codeRef);if(cur.val()===sessionId)await set(codeRef,null);
  }
  return refreshPublic(sessionId);
}
export async function setSensorReady(sessionId,side,ready){await set(ref(db,`session_meta/${sessionId}/sensorReady/${side}`),!!ready);await refreshPublic(sessionId);}
export async function setSurveyStatus(sessionId,key,value=true){await set(ref(db,`session_meta/${sessionId}/surveyStatus/${key}`),!!value);await refreshPublic(sessionId);}

export async function loadSession(sessionId){watch(sessionId);const path=currentRole()==='DISPLAY'?`public_display/${sessionId}`:`session_meta/${sessionId}`;const s=await get(ref(db,path));return s.exists()?s.val():null;}
export async function joinByCode(code){
  const normalized=String(code||'').trim();if(!/^\d{6}$/.test(normalized))return null;
  const x=await get(ref(db,`indexes/join_code/${normalized}`));if(!x.exists())return null;
  const sessionId=x.val();await set(ref(db,`session_members/${sessionId}/${uid}`),currentRole());await registerPresence(sessionId,currentRole());watch(sessionId);
  const s=await loadSession(sessionId);if(s?.appVersion&&s.appVersion!==APP_VERSION)throw new Error(`APP VERSION MISMATCH: session=${s.appVersion}, this PC=${APP_VERSION}`);return s;
}

async function queueWrite(id,path,payload){await putOutbox({id,path,payload,createdAt:Date.now()});if(connected)sendOutboxItem({id,path,payload}).catch(()=>{});}
async function sendOutboxItem(item){const target=ref(db,item.path);const existing=await get(target);if(!existing.exists())await set(target,item.payload);await deleteOutbox(item.id);}
export async function flushOutbox(){
  if(flushing||!connected)return {sent:0,pending:(await listOutbox()).length};flushing=true;let sent=0;
  try{for(const item of await listOutbox()){try{await sendOutboxItem(item);sent++;}catch(e){console.warn('Outbox send failed',item.id,e);break;}}}
  finally{flushing=false;}return {sent,pending:(await listOutbox()).length};
}
export async function saveHr(sample){await putHr(sample);await queueWrite(`hr:${sample.sampleId}`,`heart_rate_raw/${sample.sessionId}/${sample.side}/${sample.sampleId}`,sample);}
export async function loadHr(sessionId,side){
  let cloud=[];try{const s=await get(ref(db,`heart_rate_raw/${sessionId}/${side}`));cloud=Object.values(s.val()||{});}catch{}
  const local=await getLocalHr(sessionId,side);const merged=new Map();[...cloud,...local].forEach(x=>merged.set(x.sampleId,x));return [...merged.values()].sort((a,b)=>a.sessionElapsedMs-b.sessionElapsedMs);
}
export async function saveSurvey(sessionId,side,stage,data){
  await putSurvey(sessionId,side,stage,data);const payload={data,submittedAt:now()};await queueWrite(`survey:${sessionId}:${side}:${stage}`,`questionnaires/${sessionId}/${side}/${stage}`,payload);if(connected)await flushOutbox();
}
export async function loadSurvey(sessionId,side,stage){try{const s=await get(ref(db,`questionnaires/${sessionId}/${side}/${stage}`));if(s.exists())return s.val();}catch{}return getLocalSurvey(sessionId,side,stage);}
export async function allSessions(){const s=await get(ref(db,'session_meta'));return Object.values(s.val()||{});}

export async function appendAuditLog(sessionId,event){
  try{const r=push(ref(db,`audit_logs/${sessionId}`));await set(r,{...event,timestamp:event.timestamp||now(),actorUid:uid,actorRole:currentRole()});}catch(e){console.warn('audit log failed',e);}
}
export async function listAuditLogs(sessionId){try{const s=await get(ref(db,`audit_logs/${sessionId}`));return Object.values(s.val()||{}).sort((a,b)=>(a.timestamp||0)-(b.timestamp||0));}catch{return [];}}

export async function chooseSetOrder(protocolId,category,pa,pb,candidates){
  const base=`indexes/assignment_counts/${enc(protocolId)}/${enc(category)}`;const snap=await get(ref(db,base));const vals=snap.val()||{};
  const counts=Object.fromEntries(candidates.map(x=>[x,Number(vals[x]||0)]));const min=Math.min(...Object.values(counts));let pool=candidates.filter(x=>counts[x]===min);
  const pairKey=enc(canonical(pa,pb));let last=null;try{const p=await get(ref(db,`indexes/pair_last_order/${pairKey}/${enc(protocolId)}/${enc(category)}`));last=p.val()||null;}catch{}
  const nonrepeat=pool.filter(x=>x!==last);if(nonrepeat.length)pool=nonrepeat;
  const chosen=pool[Math.floor(Math.random()*pool.length)];await runTransaction(ref(db,`${base}/${chosen}`),v=>(Number(v)||0)+1);
  await set(ref(db,`indexes/pair_last_order/${pairKey}/${enc(protocolId)}/${enc(category)}`),chosen).catch(()=>{});return chosen;
}
