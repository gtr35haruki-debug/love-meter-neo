import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {redact,buildExportFiles,zipFile} from '../src/research-export.js';
const make=(id)=>({
  session:{sessionId:`uuid-${id}`,displayId:id,createdAt:Date.UTC(2026,7,24),protocolId:'RESEARCH_V1',
    status:'COMPLETE',appVersion:'0.3.2',participantAId:'P-0001',participantBId:'P-0002',joinCode:'111111',
    createdByUid:'secret-auth-id',devicePresence:{secret:true},participantName:'private',
    quality:{label:'GOOD',coverageA:1,coverageB:1},metrics:{direction:43.2,temporal:0.29,questionResponse:1.3},
    displayResult:{neoScore:68.2},questionMetrics:[{question:{questionText:'すきなたべものは？',setId:'A'},direction:{directionSync:45}}],
    timeline:[{phase:'QUESTION',questionText:'すきなたべものは？'}],skippedQuestions:{}},
  rawA:[{sampleId:`A${id}`,sessionId:`uuid-${id}`,side:'A',bpm:74,sessionElapsedMs:0,timestampMs:111111111,sequence:0,deviceId:'BLEsecret'},
        {sampleId:`A2${id}`,side:'A',bpm:75,sessionElapsedMs:1000,timestampMs:111112111,sequence:1}],
  rawB:[{sampleId:`B${id}`,side:'B',bpm:86,sessionElapsedMs:0,timestampMs:111111111,sequence:0}],
  surveys:{A:{pre:{data:{R1:83,O1:null,freeText:'real name named private',relationshipOther:'hidden'}}},B:{post:{data:{P1:25}}}},
  auditLogs:[{eventType:'PAUSED',timestamp:111111,actorUid:'firebase-uid-987',actorRole:'SENSOR_A',details:{deviceId:'secret',reason:'MANUAL'}}]
});
const one=make('LM-20260824-001'),two=make('LM-20260824-002');
const out=buildExportFiles([one,two],{includeSurveys:true,exportedAt:'2026-09-24T00:00:00Z'});
assert.equal(out.manifest.sessionCount,2);
assert.match(out.filename,/2sessions\.zip$/);
const fileMap=Object.fromEntries(out.files);
assert.match(fileMap['session_list.csv'],/P-0001/);
assert.match(fileMap['session_list.csv'],/68\.2/);
const json=JSON.parse(fileMap['all_sessions.json']);
assert.equal(json.sessions.length,2);
assert.equal(json.sessions[0].heartRateRaw.A.length,2);
assert.equal(json.sessions[0].questionnaires.A.pre.data.R1,83);
assert.ok(json.sessions[0].heartRate1Hz.A.length>=2);
assert.doesNotMatch(fileMap['all_sessions.json'],/secret-auth-id|"joinCode"|BLEsecret|firebase-uid-987|real name named private|participantName|joinCode/);
assert.equal(redact({joinCode:'999999',score:0,participantAId:'P-99'}).score,0);
const csv=Object.values(fileMap).find(x=>typeof x==='string'&&x.includes('raw_a_count'));
assert.ok(csv);
const blob=zipFile(out.files,{date:new Date('2026-09-24T12:00:00Z')});
const bytes=Buffer.from(await blob.arrayBuffer());
const tmp='/mnt/data/lmneo_test_export_v034.zip';writeFileSync(tmp,bytes);
execFileSync('unzip',['-t',tmp],{stdio:'pipe'});
const central=execFileSync('unzip',['-Z1',tmp],{encoding:'utf8'});
assert.match(central,/all_sessions\.json/);assert.match(central,/heart_rate_raw_A\.json/);
const noSurveys=buildExportFiles([one],{includeSurveys:false});
assert.doesNotMatch(Object.keys(Object.fromEntries(noSurveys.files)).join(' '),/questionnaires\.json/);
assert.ok(!JSON.stringify(noSurveys.files).includes('real name named private'));
assert.throws(()=>zipFile([['../evil','oops']]),/無効/);
console.log('EXPORT_V1 tests passed: 2 sessions, raw counts, privacy, metrics, UTF-8 ZIP CRC validation');
