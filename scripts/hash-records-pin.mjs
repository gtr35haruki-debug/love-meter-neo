import crypto from 'node:crypto';
const pin=process.argv[2];
if(!pin){console.error('Usage: node scripts/hash-records-pin.mjs <PIN>');process.exit(1);}
const hash=crypto.createHash('sha256').update('love-meter-neo-records-v1:'+pin).digest('hex');
console.log(hash);
