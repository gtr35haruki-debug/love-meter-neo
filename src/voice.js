import { CONFIG } from './config.js?v=0.4.0b1';

const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,n));
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const std=xs=>{if(xs.length<2)return 0;const m=mean(xs);return Math.sqrt(xs.reduce((s,x)=>s+(x-m)*(x-m),0)/xs.length);};
const quantile=(xs,q)=>{if(!xs.length)return null;const s=[...xs].sort((a,b)=>a-b);const p=(s.length-1)*q,i=Math.floor(p),f=p-i;return s[i+1]==null?s[i]:s[i]*(1-f)+s[i+1]*f;};

export function estimatePitchAutocorrelation(buffer,sampleRate,{minHz=70,maxHz=350}={}){
  let rms=0;
  for(let i=0;i<buffer.length;i++)rms+=buffer[i]*buffer[i];
  rms=Math.sqrt(rms/buffer.length);
  if(rms<0.008)return null;
  const minLag=Math.max(2,Math.floor(sampleRate/maxHz));
  const maxLag=Math.min(buffer.length-2,Math.ceil(sampleRate/minHz));
  let bestLag=null,bestCorr=-Infinity;
  for(let lag=minLag;lag<=maxLag;lag++){
    let num=0,a2=0,b2=0;
    const limit=buffer.length-lag;
    for(let i=0;i<limit;i++){
      const a=buffer[i],b=buffer[i+lag];num+=a*b;a2+=a*a;b2+=b*b;
    }
    const corr=num/Math.sqrt((a2*b2)||1);
    if(corr>bestCorr){bestCorr=corr;bestLag=lag;}
  }
  if(bestLag==null||bestCorr<0.35)return null;
  return sampleRate/bestLag;
}

export function summarizeVoiceFrames(frames,{speechThreshold=CONFIG.voice.speechRmsThreshold}={}){
  const usable=(frames||[]).filter(f=>Number.isFinite(f?.rms));
  if(!usable.length)return {valid:false,reason:'NO_AUDIO_FRAMES'};
  const pitch=usable.map(f=>f.pitch).filter(Number.isFinite);
  const rms=usable.map(f=>f.rms);
  const active=usable.filter(f=>f.rms>=speechThreshold);
  const pMean=mean(pitch),pStd=std(pitch),p10=quantile(pitch,.1),p90=quantile(pitch,.9);
  const rMean=mean(rms),rStd=std(rms);
  const pitchCv=pMean?Math.abs(pStd/pMean):0;
  const pitchRangeRatio=(pMean&&Number.isFinite(p10)&&Number.isFinite(p90))?Math.max(0,(p90-p10)/pMean):0;
  const rmsCv=rMean?Math.abs(rStd/rMean):0;
  const pitchResponseScore=clamp(100*pitchCv/CONFIG.voice.pitchCvHigh);
  const expressivenessScore=clamp(50*clamp(pitchRangeRatio/CONFIG.voice.pitchRangeRatioHigh,0,1)+50*clamp(rmsCv/CONFIG.voice.rmsCvHigh,0,1));
  return {
    valid:true,
    frameCount:usable.length,
    voicedFrameCount:pitch.length,
    pitchMeanHz:pMean,
    pitchStdHz:pStd,
    pitchP10Hz:p10,
    pitchP90Hz:p90,
    pitchCv,
    pitchRangeRatio,
    rmsMean:rMean,
    rmsStd:rStd,
    rmsCv,
    speechRatio:active.length/usable.length,
    pitchResponseScore,
    expressivenessScore,
    speechThreshold,
  };
}

function dominantTimeline(aFrames=[],bFrames=[],stepMs=200){
  const toMap=frames=>new Map(frames.map(f=>[Math.round((f.tOffsetMs||0)/stepMs),f]));
  const A=toMap(aFrames),B=toMap(bFrames);
  const max=Math.max(0,...A.keys(),...B.keys());
  const out=[];
  for(let i=0;i<=max;i++){
    const a=A.get(i),b=B.get(i),aa=!!a?.active,bb=!!b?.active;
    let dom='NONE';
    if(aa&&!bb)dom='A';else if(bb&&!aa)dom='B';else if(aa&&bb){
      const ar=Number(a?.rms||0),br=Number(b?.rms||0);
      dom=ar>br*1.35?'A':br>ar*1.35?'B':'BOTH';
    }
    out.push({i,dom});
  }
  return out;
}

