import { CONFIG } from './config.js';

const KEY='lmneo-records-until';
const LAST_ACTIVITY_KEY='lmneo-records-last-activity';

function markActivity(){
  if(isRecordsUnlocked()) sessionStorage.setItem(LAST_ACTIVITY_KEY,String(Date.now()));
}

export function isRecordsUnlocked(){
  const until=Number(sessionStorage.getItem(KEY)||0);
  const last=Number(sessionStorage.getItem(LAST_ACTIVITY_KEY)||0);
  if(!until || until<=Date.now()) { lockRecords(); return false; }
  if(last && Date.now()-last>CONFIG.recordsIdleLockMs){ lockRecords(); return false; }
  return true;
}

export function touchRecordsActivity(){ markActivity(); }
export function lockRecords(){
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(LAST_ACTIVITY_KEY);
}

async function sha256Hex(text){
  const bytes=new TextEncoder().encode(text);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

async function verifyClientDevHash(pin){
  if(!/^\d{4,12}$/.test(String(pin||''))) throw new Error('PINは数字4〜12桁で入力してください。');
  const hash=await sha256Hex(CONFIG.recordsPinHashPrefix+String(pin));
  if(hash!==CONFIG.recordsPinHash) throw new Error('PINが違います。');
  const recordsUntil=Date.now()+CONFIG.recordsIdleLockMs;
  sessionStorage.setItem(KEY,String(recordsUntil));
  sessionStorage.setItem(LAST_ACTIVITY_KEY,String(Date.now()));
  return {ok:true,recordsUntil,mode:'client-dev-hash'};
}

export async function verifyRecordsPin(pin){
  if(CONFIG.backendMode==='local'){
    const recordsUntil=Date.now()+CONFIG.recordsIdleLockMs;
    sessionStorage.setItem(KEY,String(recordsUntil));
    sessionStorage.setItem(LAST_ACTIVITY_KEY,String(Date.now()));
    return {ok:true,recordsUntil,mode:'local'};
  }
  if(CONFIG.adminGateMode==='client-dev-hash') return verifyClientDevHash(pin);

  const SDK='12.17.1';
  const [{getApps},{getAuth},{getFunctions,httpsCallable}] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-functions.js`),
  ]);
  const app=getApps()[0]; if(!app) throw new Error('Firebase is not initialized');
  const fn=httpsCallable(getFunctions(app),'verifyRecordsPin');
  const result=await fn({pin:String(pin)});
  if(!result.data?.ok) throw new Error('PINを確認できませんでした。');
  await getAuth(app).currentUser?.getIdToken(true);
  sessionStorage.setItem(KEY,String(result.data.recordsUntil));
  sessionStorage.setItem(LAST_ACTIVITY_KEY,String(Date.now()));
  return result.data;
}
