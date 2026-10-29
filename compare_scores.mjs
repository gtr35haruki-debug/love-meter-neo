import fs from 'node:fs';
import path from 'node:path';
import {computeSessionMetrics} from './src/metrics.js';
const root='/mnt/data/lm_data/sessions';
const excluded=new Set(['LM-20260828-001','LM-20260828-002','LM-20260829-010','LM-20260830-002','LM-20260912-023','LM-20260913-027']);
const rows=[];
for(const d of fs.readdirSync(root)){
  const sp=path.join(root,d,'session.json'); if(!fs.existsSync(sp)) continue;
  const s=JSON.parse(fs.readFileSync(sp,'utf8'));
  if(s.protocolId!=='EVENT_V2'||excluded.has(s.displayId)) continue;
  const a=JSON.parse(fs.readFileSync(path.join(root,d,'heart_rate_raw_A.json'),'utf8'));
  const b=JSON.parse(fs.readFileSync(path.join(root,d,'heart_rate_raw_B.json'),'utf8'));
  const oldQ=JSON.parse(fs.readFileSync(path.join(root,d,'question_metrics.json'),'utf8'));
  const skipped=oldQ.filter(x=>x.skipped).map(x=>x.question?.globalQuestionIndex).filter(Number.isFinite);
  const r=computeSessionMetrics({aSamples:a,bSamples:b,timeline:s.timeline,protocolId:s.protocolId,skippedQuestionIndexes:skipped});
  const oldScore=s.metrics?.neoScore ?? null;
  const newScore=r.session.neoScore;
  const oldQr=s.metrics?.questionResponse ?? null;
  const newQr=r.session.questionResponse;
  rows.push({id:s.displayId,oldScore,newScore,diff:(Number.isFinite(oldScore)&&Number.isFinite(newScore))?newScore-oldScore:null,oldQr,newQr});
}
const diffs=rows.map(r=>r.diff).filter(Number.isFinite).sort((a,b)=>a-b);
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
const median=xs=>xs.length%2?xs[(xs.length-1)/2]:(xs[xs.length/2-1]+xs[xs.length/2])/2;
console.log(JSON.stringify({n:rows.length,meanDiff:mean(diffs),medianDiff:median(diffs),minDiff:diffs[0],maxDiff:diffs.at(-1),absMean:mean(diffs.map(Math.abs)),over5:diffs.filter(x=>Math.abs(x)>=5).length,over10:diffs.filter(x=>Math.abs(x)>=10).length,examples:[...rows].sort((a,b)=>Math.abs(b.diff)-Math.abs(a.diff)).slice(0,10)},null,2));
