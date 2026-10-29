/** LOVE METER NEO / EXPORT_V1 — research archive generation.
 * This module has no Firebase dependency; it builds one standards-compliant ZIP32 file
 * from already loaded per-session records. Never use this ZIP as proof of consent to share.
 */
import { preprocess } from './metrics.js?v=0.4.0b1';
import { APP_VERSION } from './config.js?v=0.4.0b1';

export const EXPORT_VERSION='EXPORT_V1';
const enc=new TextEncoder();
const BLOCKED_KEY=/^(?:joincode|records(?:pin|pinhash)|pin|password|secret|apikey|auth(?:orization)?|access_?token|refresh_?token|uid|actoruid|createdbyuid|deviceid|devicepresence|sessionmembers|identityvault|name|fullname|email|phone|telephone|address|contact|ipaddress|localip|macaddress)$/i;
const BLOCKED_CONTAINS=/(?:email|password|secret|token|phone|telephone|address|identityvault|realname|fullname|contactinfo|pinhash|participantname|sensorname|username|displayname|firstname|lastname)/i;

/** Preserve research participant IDs and all numeric scientific fields, drop secrets and direct identifiers. */
export function redact(value,{freeText=false}={}){
  if(Array.isArray(value))return value.map(v=>redact(v,{freeText}));
  if(value&&typeof value==='object'){
    const result={};
    for(const [key,v] of Object.entries(value)){
      if(BLOCKED_KEY.test(key)||BLOCKED_CONTAINS.test(key))continue;
      if(!freeText&&/^(?:freetext|relationshipother|notes?|comment|comments|memo|transcript|summary|evidence)$/i.test(key))continue;
      result[key]=redact(v,{freeText});
    }
    return result;
  }
  return value;
}
const csvCell=v=>{
  let s=String(v??'');
  // Keep CSV inert when opened in Excel/Sheets, including tab- and CR-prefixed formula strings.
  if(/^[\s\uFEFF]*[=+@-]/.test(s)&&typeof v==='string')s="'"+s;
  return /[",\r\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;
};
export function csv(rows){return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';}
const json=x=>JSON.stringify(x,null,2)+'\n';
const safeSlug=s=>String(s||'measurement').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,105)||'measurement';
const rowFromSample=(s,side,x)=>[
  s.displayId||s.sessionId,side,side==='A'?s.participantAId:s.participantBId,
  x.sampleId,x.sequence,x.bpm,x.timestampMs,x.localReceiveTimeMs,x.sessionElapsedMs,x.phase,x.phaseElapsedMs,x.setIndex,x.questionIndex,x.syncOffsetMs,x.appVersion,
];
export const RAW_HEADER=['display_id','side','participant_id','sample_id','sequence','bpm','timestamp_ms','local_receive_time_ms','session_elapsed_ms','phase','phase_elapsed_ms','set_index','question_index','sync_offset_ms','app_version'];
const GRID_HEADER=['display_id','side','elapsed_ms','bpm','clean_bpm','delta_hr_3','phase','set_index','question_index','source_elapsed_ms','source_offset_ms'];
const Q_HEADER=['display_id','q','set_id','question','skipped','skip_reason','direction','temporal_r','best_lag_sec','magnitude','balance','q_response','direction_reason','temporal_reason','balance_reason'];
const LOG_HEADER=['display_id','time_ms','event_type','role','details_json'];
const SUMMARY_HEADER=['display_id','session_uuid','created_at_iso','protocol','participant_a','participant_b','relation_category','set_order','status','quality','coverage_a','coverage_b','max_gap_sec','direction','temporal_r','magnitude','balance','question_response','neo_score','display_score_version','app_version','raw_a_count','raw_b_count'];

export function buildExportFiles(bundles,{includeSurveys=true,includeFreeText=false,exportedAt=new Date().toISOString()}={}){
  if(!bundles.length)throw new Error('書き出すセッションが選ばれていません。');
  const files=[],dataset=[],summary=[SUMMARY_HEADER],manifest=[];
  const sorted=[...bundles].sort((a,b)=>(a.session.createdAt||0)-(b.session.createdAt||0));
  for(const bundle of sorted){
    const s=redact(bundle.session,{freeText:includeFreeText});
    const id=s.displayId||s.sessionId;
    if(!id||!s.sessionId)throw new Error('セッションIDのないデータは書き出せません。');
    const a=redact(bundle.rawA||[]),b=redact(bundle.rawB||[]);
    const logs=redact(bundle.auditLogs||[],{freeText:includeFreeText});
    const surveys=includeSurveys?redact(bundle.surveys||{},{freeText:includeFreeText}):null;
    const voiceA=redact(bundle.voiceA||[],{freeText:includeFreeText});
    const voiceB=redact(bundle.voiceB||[],{freeText:includeFreeText});
    const aiTalk=redact(bundle.aiTalk||[],{freeText:includeFreeText});
    const qa=(s.questionMetrics||[]);
    const gridA=preprocess(a).filter(x=>x.elapsedMs>=0),gridB=preprocess(b).filter(x=>x.elapsedMs>=0);
    const directory=`sessions/${safeSlug(id)}_${safeSlug(s.sessionId)}/`;
    const quality=s.quality||s.metrics?.quality||{};
    const warnings=[];
    if(!a.length||!b.length)warnings.push('AまたはBのRAW心拍が0件です。計測未開始・中止または未同期の可能性を確認してください。');
    const expectedSeconds=Number(s.timeline?.at(-1)?.endOffsetMs||0)/1000;
    if(expectedSeconds>0&&s.status==='COMPLETE'){
      for(const [side,arr] of [['A',a],['B',b]]){
        if(arr.length>0&&arr.length<expectedSeconds*0.8)warnings.push(`${side}側のRAWが実験時間に対して少なめです（${arr.length}件 / 約${expectedSeconds}秒）。欠測・未同期を確認してください。`);
      }
    }
    if(s.status!=='COMPLETE')warnings.push(`完了していないセッションです（${s.status||'不明'}）。`);
    if(surveys&&s.protocolId==='RESEARCH_V1')for(const side of ['A','B'])for(const stage of ['pre','post'])if(!surveys?.[side]?.[stage])warnings.push(`${side}側の${stage}アンケートがありません。`);
    const entry={session:s,heartRateRaw:{A:a,B:b},heartRate1Hz:{A:gridA,B:gridB},voiceFeatures:{A:voiceA,B:voiceB},aiTalkAnalysis:aiTalk,auditLogs:logs,...(includeSurveys?{questionnaires:surveys}:{})};
    dataset.push(entry);
    manifest.push({sessionId:s.sessionId,displayId:id,protocolId:s.protocolId,status:s.status,rawCountA:a.length,rawCountB:b.length,oneHzCountA:gridA.length,oneHzCountB:gridB.length,voiceCountA:voiceA.length,voiceCountB:voiceB.length,aiTalkCount:aiTalk.length,auditCount:logs.length,hasQuestionnaires:!!includeSurveys,warnings});
    files.push([directory+'session.json',json(s)]);
    files.push([directory+'metrics.json',json(s.metrics??null)]);
    files.push([directory+'display_result.json',json(s.displayResult??null)]);
    files.push([directory+'quality.json',json(quality)]);
    files.push([directory+'questions.json',json({questionBankVersion:s.questionBankVersion,setOrder:s.setOrder,questionCategory:s.questionCategory,timeline:s.timeline||[],skippedQuestions:s.skippedQuestions||{}})]);
    files.push([directory+'question_metrics.json',json(qa)]);
    files.push([directory+'voice_features_A.json',json(voiceA)]);
    files.push([directory+'voice_features_B.json',json(voiceB)]);
    files.push([directory+'ai_talk_analysis.json',json(aiTalk)]);
    files.push([directory+'heart_rate_raw_A.json',json(a)]);
    files.push([directory+'heart_rate_raw_B.json',json(b)]);
    for(const [side,arr] of [['A',a],['B',b]])files.push([directory+`heart_rate_raw_${side}.csv`,csv([RAW_HEADER,...arr.map(x=>rowFromSample(s,side,x))])]);
    files.push([directory+'heart_rate_1hz.csv',csv([GRID_HEADER,...[['A',gridA],['B',gridB]].flatMap(([side,arr])=>arr.map(x=>[id,side,x.elapsedMs,x.bpm,x.cleanBpm,x.deltaHr3,x.phase,x.setIndex,x.questionIndex,x.sourceElapsedMs,x.sourceOffsetMs]))])]);
    files.push([directory+'question_metrics.csv',csv([Q_HEADER,...qa.map((x,i)=>[id,i+1,x.question?.setId,x.question?.questionText,!!x.skipped,x.skipReason,x.direction?.directionSync,x.temporal?.rMax,x.temporal?.bestLag,x.pairMagnitude,x.balance?.balance,x.pairQResponse,x.direction?.reason,x.temporal?.reason,x.balance?.reason])])]);
    files.push([directory+'events.json',json(logs)]);
    files.push([directory+'events.csv',csv([LOG_HEADER,...logs.map(x=>[id,x.timestamp,x.eventType,x.actorRole,JSON.stringify(x.details||{})])])]);
    if(includeSurveys)files.push([directory+'questionnaires.json',json(surveys)]);
    summary.push([id,s.sessionId,new Date(s.createdAt||0).toISOString(),s.protocolId,s.participantAId,s.participantBId,s.questionCategory,s.setOrder,s.status,quality.label,quality.coverageA,quality.coverageB,quality.maxContinuousGapSec,s.metrics?.direction,s.metrics?.temporal,s.metrics?.magnitude,s.metrics?.balance,s.metrics?.questionResponse,s.displayResult?.neoScore??s.metrics?.neoScore,s.displayScoreVersion,s.appVersion,a.length,b.length]);
  }
  const meta={exportVersion:EXPORT_VERSION,exportedAt,sessionCount:dataset.length,appVersionUsedForExport:APP_VERSION,included:{raw:true,oneHz:true,voiceFeatures:true,aiTalkAnalysis:true,session:true,metrics:true,questionMetrics:true,audit:true,surveys:includeSurveys,freeText:includeSurveys&&includeFreeText},manifest};
  files.unshift(['export_manifest.json',json(meta)],['session_list.csv',csv(summary)],['all_sessions.json',json({...meta,sessions:dataset})]);
  const notice=[
    `LOVE METER NEO — ${EXPORT_VERSION}`,
    `Exported at (ISO): ${exportedAt}`,
    `Sessions: ${dataset.length}`,
    'This single ZIP is a snapshot of multiple experiments. It does NOT change the original database.',
    'all_sessions.json: every selected session, both original RAW streams, derived 1 Hz streams, voice features, AI talk analysis, metrics, quality, events, and optionally research questionnaires.',
    'session_list.csv: summary; sessions/: separate files for spreadsheet and programmatic analysis.',
    'Original timestamps and participant research IDs are preserved; authentication data, device IDs, names/contact keys are omitted.',
    'Research IDs remain pseudonymous and can be linked across sessions. Treat this archive as private research material.',
    includeSurveys?'Individual questionnaire answers are included. Do not disclose them to the other participant or without permission.':'Individual questionnaire answers are not included.',
    includeFreeText?'Free-text / other-relationship entries are included; REVIEW FOR IDENTIFIERS BEFORE SHARING.':'Free-text / other-relationship entries are excluded.',
    'Raw data are NEVER replaced by filtered/smoothed 1 Hz data. The 1 Hz files are derived snapshots using the export app preprocessing version.',
    'Old scores/metrics retain their stored calculation/display versions; exporting does not recalculate or overwrite stored results.',
    'A browser cannot confirm unsent RAW samples stored on another sensor PC. Before exporting, reconnect all operator PCs and verify Firebase upload.',
    'A CAUTION / INVALID quality label, missing samples, and skipped questions must remain visible and should not be treated as zero reactions.',
    '', 'CHECK BEFORE SHARING:',
    ...manifest.flatMap(m=>m.warnings.map(w=>`${m.displayId}: ${w}`)),
  ];
  files.unshift(['README.txt',notice.join('\r\n')+'\r\n']);
  return {files,manifest:meta,filename:`LOVE_METER_NEO_DATASET_${exportedAt.slice(0,10)}_${dataset.length}sessions.zip`};
}

// ZIP32, STORE method; no external CDN dependency, works in static GitHub Pages and offline local prototype.
// UTF-8 flag + CRC32 for interoperability with Windows Explorer, Python, unzip.
const CRC_TABLE=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let n=0;n<8;n++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=CRC_TABLE[(c^b)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
const w16=(v,p,n)=>{v.setUint16(p,n,true);};const w32=(v,p,n)=>{v.setUint32(p,n,true);};
export function zipFile(files,{date=new Date()}={}){
  if(!files.length)throw new Error('ZIPに出力するファイルがありません。');
  const chunks=[],directory=[];let offset=0;
  const year=Math.max(1980,date.getFullYear());const t=((date.getHours()&31)<<11)|((date.getMinutes()&63)<<5)|((Math.floor(date.getSeconds()/2))&31);
  const d=(((year-1980)&127)<<9)|(((date.getMonth()+1)&15)<<5)|(date.getDate()&31);
  const MAX=0xffffffff;
  for(const [name,content] of files){
    if(name.startsWith('/')||name.includes('..')||name.includes('\\'))throw new Error('無効なZIPファイル名です。');
    const nameBytes=enc.encode(name),data=typeof content==='string'?enc.encode(content):content;
    if(nameBytes.length>65535||data.length>MAX||offset+30+nameBytes.length+data.length>MAX)throw new Error('ZIP32の容量上限を超えました。選択するセッション数を減らしてください。');
    const checksum=crc32(data);const local=new Uint8Array(30+nameBytes.length);const view=new DataView(local.buffer);
    w32(view,0,0x04034b50);w16(view,4,20);w16(view,6,0x0800);w16(view,8,0);w16(view,10,t);w16(view,12,d);
    w32(view,14,checksum);w32(view,18,data.length);w32(view,22,data.length);w16(view,26,nameBytes.length);w16(view,28,0);local.set(nameBytes,30);
    chunks.push(local,data);directory.push({nameBytes,checksum,length:data.length,offset});offset+=local.length+data.length;
  }
  const centerStart=offset;
  for(const x of directory){const rec=new Uint8Array(46+x.nameBytes.length),v=new DataView(rec.buffer);
    w32(v,0,0x02014b50);w16(v,4,20);w16(v,6,20);w16(v,8,0x0800);w16(v,10,0);w16(v,12,t);w16(v,14,d);
    w32(v,16,x.checksum);w32(v,20,x.length);w32(v,24,x.length);w16(v,28,x.nameBytes.length);w16(v,30,0);w16(v,32,0);w16(v,34,0);w16(v,36,0);w32(v,38,0);w32(v,42,x.offset);rec.set(x.nameBytes,46);
    chunks.push(rec);offset+=rec.length;
  }
  if(directory.length>65535||offset>MAX)throw new Error('ZIP32の容量上限を超えました。選択するセッション数を減らしてください。');
  const tail=new Uint8Array(22),end=new DataView(tail.buffer);w32(end,0,0x06054b50);w16(end,4,0);w16(end,6,0);
  w16(end,8,directory.length);w16(end,10,directory.length);w32(end,12,offset-centerStart);w32(end,16,centerStart);w16(end,20,0);
  chunks.push(tail);return new Blob(chunks,{type:'application/zip'});
}
