import { CONFIG } from './config.js';

const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
const median = xs => {
  if (!xs.length) return null;
  const s=[...xs].sort((a,b)=>a-b), m=Math.floor(s.length/2);
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
};

export function movingMedian3(series) {
  // Use true 1-second neighbours, not neighbouring array positions, so gaps are never smoothed across.
  const bySec=new Map(series.map(p=>[Math.round(p.elapsedMs/1000),p]));
  return series.map(p=>{
    const sec=Math.round(p.elapsedMs/1000), vals=[];
    for(let d=-1;d<=1;d++){
      const q=bySec.get(sec+d);
      if(q && Number.isFinite(q.bpm)) vals.push(q.bpm);
    }
    return {...p, cleanBpm: median(vals)};
  });
}

export function deriveDelta(series, sec=CONFIG.metrics.deltaIntervalSec) {
  const bySec=new Map(series.map(p=>[Math.round(p.elapsedMs/1000),p]));
  return series.map(p=>{
    const t=Math.round(p.elapsedMs/1000);
    const prev=bySec.get(t-sec);
    const d=(Number.isFinite(p.cleanBpm)&&Number.isFinite(prev?.cleanBpm)) ? p.cleanBpm-prev.cleanBpm : null;
    return {...p, deltaHr3:d};
  });
}

export function preprocess(samples) {
  const oneHz = resampleOneHz(samples);
  return deriveDelta(movingMedian3(oneHz));
}

export function resampleOneHz(samples, toleranceMs=CONFIG.metrics.oneHzNearestToleranceMs) {
  // Project irregular ~1 Hz BLE notifications onto the shared session clock.
  // A raw sample can be used only once. This prevents false gaps when the
  // notification timing drifts across an integer-second boundary.
  const ordered=[...samples]
    .filter(s=>Number.isFinite(s?.sessionElapsedMs)&&Number.isFinite(s?.bpm))
    .sort((a,b)=>a.sessionElapsedMs-b.sessionElapsedMs);
  if(!ordered.length) return [];
  const maxSec=Math.max(0,Math.floor(ordered.at(-1).sessionElapsedMs/1000));
  const out=[]; let cursor=0;
  for(let sec=0;sec<=maxSec;sec++){
    const target=sec*1000;
    while(cursor<ordered.length && ordered[cursor].sessionElapsedMs<target-toleranceMs) cursor++;
    let bestIndex=-1,bestDist=Infinity;
    for(let i=cursor;i<ordered.length&&ordered[i].sessionElapsedMs<=target+toleranceMs;i++){
      const dist=Math.abs(ordered[i].sessionElapsedMs-target);
      if(dist<bestDist){bestDist=dist;bestIndex=i;}
    }
    if(bestIndex<0) continue;
    const raw=ordered[bestIndex]; cursor=bestIndex+1;
    out.push({
      elapsedMs:target,
      bpm:raw.bpm,
      phase:raw.phase||null,
      setIndex:raw.setIndex??null,
      questionIndex:raw.questionIndex??null,
      sourceElapsedMs:raw.sessionElapsedMs,
      sourceOffsetMs:raw.sessionElapsedMs-target,
    });
  }
  return out;
}

function pearson(xs,ys){
  if(xs.length<3 || xs.length!==ys.length) return null;
  const mx=mean(xs), my=mean(ys);
  let n=0, dx=0, dy=0;
  for(let i=0;i<xs.length;i++){
    const a=xs[i]-mx,b=ys[i]-my;
    n+=a*b;dx+=a*a;dy+=b*b;
  }
  if(dx===0||dy===0) return null;
  return n/Math.sqrt(dx*dy);
}

function consecutiveMissingMax(validMask){
  let max=0,cur=0;
  for(const v of validMask){ if(v){cur=0}else{cur++;max=Math.max(max,cur);} }
  return max;
}

function pairBySecond(a,b,startMs,endMs){
  const ma=new Map(a.map(p=>[Math.round(p.elapsedMs/1000),p]));
  const mb=new Map(b.map(p=>[Math.round(p.elapsedMs/1000),p]));
  const out=[];
  for(let ms=startMs;ms<endMs;ms+=1000){
    const sec=Math.round(ms/1000); out.push({sec,a:ma.get(sec),b:mb.get(sec)});
  }
  return out;
}

