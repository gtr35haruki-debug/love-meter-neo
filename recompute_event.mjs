import fs from 'node:fs';
import path from 'node:path';
import {computeSessionMetrics} from './src/metrics.js';
const root='/mnt/data/lm_data/sessions';
const excluded=new Set(['LM-20260828-001','LM-20260828-002','LM-20260829-010','LM-20260830-002','LM-20260912-023','LM-20260913-027']);
const dirs=fs.readdirSync(root);
let sessions=0;
const validByQ=[0,0,0], totalByQ=[0,0,0], oldValidByQ=[0,0,0], oldTotalByQ=[0,0,0];
let anyInvalid=[];
for(const d of dirs){
  const sp=path.join(root,d,'session.json');
  if(!fs.existsSync(sp)) continue;
  const s=JSON.parse(fs.readFileSync(sp,'utf8'));
  if(s.protocolId!=='EVENT_V2' || excluded.has(s.displayId)) continue;
  const a=JSON.parse(fs.readFileSync(path.join(root,d,'heart_rate_raw_A.json'),'utf8'));
  const b=JSON.parse(fs.readFileSync(path.join(root,d,'heart_rate_raw_B.json'),'utf8'));
  let skipped=[];
  const oldQp=path.join(root,d,'question_metrics.json');
  let old=[];
  if(fs.existsSync(oldQp)){
    old=JSON.parse(fs.readFileSync(oldQp,'utf8'));
    skipped=old.filter(x=>x.skipped).map(x=>x.question?.globalQuestionIndex).filter(Number.isFinite);
    old.forEach((x,i)=>{ if(i<3){oldTotalByQ[i]++; if(x.qResponseA?.valid && x.qResponseB?.valid) oldValidByQ[i]++;} });
  }
  const r=computeSessionMetrics({aSamples:a,bSamples:b,timeline:s.timeline,protocolId:s.protocolId,skippedQuestionIndexes:skipped});
  sessions++;
  r.perQuestion.forEach((x,i)=>{ if(i<3){totalByQ[i]++; if(x.qResponseA?.valid && x.qResponseB?.valid) validByQ[i]++; else anyInvalid.push([s.displayId,i+1,x.qResponseA?.reason,x.qResponseB?.reason]);} });
}
console.log(JSON.stringify({sessions,old:{validByQ:oldValidByQ,totalByQ:oldTotalByQ},patched:{validByQ,totalByQ},invalidExamples:anyInvalid.slice(0,20),invalidCount:anyInvalid.length},null,2));
