import { CONFIG } from './config.js?v=0.4.0b4';

const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,n));
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const std=xs=>{if(xs.length<2)return 0;const m=mean(xs);return Math.sqrt(xs.reduce((s,x)=>s+(x-m)*(x-m),0)/xs.length);};
const quantile=(xs,q)=>{if(!xs.length)return null;const s=[...xs].sort((a,b)=>a-b);const p=(s.length-1)*q,i=Math.floor(p),f=p-i;return s[i+1]==null?s[i]:s[i]*(1-f)+s[i+1]*f;};
const safeRatio=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b>0?a/b:null;

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

export function inferConnectionType(label=''){
  const x=String(label||'').toLowerCase();
  if(/bluetooth|wireless|airpods|buds|freebuds|galaxy buds|wf-|wh-|bt\b/.test(x))return 'WIRELESS';
  if(/usb|headset|microphone|mic|イヤホン|ヘッドセット/.test(x))return 'WIRED_OR_USB';
  return 'UNKNOWN';
}

export function compareVoiceToBaseline(summary,baseline){
  if(!summary?.valid||!baseline?.valid)return {...summary,baselineValid:false,baselineReason:'MISSING_OR_INVALID_BASELINE'};
  const p=Number(summary.pitchMeanHz),bp=Number(baseline.pitchMeanHz),r=Number(summary.rmsMean),br=Number(baseline.rmsMean);
  const pitchDeltaHz=Number.isFinite(p)&&Number.isFinite(bp)?p-bp:null;
  const pitchDeltaPct=Number.isFinite(pitchDeltaHz)&&bp>0?100*pitchDeltaHz/bp:null;
  const pitchDeltaCents=Number.isFinite(p)&&p>0&&bp>0?1200*Math.log2(p/bp):null;
  const pitchDirection=Number.isFinite(pitchDeltaPct)?(Math.abs(pitchDeltaPct)<CONFIG.voice.pitchSameBandPct?'SAME':pitchDeltaPct>0?'UP':'DOWN'):'UNKNOWN';
  const rmsDeltaDb=Number.isFinite(r)&&r>0&&Number.isFinite(br)&&br>0?20*Math.log10(r/br):null;
  const pitchRangeDelta=Number.isFinite(summary.pitchRangeRatio)&&Number.isFinite(baseline.pitchRangeRatio)?summary.pitchRangeRatio-baseline.pitchRangeRatio:null;
  const rmsCvDelta=Number.isFinite(summary.rmsCv)&&Number.isFinite(baseline.rmsCv)?summary.rmsCv-baseline.rmsCv:null;
  // Reaction is based on within-person relative change, never on absolute pitch.
  const pitchResponseScore=Number.isFinite(pitchDeltaPct)?clamp(100*Math.abs(pitchDeltaPct)/CONFIG.voice.pitchRelativeHighPct):null;
  const expressivenessScore=(Number.isFinite(pitchRangeDelta)||Number.isFinite(rmsCvDelta))
    ? clamp(50*clamp(Math.abs(pitchRangeDelta||0)/CONFIG.voice.expressivenessPitchDeltaHigh,0,1)+50*clamp(Math.abs(rmsCvDelta||0)/CONFIG.voice.expressivenessRmsDeltaHigh,0,1))
    : null;
  const baselinePitchStd=Math.max(Number(baseline.pitchStdHz)||0, Number(bp||0)*0.02, 2);
  const pitchDeltaZ=Number.isFinite(pitchDeltaHz)?pitchDeltaHz/baselinePitchStd:null;
  return {...summary,baselineValid:true,baselinePitchMeanHz:bp,baselinePitchStdHz:baseline.pitchStdHz,baselineRmsMean:br,pitchDeltaHz,pitchDeltaPct,pitchDeltaCents,pitchDeltaZ,pitchDirection,rmsDeltaDb,pitchRangeDelta,rmsCvDelta,pitchResponseScore,expressivenessScore};
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
  const pitchVariabilityScore=clamp(100*pitchCv/CONFIG.voice.pitchCvHigh);
  const expressivenessRawScore=clamp(50*clamp(pitchRangeRatio/CONFIG.voice.pitchRangeRatioHigh,0,1)+50*clamp(rmsCv/CONFIG.voice.rmsCvHigh,0,1));
  return {
    valid:true,frameCount:usable.length,voicedFrameCount:pitch.length,pitchMeanHz:pMean,pitchStdHz:pStd,pitchP10Hz:p10,pitchP90Hz:p90,
    pitchCv,pitchRangeRatio,rmsMean:rMean,rmsStd:rStd,rmsCv,speechRatio:active.length/usable.length,pitchVariabilityScore,expressivenessRawScore,speechThreshold,
  };
}