export function computeTurnTakingScore(aFrames=[],bFrames=[]){
  const tl=dominantTimeline(aFrames,bFrames,CONFIG.voice.savedFrameMs);
  let last=null,turns=0,both=0,active=0;
  for(const x of tl){
    if(x.dom==='BOTH'){both++;active++;continue;}
    if(x.dom==='A'||x.dom==='B'){
      active++;
      if(last&&last!==x.dom)turns++;
      last=x.dom;
    }
  }
  if(active<5)return {valid:false,score:null,turns,overlapRatio:null,reason:'LOW_SPEECH_ACTIVITY'};
  const overlapRatio=both/active;
  const turnBase=clamp(100*turns/CONFIG.voice.turnsForFullScore);
  const overlapPenalty=clamp(1-overlapRatio/CONFIG.voice.overlapPenaltyAt,0.35,1);
  return {valid:true,score:turnBase*overlapPenalty,turns,overlapRatio};
}

export function computeSpeechBalanceScore(aSpeechRatio,bSpeechRatio){
  if(!Number.isFinite(aSpeechRatio)||!Number.isFinite(bSpeechRatio))return {valid:false,score:null,reason:'MISSING_SPEECH_RATIO'};
  const sum=aSpeechRatio+bSpeechRatio;
  if(sum<0.05)return {valid:false,score:null,reason:'LOW_SPEECH_ACTIVITY'};
  return {valid:true,score:clamp(100*(1-Math.abs(aSpeechRatio-bSpeechRatio)/sum))};
}

export function computeVoiceSessionMetrics(recordsA=[],recordsB=[]){
  const byQ=rows=>new Map((rows||[]).map(x=>[Number(x.questionIndex),x]));
  const A=byQ(recordsA),B=byQ(recordsB),keys=[...new Set([...A.keys(),...B.keys()])].sort((a,b)=>a-b);
  const questions=[];
  for(const q of keys){
    const a=A.get(q),b=B.get(q);
    if(!a||!b)continue;
    const bal=computeSpeechBalanceScore(a.summary?.speechRatio,b.summary?.speechRatio);
    const tt=computeTurnTakingScore(a.frames||[],b.frames||[]);
    const pitchVals=[a.summary?.pitchResponseScore,b.summary?.pitchResponseScore].filter(Number.isFinite);
    const expVals=[a.summary?.expressivenessScore,b.summary?.expressivenessScore].filter(Number.isFinite);
    questions.push({
      questionIndex:q,
      pitchResponse:pitchVals.length?mean(pitchVals):null,
      expressiveness:expVals.length?mean(expVals):null,
      speechBalance:bal.score,
      turnTaking:tt.score,
      turnCount:tt.turns,
      overlapRatio:tt.overlapRatio,
    });
  }
  const med=key=>{const xs=questions.map(x=>x[key]).filter(Number.isFinite).sort((a,b)=>a-b);if(!xs.length)return null;const m=Math.floor(xs.length/2);return xs.length%2?xs[m]:(xs[m-1]+xs[m])/2;};
  const pitchResponse=med('pitchResponse'),expressiveness=med('expressiveness'),speechBalance=med('speechBalance'),turnTaking=med('turnTaking');
  const available=[pitchResponse,expressiveness,speechBalance,turnTaking].filter(Number.isFinite);
  const voiceScore=available.length?mean(available):null;
  return {valid:available.length>=2,voiceScore,pitchResponse,expressiveness,speechBalance,turnTaking,questions,availableMetricCount:available.length};
}