export function directionMetric(a,b,startMs,endMs,isResearch=true){
  const theta=CONFIG.metrics.directionThresholdBpm;
  const pairs=pairBySecond(a,b,startMs,endMs);
  let same=0,opp=0,uni=0,active=0,valid=0;
  for(const p of pairs){
    const da=p.a?.deltaHr3, db=p.b?.deltaHr3;
    if(!Number.isFinite(da)||!Number.isFinite(db)) continue;
    valid++;
    const ca=da>=theta?'UP':da<=-theta?'DOWN':'STABLE';
    const cb=db>=theta?'UP':db<=-theta?'DOWN':'STABLE';
    if(ca==='STABLE'&&cb==='STABLE') continue;
    active++;
    if(ca===cb) same++;
    else if(ca!=='STABLE'&&cb!=='STABLE') opp++;
    else uni++;
  }
  const requiredValid=isResearch?CONFIG.metrics.researchQuestionValidSeconds:Math.ceil(pairs.length*.8);
  const requiredActive=isResearch?CONFIG.metrics.researchDirectionActiveMinSeconds:Math.max(4,Math.ceil(pairs.length*.2));
  const ok=valid>=requiredValid && active>=requiredActive;
  return {
    valid:ok,
    directionSync:ok?100*same/active:null,
    sameRate:active?100*same/active:null,
    oppositeRate:active?100*opp/active:null,
    unilateralRate:active?100*uni/active:null,
    activeCoverage:pairs.length?active/pairs.length:null,
    eligibleSeconds:active,
    validSeconds:valid,
    reason:ok?null:(valid<requiredValid?'INSUFFICIENT_VALID_DATA':'LOW_ACTIVITY')
  };
}

export function magnitudeMetric(series,startMs,endMs,baseStartMs,baseEndMs){
  const q=series.filter(p=>p.elapsedMs>=startMs&&p.elapsedMs<endMs&&Number.isFinite(p.deltaHr3));
  const base=series.filter(p=>p.elapsedMs>=baseStartMs&&p.elapsedMs<baseEndMs&&Number.isFinite(p.deltaHr3));
  const activity=mean(q.map(p=>Math.abs(p.deltaHr3)));
  const baseActivity=mean(base.map(p=>Math.abs(p.deltaHr3)));
  return {activity,baseActivity,netMagnitude:(activity!=null&&baseActivity!=null)?activity-baseActivity:null};
}

export function temporalMetric(a,b,startMs,endMs,isResearch=true){
  const ma=new Map(a.map(p=>[Math.round(p.elapsedMs/1000),p]));
  const mb=new Map(b.map(p=>[Math.round(p.elapsedMs/1000),p]));
  const startSec=Math.ceil(startMs/1000),endSec=Math.floor((endMs-1)/1000);
  const baseValid=[];
  for(let s=startSec;s<=endSec;s++) baseValid.push(Number.isFinite(ma.get(s)?.deltaHr3)&&Number.isFinite(mb.get(s)?.deltaHr3));
  const validSeconds=baseValid.filter(Boolean).length;
  const maxGap=consecutiveMissingMax(baseValid);
  const required=isResearch?CONFIG.metrics.temporalValidSeconds:Math.ceil((endSec-startSec+1)*.8);
  if(validSeconds<required || maxGap>=CONFIG.metrics.temporalContinuousGapInvalidSec){
    return {valid:false,rMax:null,bestLag:null,rByLag:{},validSeconds,maxGap,reason:validSeconds<required?'INSUFFICIENT_VALID_DATA':'CONTINUOUS_GAP'};
  }
  const rByLag={}; let rMax=-Infinity,bestLag=null;
  for(let lag=-CONFIG.metrics.temporalMaxLagSec;lag<=CONFIG.metrics.temporalMaxLagSec;lag++){
    const xs=[],ys=[];
    for(let s=startSec;s<=endSec;s++){
      const pa=ma.get(s),pb=mb.get(s+lag);
      if(Number.isFinite(pa?.deltaHr3)&&Number.isFinite(pb?.deltaHr3)){
        xs.push(Math.abs(pa.deltaHr3));ys.push(Math.abs(pb.deltaHr3));
      }
    }
    const r=pearson(xs,ys); rByLag[lag]=r;
    if(Number.isFinite(r)&&r>rMax){rMax=r;bestLag=lag;}
  }
  const valid=bestLag!==null;
  return {valid,rMax:valid?rMax:null,bestLag,rByLag,validSeconds,maxGap,reason:valid?null:'NO_VARIANCE'};
}

export function balanceMetric(netA,netB){
  if(!Number.isFinite(netA)||!Number.isFinite(netB)) return {valid:false,balance:null,reason:'MISSING_MAGNITUDE'};
  const a=Math.max(0,netA),b=Math.max(0,netB),sum=a+b;
  if(sum<CONFIG.metrics.balanceEpsilon) return {valid:false,balance:null,reason:'NO_REACTION'};
  return {valid:true,balance:100*(1-Math.abs(a-b)/sum)};
}