function frameTime(f){
  if(Number.isFinite(Number(f?.phaseElapsedMs)))return Number(f.phaseElapsedMs);
  if(Number.isFinite(Number(f?.sessionElapsedMs)))return Number(f.sessionElapsedMs);
  return Number(f?.tOffsetMs||0);
}

/**
 * Classify each aligned slice as A / B / BOTH / UNKNOWN / SILENCE.
 * This intentionally allows UNKNOWN instead of forcing every sound into A/B.
 */
export function classifySpeakerTimeline(aFrames=[],bFrames=[],{
  thresholdA=CONFIG.voice.speechRmsThreshold,
  thresholdB=CONFIG.voice.speechRmsThreshold,
  stepMs=CONFIG.voice.savedFrameMs,
}={}){
  const toMap=frames=>{
    const m=new Map();
    for(const f of frames||[])m.set(Math.round(frameTime(f)/stepMs),f);
    return m;
  };
  const A=toMap(aFrames),B=toMap(bFrames);
  const keys=[...new Set([...A.keys(),...B.keys()])].sort((x,y)=>x-y);
  const out=[];
  for(const key of keys){
    const a=A.get(key),b=B.get(key);
    if(!a||!b){out.push({tMs:key*stepMs,speaker:'UNKNOWN',confidence:0,a:a||null,b:b||null});continue;}
    const aa=!!a.active||Number(a.rms)>=thresholdA,bb=!!b.active||Number(b.rms)>=thresholdB;
    if(!aa&&!bb){out.push({tMs:key*stepMs,speaker:'SILENCE',confidence:1,a,b});continue;}
    if(aa&&!bb){out.push({tMs:key*stepMs,speaker:'A',confidence:.95,a,b});continue;}
    if(!aa&&bb){out.push({tMs:key*stepMs,speaker:'B',confidence:.95,a,b});continue;}

    const an=safeRatio(Number(a.rms),Math.max(thresholdA,1e-6))||0;
    const bn=safeRatio(Number(b.rms),Math.max(thresholdB,1e-6))||0;
    const ratio=Math.max(an,bn)/Math.max(Math.min(an,bn),1e-6);
    const pa=Number(a.pitch),pb=Number(b.pitch);
    const pitchDiffPct=Number.isFinite(pa)&&Number.isFinite(pb)&&pa>0&&pb>0?Math.abs(pa-pb)/((pa+pb)/2):null;

    // Similar pitch on both microphones is often one speaker leaking into both channels.
    if(Number.isFinite(pitchDiffPct)&&pitchDiffPct<=CONFIG.voice.speakerSameVoicePitchPct){
      if(ratio>=CONFIG.voice.speakerLeakageDominanceRatio){
        const speaker=an>bn?'A':'B';
        out.push({tMs:key*stepMs,speaker,confidence:clamp((ratio-1)/(CONFIG.voice.speakerDominanceRatio-1),0.55,.95),a,b,pitchDiffPct,normalizedA:an,normalizedB:bn});
      }else{
        out.push({tMs:key*stepMs,speaker:'UNKNOWN',confidence:.35,a,b,pitchDiffPct,normalizedA:an,normalizedB:bn});
      }
      continue;
    }

    // With different simultaneous pitch estimates, treat close levels as BOTH.
    if(ratio>=CONFIG.voice.speakerDominanceRatio){
      const speaker=an>bn?'A':'B';
      out.push({tMs:key*stepMs,speaker,confidence:.8,a,b,pitchDiffPct,normalizedA:an,normalizedB:bn});
    }else{
      out.push({tMs:key*stepMs,speaker:'BOTH',confidence:.75,a,b,pitchDiffPct,normalizedA:an,normalizedB:bn});
    }
  }
  return out;
}

