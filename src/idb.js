const DB_NAME='love-meter-neo';
const DB_VERSION=2;
let dbPromise=null;

function openDb(){
  if(dbPromise) return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains('hr')){
        const store=db.createObjectStore('hr',{keyPath:'sampleId'});
        store.createIndex('sessionSide',['sessionId','side'],{unique:false});
      }
      if(!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions',{keyPath:'sessionId'});
      if(!db.objectStoreNames.contains('surveys')) db.createObjectStore('surveys',{keyPath:'id'});
      if(!db.objectStoreNames.contains('outbox')){
        const store=db.createObjectStore('outbox',{keyPath:'id'});
        store.createIndex('createdAt','createdAt',{unique:false});
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return dbPromise;
}

async function tx(storeName,mode,fn){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const t=db.transaction(storeName,mode), store=t.objectStore(storeName);
    const result=fn(store);
    t.oncomplete=()=>resolve(result);
    t.onerror=()=>reject(t.error);
  });
}

export async function putSession(session){ return tx('sessions','readwrite',s=>s.put(session)); }
export async function getSession(sessionId){
  const db=await openDb();
  return new Promise((resolve,reject)=>{const r=db.transaction('sessions').objectStore('sessions').get(sessionId);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});
}
export async function listSessions(){
  const db=await openDb();
  return new Promise((resolve,reject)=>{const r=db.transaction('sessions').objectStore('sessions').getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});
}
export async function putHr(sample){ return tx('hr','readwrite',s=>s.put(sample)); }
export async function getHr(sessionId,side){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const idx=db.transaction('hr').objectStore('hr').index('sessionSide');
    const r=idx.getAll(IDBKeyRange.only([sessionId,side]));
    r.onsuccess=()=>resolve((r.result||[]).sort((a,b)=>a.sessionElapsedMs-b.sessionElapsedMs));
    r.onerror=()=>reject(r.error);
  });
}
export async function putSurvey(sessionId,side,stage,data){
  return tx('surveys','readwrite',s=>s.put({id:`${sessionId}:${side}:${stage}`,sessionId,side,stage,data,submittedAt:Date.now()}));
}
export async function getSurvey(sessionId,side,stage){
  const db=await openDb();
  return new Promise((resolve,reject)=>{const r=db.transaction('surveys').objectStore('surveys').get(`${sessionId}:${side}:${stage}`);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});
}

export async function putOutbox(item){return tx('outbox','readwrite',s=>s.put(item));}
export async function deleteOutbox(id){return tx('outbox','readwrite',s=>s.delete(id));}
export async function listOutbox(){
  const db=await openDb();
  return new Promise((resolve,reject)=>{const r=db.transaction('outbox').objectStore('outbox').getAll();r.onsuccess=()=>resolve((r.result||[]).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)));r.onerror=()=>reject(r.error);});
}