export function qResponseMetric(series,qStart,qEnd,localStart,localEnd,setBaseStart,setBaseEnd){
  const local=series.filter(p=>p.elapsedMs>=localStart&&p.elapsedMs<localEnd&&Number.isFinite(p.cleanBpm));
  const question=series.filter(p=>p.elapsedMs>=qStart&&p.elapsedMs<qEnd&&Number.isFinite(p.cleanBpm));
  const setbase=series.filter(p=>p.elapsedMs>=setBaseStart&&p.elapsedMs<setBaseEnd&&Number.isFinite(p.cleanBpm));
  const localBaseline=median(local.map(p=>p.cleanBpm));
  const setBaseline=median(setbase.map(p=>p.cleanBpm));
  if(local.length<CONFIG.metrics.localBaselineValidSeconds || localBaseline==null) return {valid:false,reason:'LOCAL_BASELINE_INVALID'};
  const preAbs=mean(local.map(p=>Math.abs(p.cleanBpm-localBaseline))) || 0;
  const qAbs=mean(question.map(p=>Math.abs(p.cleanBpm-localBaseline)));
  const signed=mean(question.map(p=>p.cleanBpm-localBaseline));
  const setAbs=setBaseline==null?null:mean(question.map(p=>Math.abs(p.cleanBpm-setBaseline)));
  return {
    valid:qAbs!=null,
    localBaseline,
    localAbsDev:qAbs,
    netLocalQResponse:qAbs==null?null:qAbs-preAbs,
    signedShift:signed,
    setBaseQResponse:setAbs,
  };
}

function pilotDisplayScale(value, anchor){
  if(!Number.isFinite(value)||!anchor) return null;
  const {p10,p50,p90}=anchor;
  let out;
  if(value<=p50){
    out=30+30*(value-p10)/((p50-p10)||1);
  }else{
    out=60+30*(value-p50)/((p90-p50)||1);
  }
  return Math.max(0,Math.min(100,out));
}

function segmentResponse(series,startMs,endMs,baseline){
  if(!Number.isFinite(baseline)) return null;
  const vals=series.filter(p=>p.elapsedMs>=startMs&&p.elapsedMs<endMs&&Number.isFinite(p.cleanBpm));
  return vals.length?mean(vals.map(p=>Math.abs(p.cleanBpm-baseline))):null;
}