export function summarizeSpeakerTimeline(timeline=[]){
  const counts={A:0,B:0,BOTH:0,UNKNOWN:0,SILENCE:0};
  for(const x of timeline)counts[x.speaker]=(counts[x.speaker]||0)+1;
  const total=timeline.length||1;
  const active=counts.A+counts.B+counts.BOTH;
  const knownConversation=active||1;
  const aShare=(counts.A+counts.BOTH*.5)/knownConversation;
  const bShare=(counts.B+counts.BOTH*.5)/knownConversation;
  return {counts,total,activeFrames:active,aShare,bShare,overlapRatio:counts.BOTH/knownConversation,unknownRatio:counts.UNKNOWN/total,silenceRatio:counts.SILENCE/total};
}

export function computeTurnTakingScore(aFrames=[],bFrames=[],options={}){
  const tl=classifySpeakerTimeline(aFrames,bFrames,options);
  const stats=summarizeSpeakerTimeline(tl);
  let last=null,turns=0;
  for(const x of tl){
    if(x.speaker==='A'||x.speaker==='B'){
      if(last&&last!==x.speaker)turns++;
      last=x.speaker;
    }
  }
  if(stats.activeFrames<5)return {valid:false,score:null,turns,overlapRatio:null,unknownRatio:stats.unknownRatio,reason:'LOW_SPEECH_ACTIVITY',timeline:tl,stats};
  const turnBase=clamp(100*turns/CONFIG.voice.turnsForFullScore);
  const overlapPenalty=clamp(1-stats.overlapRatio/CONFIG.voice.overlapPenaltyAt,0.35,1);
  const unknownPenalty=clamp(1-stats.unknownRatio/CONFIG.voice.speakerUnknownPenaltyAt,0.50,1);
  return {valid:true,score:turnBase*overlapPenalty*unknownPenalty,turns,overlapRatio:stats.overlapRatio,unknownRatio:stats.unknownRatio,timeline:tl,stats};
}

export function computeSpeechBalanceScore(aSpeechRatio,bSpeechRatio){
  if(!Number.isFinite(aSpeechRatio)||!Number.isFinite(bSpeechRatio))return {valid:false,score:null,reason:'MISSING_SPEECH_RATIO'};
  const sum=aSpeechRatio+bSpeechRatio;
  if(sum<0.05)return {valid:false,score:null,reason:'LOW_SPEECH_ACTIVITY'};
  return {valid:true,score:clamp(100*(1-Math.abs(aSpeechRatio-bSpeechRatio)/sum))};
}

export function computeSpeechBalanceFromTimeline(timeline=[]){
  const stats=summarizeSpeakerTimeline(timeline);
  if(stats.activeFrames<5)return {valid:false,score:null,reason:'LOW_SPEECH_ACTIVITY',stats};
  return {valid:true,score:clamp(100*(1-Math.abs(stats.aShare-stats.bShare))),stats};
}

export function computeVoiceSessionMetrics(recordsA=[],recordsB=[]){
  const byQ=rows=>new Map((rows||[]).map(x=>[Number(x.questionIndex),x]));
  const A=byQ(recordsA),B=byQ(recordsB),keys=[...new Set([...A.keys(),...B.keys()])].sort((a,b)=>a-b);
  const questions=[];
  for(const q of keys){
    const a=A.get(q),b=B.get(q);
    if(!a||!b)continue;
    const thresholdA=Number(a.summary?.speechThreshold)||CONFIG.voice.speechRmsThreshold;
    const thresholdB=Number(b.summary?.speechThreshold)||CONFIG.voice.speechRmsThreshold;
    const timeline=classifySpeakerTimeline(a.frames||[],b.frames||[],{thresholdA,thresholdB});
    const bal=computeSpeechBalanceFromTimeline(timeline);
    const tt=computeTurnTakingScore(a.frames||[],b.frames||[],{thresholdA,thresholdB});
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
      unknownRatio:tt.unknownRatio,
      speakerCounts:tt.stats?.counts||null,
      speakerShares:tt.stats?{A:tt.stats.aShare,B:tt.stats.bShare}:null,
    });
  }
  const med=key=>{const xs=questions.map(x=>x[key]).filter(Number.isFinite).sort((a,b)=>a-b);if(!xs.length)return null;const m=Math.floor(xs.length/2);return xs.length%2?xs[m]:(xs[m-1]+xs[m])/2;};
  const pitchResponse=med('pitchResponse'),expressiveness=med('expressiveness'),speechBalance=med('speechBalance'),turnTaking=med('turnTaking');
  const available=[pitchResponse,expressiveness,speechBalance,turnTaking].filter(Number.isFinite);
  const voiceScore=available.length?mean(available):null;
  return {valid:available.length>=2,voiceScore,pitchResponse,expressiveness,speechBalance,turnTaking,questions,availableMetricCount:available.length};
}

