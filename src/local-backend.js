import { putSession, getSession, listSessions, putHr, getHr, putSurvey, getSurvey } from './idb.js';

const CHANNEL='love-meter-neo-sync';
const bc=('BroadcastChannel' in window)?new BroadcastChannel(CHANNEL):null;
const listeners=new Set();
if(bc) bc.onmessage=(e)=>listeners.forEach(fn=>fn(e.data));
window.addEventListener('storage',e=>{if(e.key?.startsWith('lmneo:'))listeners.forEach(fn=>fn({type:'storage',key:e.key}));});
function emit(msg){ if(bc) bc.postMessage(msg); listeners.forEach(fn=>fn(msg)); }
function sessionKey(code){return `lmneo:code:${code}`;}
function stateKey(id){return `lmneo:session:${id}`;}
const canonical=(a,b)=>[a,b].sort().join('|');

export function subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}
export function now(){return Date.now();}
export function getClockOffsetMs(){return 0;}
export function getBackendStatus(){return {connected:true,serverOffsetMs:0,backend:'local'};}
export function subscribeStatus(fn){fn(getBackendStatus());return()=>{};}

function nextCounter(key){const n=Number(localStorage.getItem(key)||0)+1;localStorage.setItem(key,String(n));return n;}
export async function allocateDisplayId(){
  const d=new Date();const date=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return `LM-${date}-${String(nextCounter(`lmneo:counter:display:${date}`)).padStart(3,'0')}`;
}
export async function allocateParticipantId(){return `P-${String(nextCounter('lmneo:counter:participant')).padStart(4,'0')}`;}

export async function createSession(session){
  localStorage.setItem(sessionKey(session.joinCode),session.sessionId);
  localStorage.setItem(stateKey(session.sessionId),JSON.stringify(session));
  await putSession(session);emit({type:'session-created',sessionId:session.sessionId});return session;
}
export async function updateSession(sessionId,patch){
  const current=await loadSession(sessionId);if(!current) throw new Error('Session not found');
  const next={...current,...patch,updatedAt:Date.now()};localStorage.setItem(stateKey(sessionId),JSON.stringify(next));await putSession(next);
  if((patch.status==='COMPLETE'||patch.status==='ABORTED')&&current.joinCode)localStorage.removeItem(sessionKey(current.joinCode));
  emit({type:'session-updated',sessionId});return next;
}
export async function loadSession(sessionId){const raw=localStorage.getItem(stateKey(sessionId));if(raw){try{return JSON.parse(raw)}catch{}}return getSession(sessionId);}
export async function joinByCode(code){const id=localStorage.getItem(sessionKey(code));return id?loadSession(id):null;}
export async function setPresence(sessionId,role,present=true){const s=await loadSession(sessionId);return updateSession(sessionId,{devicePresence:{...(s?.devicePresence||{}),[role]:present?Date.now():null}});}
export async function setSensorReady(sessionId,side,ready){const s=await loadSession(sessionId);return updateSession(sessionId,{sensorReady:{...(s?.sensorReady||{}),[side]:!!ready}});}
export async function setSurveyStatus(sessionId,key,value=true){const s=await loadSession(sessionId);return updateSession(sessionId,{surveyStatus:{...(s?.surveyStatus||{}),[key]:!!value}});}
export async function saveHr(sample){await putHr(sample);emit({type:'hr',sessionId:sample.sessionId,side:sample.side});}
export async function loadHr(sessionId,side){return getHr(sessionId,side);}
export async function saveSurvey(sessionId,side,stage,data){await putSurvey(sessionId,side,stage,data);emit({type:'survey',sessionId,side,stage});}
export async function loadSurvey(sessionId,side,stage){return getSurvey(sessionId,side,stage);}
export async function allSessions(){return listSessions();}
export async function appendAuditLog(sessionId,event){const key=`lmneo:audit:${sessionId}`;const rows=JSON.parse(localStorage.getItem(key)||'[]');rows.push({...event,timestamp:event.timestamp||Date.now()});localStorage.setItem(key,JSON.stringify(rows));}
export async function listAuditLogs(sessionId){return JSON.parse(localStorage.getItem(`lmneo:audit:${sessionId}`)||'[]');}
export async function flushOutbox(){return {sent:0,pending:0};}

export async function chooseSetOrder(protocolId,category,pa,pb,candidates){
  const sessions=await listSessions();const same=sessions.filter(x=>x.protocolId===protocolId&&x.questionCategory===category);const counts=Object.fromEntries(candidates.map(x=>[x,0]));
  for(const x of same) if(counts[x.setOrder]!=null) counts[x.setOrder]++;
  const min=Math.min(...Object.values(counts));let pool=candidates.filter(x=>counts[x]===min);
  const last=[...same].reverse().find(x=>canonical(x.participantAId,x.participantBId)===canonical(pa,pb))?.setOrder;
  const nonrepeat=pool.filter(x=>x!==last);if(nonrepeat.length)pool=nonrepeat;
  return pool[Math.floor(Math.random()*pool.length)];
}
