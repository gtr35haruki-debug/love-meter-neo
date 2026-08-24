import { CONFIG } from './config.js';

const impl = CONFIG.backendMode === 'firebase'
  ? await import('./firebase-backend.js')
  : await import('./local-backend.js');

export const subscribe = impl.subscribe;
export const createSession = impl.createSession;
export const updateSession = impl.updateSession;
export const loadSession = impl.loadSession;
export const joinByCode = impl.joinByCode;
export const saveHr = impl.saveHr;
export const loadHr = impl.loadHr;
export const saveSurvey = impl.saveSurvey;
export const loadSurvey = impl.loadSurvey;
export const allSessions = impl.allSessions;
export const chooseSetOrder = impl.chooseSetOrder;
export const allocateDisplayId = impl.allocateDisplayId;
export const allocateParticipantId = impl.allocateParticipantId;
export const appendAuditLog = impl.appendAuditLog || (async()=>{});
export const listAuditLogs = impl.listAuditLogs || (async()=>[]);
export const setPresence = impl.setPresence || (async()=>{});
export const setSensorReady = impl.setSensorReady || (async (sessionId,side,ready)=>{
  const s=await impl.loadSession(sessionId);return impl.updateSession(sessionId,{sensorReady:{...(s?.sensorReady||{}),[side]:ready}});
});
export const setSurveyStatus = impl.setSurveyStatus || (async (sessionId,key,value=true)=>{
  const s=await impl.loadSession(sessionId);return impl.updateSession(sessionId,{surveyStatus:{...(s?.surveyStatus||{}),[key]:value}});
});
export const now = impl.now || (()=>Date.now());
export const getClockOffsetMs = impl.getClockOffsetMs || (()=>0);
export const getBackendStatus = impl.getBackendStatus || (()=>({connected:true,serverOffsetMs:0,backend:'local'}));
export const subscribeStatus = impl.subscribeStatus || ((fn)=>{fn(getBackendStatus());return()=>{};});
export const flushOutbox = impl.flushOutbox || (async()=>({sent:0,pending:0}));