export async function listAudioInputDevices(){
  if(!navigator.mediaDevices?.enumerateDevices)return [];
  const devices=await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d=>d.kind==='audioinput').map((d,i)=>({deviceId:d.deviceId,label:d.label||`マイク ${i+1}`,groupId:d.groupId||null}));
}

export class VoiceCapture{
  constructor({onStatus}={}){this.onStatus=onStatus;this.stream=null;this.ctx=null;this.analyser=null;this.buffer=null;this.recorder=null;this.chunks=[];this.frames=[];this.timer=null;this.speechThreshold=CONFIG.voice.speechRmsThreshold;this.activeMeta=null;this.baselineSummary=null;this.deviceMeta=null;}
  static supported(){return !!(navigator.mediaDevices?.getUserMedia&&window.AudioContext&&window.MediaRecorder);}
  async connect({connectionType='UNKNOWN',deviceId=null}={}){
    if(!VoiceCapture.supported())throw new Error('このブラウザではマイク解析を利用できません。');
    this.onStatus?.({state:'REQUESTING'});
    const audioConstraints={echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1};if(deviceId)audioConstraints.deviceId={exact:deviceId};
    this.stream=await navigator.mediaDevices.getUserMedia({audio:audioConstraints,video:false});
    const track=this.stream.getAudioTracks()[0];const settings=track?.getSettings?.()||{};const label=track?.label||'Unknown microphone';
    this.ctx=new AudioContext();
    const reportedLatencyMs=Number.isFinite(Number(settings.latency))?Number(settings.latency)*1000:null;
    const baseLatencyMs=Number.isFinite(Number(this.ctx.baseLatency))?Number(this.ctx.baseLatency)*1000:null;
    const latencyCorrectionMs=Number.isFinite(reportedLatencyMs)&&reportedLatencyMs>=0&&reportedLatencyMs<=CONFIG.voice.latencyCorrectionMaxMs?reportedLatencyMs:0;
    this.deviceMeta={label,connectionType:connectionType==='UNKNOWN'?inferConnectionType(label):connectionType,detectedConnectionType:inferConnectionType(label),sampleRate:settings.sampleRate||null,channelCount:settings.channelCount||null,echoCancellation:settings.echoCancellation??false,noiseSuppression:settings.noiseSuppression??false,autoGainControl:settings.autoGainControl??false,reportedInputLatencyMs:reportedLatencyMs,audioContextBaseLatencyMs:baseLatencyMs,latencyCorrectionMs};
    const src=this.ctx.createMediaStreamSource(this.stream);this.analyser=this.ctx.createAnalyser();this.analyser.fftSize=CONFIG.voice.fftSize;src.connect(this.analyser);this.buffer=new Float32Array(this.analyser.fftSize);
    this.onStatus?.({state:'CALIBRATING'});
    const ambient=[];
    for(let i=0;i<10;i++){await new Promise(r=>setTimeout(r,100));ambient.push(this.sampleFrame().rms);}
    const ambientMean=ambient.reduce((a,b)=>a+b,0)/(ambient.length||1);
    this.speechThreshold=Math.max(CONFIG.voice.speechRmsThreshold,ambientMean*CONFIG.voice.ambientMultiplier);
    this.onStatus?.({state:'READY',speechThreshold:this.speechThreshold});
    return {speechThreshold:this.speechThreshold,ambientRms:ambientMean,deviceMeta:this.deviceMeta};
  }
  sampleFrame(){
    this.analyser.getFloatTimeDomainData(this.buffer);let sum=0;for(const x of this.buffer)sum+=x*x;const rms=Math.sqrt(sum/this.buffer.length);
    const pitch=rms>=this.speechThreshold?estimatePitchAutocorrelation(this.buffer,this.ctx.sampleRate,{minHz:CONFIG.voice.pitchMinHz,maxHz:CONFIG.voice.pitchMaxHz}):null;
    return {rms,pitch};
  }
  async captureBaseline(durationMs=CONFIG.voice.baselineDurationMs){
    if(!this.stream||!this.analyser)throw new Error('先にマイクを準備してください。');
    if(this.recorder?.state==='recording'||this.activeMeta)throw new Error('質問録音中は基準声を測定できません。');
    const frames=[];const start=performance.now();let lastStatus=-1;
    this.onStatus?.({state:'BASELINE_RECORDING',remainingMs:durationMs});
    while(performance.now()-start<durationMs){
      await new Promise(r=>setTimeout(r,CONFIG.voice.frameMs));
      const f=this.sampleFrame();const t=performance.now()-start;frames.push({tOffsetMs:Math.round(t),rms:f.rms,pitch:f.pitch,active:f.rms>=this.speechThreshold});
      const sec=Math.ceil((durationMs-t)/1000);if(sec!==lastStatus){lastStatus=sec;this.onStatus?.({state:'BASELINE_RECORDING',remainingMs:Math.max(0,durationMs-t)});}
    }
    const summary=summarizeVoiceFrames(frames,{speechThreshold:this.speechThreshold});
    const valid=!!summary.valid&&Number(summary.speechRatio)>=CONFIG.voice.baselineMinSpeechRatio&&Number(summary.voicedFrameCount)>=CONFIG.voice.baselineMinVoicedFrames;
    const quality={valid,reason:valid?null:'BASELINE_SPEECH_TOO_SHORT',minSpeechRatio:CONFIG.voice.baselineMinSpeechRatio,minVoicedFrames:CONFIG.voice.baselineMinVoicedFrames};
    if(valid)this.baselineSummary=summary;
    const sampled=[];let last=-Infinity;for(const f of frames){if(f.tOffsetMs-last>=CONFIG.voice.savedFrameMs){sampled.push(f);last=f.tOffsetMs;}}
    this.onStatus?.({state:'READY',speechThreshold:this.speechThreshold});
    return {summary,frames:sampled,quality,durationMs,deviceMeta:this.deviceMeta};
  }
  setBaselineSummary(summary){this.baselineSummary=summary?.valid?summary:null;}

