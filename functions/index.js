const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {defineSecret}=require('firebase-functions/params');
const admin=require('firebase-admin');
const crypto=require('crypto');
admin.initializeApp();

const RECORDS_PIN_HASH=defineSecret('RECORDS_PIN_HASH');
const HASH_PREFIX='love-meter-neo-records-v1:';

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