export function computeSessionMetrics({aSamples,bSamples,timeline,protocolId}){
  const a=preprocess(aSamples),b=preprocess(bSamples);
  const questions=timeline.filter(x=>x.phase==='QUESTION');
  const perQuestion=[];
  for(const q of questions){
    const setBase=timeline.find(x=>x.setIndex===q.setIndex&&x.phase==='BASELINE');
    const prev=timeline.filter(x=>x.setIndex===q.setIndex&&x.endOffsetMs<=q.startOffsetMs).at(-1) || setBase;
    const localEnd=q.startOffsetMs;
    const localStart=Math.max(prev.startOffsetMs,localEnd-CONFIG.metrics.localBaselineSeconds*1000);
    const dir=directionMetric(a,b,q.startOffsetMs,q.endOffsetMs,protocolId==='RESEARCH_V1');
    const magA=magnitudeMetric(a,q.startOffsetMs,q.endOffsetMs,setBase.startOffsetMs,setBase.endOffsetMs);
    const magB=magnitudeMetric(b,q.startOffsetMs,q.endOffsetMs,setBase.startOffsetMs,setBase.endOffsetMs);
    const temporal=temporalMetric(a,b,q.startOffsetMs,q.endOffsetMs,protocolId==='RESEARCH_V1');
    const balance=balanceMetric(magA.netMagnitude,magB.netMagnitude);
    const qrA=qResponseMetric(a,q.startOffsetMs,q.endOffsetMs,localStart,localEnd,setBase.startOffsetMs,setBase.endOffsetMs);
    const qrB=qResponseMetric(b,q.startOffsetMs,q.endOffsetMs,localStart,localEnd,setBase.startOffsetMs,setBase.endOffsetMs);
    const nextPhase=timeline.find(x=>x.startOffsetMs===q.endOffsetMs);
    const earlyEnd=Math.min(q.endOffsetMs,q.startOffsetMs+10000);
    const postEnd=nextPhase?Math.min(nextPhase.endOffsetMs,nextPhase.startOffsetMs+10000):q.endOffsetMs;
    const phases={
      A:{early:segmentResponse(a,q.startOffsetMs,earlyEnd,qrA.localBaseline),interaction:segmentResponse(a,earlyEnd,q.endOffsetMs,qrA.localBaseline),post:nextPhase?segmentResponse(a,nextPhase.startOffsetMs,postEnd,qrA.localBaseline):null},
      B:{early:segmentResponse(b,q.startOffsetMs,earlyEnd,qrB.localBaseline),interaction:segmentResponse(b,earlyEnd,q.endOffsetMs,qrB.localBaseline),post:nextPhase?segmentResponse(b,nextPhase.startOffsetMs,postEnd,qrB.localBaseline):null},
    };
    perQuestion.push({question:q,direction:dir,magnitudeA:magA,magnitudeB:magB,pairMagnitude:(magA.netMagnitude!=null&&magB.netMagnitude!=null)?(magA.netMagnitude+magB.netMagnitude)/2:null,temporal,balance,qResponseA:{...qrA,phases:phases.A},qResponseB:{...qrB,phases:phases.B},pairQResponse:(qrA.netLocalQResponse!=null&&qrB.netLocalQResponse!=null)?(qrA.netLocalQResponse+qrB.netLocalQResponse)/2:null});
  }
  const dirVals=perQuestion.map(x=>x.direction.directionSync).filter(Number.isFinite);
  const tempVals=perQuestion.map(x=>x.temporal.rMax).filter(Number.isFinite);
  const magVals=perQuestion.map(x=>x.pairMagnitude).filter(Number.isFinite);
  const balVals=perQuestion.map(x=>x.balance.balance).filter(Number.isFinite);
  const qVals=perQuestion.map(x=>x.pairQResponse).filter(Number.isFinite);
  const directionSession=median(dirVals),temporalSession=median(tempVals),magnitudeSession=median(magVals),balanceSession=median(balVals),qResponseSession=median(qVals);
  const totalSec=Math.ceil((timeline.at(-1)?.endOffsetMs||0)/1000);
  const gridStats=(series)=>{
    const valid=new Set(series.filter(x=>x.elapsedMs>=0&&x.elapsedMs<totalSec*1000&&Number.isFinite(x.bpm)).map(x=>Math.round(x.elapsedMs/1000)));
    let maxGap=0,cur=0;
    for(let sec=0;sec<totalSec;sec++){
      if(valid.has(sec)) cur=0;
      else { cur++; maxGap=Math.max(maxGap,cur); }
    }
    return {coverage:totalSec?Math.min(1,valid.size/totalSec):0,maxGap};
  };
  const qa=gridStats(a),qb=gridStats(b),coverageA=qa.coverage,coverageB=qb.coverage;
  const minCoverage=Math.min(coverageA,coverageB),maxContinuousGapSec=Math.max(qa.maxGap,qb.maxGap);
  const qualityLabel=minCoverage<CONFIG.metrics.qcCaution?'INVALID':(minCoverage<CONFIG.metrics.qcGood||maxContinuousGapSec>=CONFIG.metrics.sessionContinuousGapCautionSec)?'CAUTION':'GOOD';

  // DISPLAY_SCORE_V2_PILOT: 50% pair synchrony + 50% heart-reaction strength.
  // Scientific raw metrics above remain unchanged and are stored separately.
  const anchors=CONFIG.displayScalePilot.anchors,w=CONFIG.displayScalePilot.weights;
  const directionDisplay=pilotDisplayScale(directionSession,anchors.direction);
  const temporalDisplay=pilotDisplayScale(temporalSession,anchors.temporal);
  const magnitudeDisplay=pilotDisplayScale(magnitudeSession,anchors.magnitude);
  const qResponseDisplay=pilotDisplayScale(qResponseSession,anchors.questionResponse);
  const displayReady=[directionDisplay,temporalDisplay,magnitudeDisplay,qResponseDisplay].every(Number.isFinite);
  const syncScore=displayReady?(w.direction*directionDisplay+w.temporal*temporalDisplay)/(w.direction+w.temporal):null;
  const reactionScore=displayReady?(w.magnitude*magnitudeDisplay+w.questionResponse*qResponseDisplay)/(w.magnitude+w.questionResponse):null;
  const score=(qualityLabel!=='INVALID'&&displayReady)?w.direction*directionDisplay+w.temporal*temporalDisplay+w.magnitude*magnitudeDisplay+w.questionResponse*qResponseDisplay:null;
  const radar={direction:directionDisplay,temporal:temporalDisplay,balance:balanceSession,magnitude:magnitudeDisplay,questionResponse:qResponseDisplay};
  const displayBreakdown={syncScore,reactionScore,direction:directionDisplay,temporal:temporalDisplay,magnitude:magnitudeDisplay,questionResponse:qResponseDisplay};
  return {cleanA:a,cleanB:b,perQuestion,quality:{coverageA,coverageB,maxContinuousGapSec,label:qualityLabel},session:{direction:directionSession,temporal:temporalSession,magnitude:magnitudeSession,balance:balanceSession,questionResponse:qResponseSession,neoScore:score,radar,displayBreakdown,quality:{coverageA,coverageB,maxContinuousGapSec,label:qualityLabel}}};
}

export {mean,median,pearson};