export class VoiceCapture{
  constructor({onStatus}={}){this.onStatus=onStatus;this.stream=null;this.ctx=null;this.analyser=null;this.buffer=null;this.recorder=null;this.chunks=[];this.frames=[];this.timer=null;this.speechThreshold=CONFIG.voice.speechRmsThreshold;this.activeMeta=null;}
  static supported(){return !!(navigator.mediaDevices?.getUserMedia&&window.AudioContext&&window.MediaRecorder);}
  async connect(){
    if(!VoiceCapture.supported())throw new Error('このブラウザではマイク解析を利用できません。');
    this.onStatus?.({state:'REQUESTING'});
    this.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1},video:false});
    this.ctx=new AudioContext();
    const src=this.ctx.createMediaStreamSource(this.stream);this.analyser=this.ctx.createAnalyser();this.analyser.fftSize=CONFIG.voice.fftSize;src.connect(this.analyser);this.buffer=new Float32Array(this.analyser.fftSize);
    this.onStatus?.({state:'CALIBRATING'});
    const ambient=[];
    for(let i=0;i<10;i++){await new Promise(r=>setTimeout(r,100));ambient.push(this.sampleFrame().rms);}
    const ambientMean=ambient.reduce((a,b)=>a+b,0)/(ambient.length||1);
    this.speechThreshold=Math.max(CONFIG.voice.speechRmsThreshold,ambientMean*CONFIG.voice.ambientMultiplier);
    this.onStatus?.({state:'READY',speechThreshold:this.speechThreshold});
    return {speechThreshold:this.speechThreshold,ambientRms:ambientMean};
  }
  sampleFrame(){
    this.analyser.getFloatTimeDomainData(this.buffer);let sum=0;for(const x of this.buffer)sum+=x*x;const rms=Math.sqrt(sum/this.buffer.length);
    const pitch=rms>=this.speechThreshold?estimatePitchAutocorrelation(this.buffer,this.ctx.sampleRate,{minHz:CONFIG.voice.pitchMinHz,maxHz:CONFIG.voice.pitchMaxHz}):null;
    return {rms,pitch};
  }
  startQuestion(meta){
    if(!this.stream||!this.analyser||this.recorder?.state==='recording')return false;
    this.activeMeta={...meta,startedPerf:performance.now()};this.frames=[];this.chunks=[];
    const preferred=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':'audio/webm';
    this.recorder=new MediaRecorder(this.stream,{mimeType:preferred,audioBitsPerSecond:64000});
    this.recorder.ondataavailable=e=>{if(e.data?.size)this.chunks.push(e.data);};
    this.recorder.start(500);
    this.timer=setInterval(()=>{
      if(!this.activeMeta)return;const f=this.sampleFrame();const t=performance.now()-this.activeMeta.startedPerf;
      this.frames.push({tOffsetMs:Math.round(t),rms:f.rms,pitch:f.pitch,active:f.rms>=this.speechThreshold});
    },CONFIG.voice.frameMs);
    this.onStatus?.({state:'RECORDING',questionIndex:meta.questionIndex});return true;
  }
  async stopQuestion(){
    if(!this.activeMeta)return null;
    clearInterval(this.timer);this.timer=null;
    const recorder=this.recorder;
    if(recorder?.state==='recording')await new Promise(resolve=>{recorder.addEventListener('stop',resolve,{once:true});recorder.stop();});
    const meta=this.activeMeta;this.activeMeta=null;this.recorder=null;
    const sampled=[];let last=-Infinity;
    for(const f of this.frames){if(f.tOffsetMs-last>=CONFIG.voice.savedFrameMs){sampled.push(f);last=f.tOffsetMs;}}
    const summary=summarizeVoiceFrames(this.frames,{speechThreshold:this.speechThreshold});
    const blob=new Blob(this.chunks,{type:this.chunks[0]?.type||'audio/webm'});this.chunks=[];this.frames=[];
    this.onStatus?.({state:'READY',speechThreshold:this.speechThreshold});
    return {meta,summary,frames:sampled,blob,mimeType:blob.type||'audio/webm'};
  }
  async disconnect(){
    try{await this.stopQuestion();}catch{}
    try{this.stream?.getTracks()?.forEach(t=>t.stop());}catch{}
    try{await this.ctx?.close();}catch{}
    this.stream=null;this.ctx=null;this.analyser=null;this.onStatus?.({state:'DISCONNECTED'});
  }
}
