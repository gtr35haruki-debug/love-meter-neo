import { CONFIG } from './config.js?v=0.4.0b4';

const SDK='12.17.1';
let _fns=null;
async function getFns(){
  if(CONFIG.backendMode!=='firebase')return null;
  if(_fns)return _fns;
  const [{getApps},{getFunctions,httpsCallable}] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-functions.js`),
  ]);
  const app=getApps()[0];if(!app)throw new Error('Firebase is not initialized');
  _fns={getFunctions,httpsCallable,app};return _fns;
}

async function blobToBase64(blob){
  const buf=await blob.arrayBuffer();
  const bytes=new Uint8Array(buf);let binary='';const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  return btoa(binary);
}

export async function transcribeParticipantAudio({blob,sessionId,questionIndex,questionText,side}){
  if(!CONFIG.ai.enabled||!blob?.size)return null;
  if(blob.size>CONFIG.ai.maxAudioBytes)throw new Error('音声データが上限を超えました。');
  if(CONFIG.backendMode==='local')return null;
  const f=await getFns();const fn=f.httpsCallable(f.getFunctions(f.app),'transcribeParticipantAudio');
  const audioBase64=await blobToBase64(blob);
  const res=await fn({audioBase64,mimeType:blob.type||'audio/webm',sessionId,questionIndex,questionText,side});
  return res.data||null;
}

export async function analyzeConversationTranscripts({sessionId,questionIndex,questionText,transcriptA,transcriptB}){
  if(!CONFIG.ai.enabled||CONFIG.backendMode==='local')return null;
  const f=await getFns();const fn=f.httpsCallable(f.getFunctions(f.app),'analyzeConversationTranscripts');
  const res=await fn({sessionId,questionIndex,questionText,transcriptA,transcriptB});
  return res.data||null;
}

// Backward-compatible helper for older beta data/tools.
export async function analyzeConversationAudio({blob,sessionId,questionIndex,questionText,side='A'}){
  return transcribeParticipantAudio({blob,sessionId,questionIndex,questionText,side});
}

export async function generateResultComment(payload){
  if(!CONFIG.ai.enabled||CONFIG.backendMode==='local')return null;
  const f=await getFns();const fn=f.httpsCallable(f.getFunctions(f.app),'generateResultComment');
  const res=await fn(payload);return res.data||null;
}