  startQuestion(meta){
    if(!this.stream||!this.analyser||this.recorder?.state==='recording')return false;
    this.activeMeta={...meta,startedPerf:performance.now()};this.frames=[];this.chunks=[];
    const preferred=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':'audio/webm';
    this.recorder=new MediaRecorder(this.stream,{mimeType:preferred,audioBitsPerSecond:64000});
    this.recorder.ondataavailable=e=>{if(e.data?.size)this.chunks.push(e.data);};
    this.recorder.start(500);
    this.timer=setInterval(()=>{
      if(!this.activeMeta)return;const f=this.sampleFrame();const localT=performance.now()-this.activeMeta.startedPerf;
      const latencyMs=Number(this.deviceMeta?.latencyCorrectionMs||0);
      const sessionElapsedMs=Number.isFinite(Number(this.activeMeta.sessionElapsedAtStartMs))?Number(this.activeMeta.sessionElapsedAtStartMs)+localT-latencyMs:null;
      const phaseElapsedMs=Number.isFinite(sessionElapsedMs)&&Number.isFinite(Number(this.activeMeta.phaseStartOffsetMs))?sessionElapsedMs-Number(this.activeMeta.phaseStartOffsetMs):localT-latencyMs;
      this.frames.push({tOffsetMs:Math.round(localT),sessionElapsedMs:Number.isFinite(sessionElapsedMs)?Math.round(sessionElapsedMs):null,phaseElapsedMs:Math.round(phaseElapsedMs),rms:f.rms,pitch:f.pitch,active:f.rms>=this.speechThreshold});
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
    for(const f of this.frames){const key=Number.isFinite(f.phaseElapsedMs)?f.phaseElapsedMs:f.tOffsetMs;if(key-last>=CONFIG.voice.savedFrameMs){sampled.push(f);last=key;}}
    const rawSummary=summarizeVoiceFrames(this.frames,{speechThreshold:this.speechThreshold});
    const summary=compareVoiceToBaseline(rawSummary,this.baselineSummary);
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
