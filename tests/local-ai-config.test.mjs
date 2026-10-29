import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const configText=fs.readFileSync(path.join(root,'src/config.js'),'utf8');
const aiText=fs.readFileSync(path.join(root,'src/ai.js'),'utf8');
const firebase=JSON.parse(fs.readFileSync(path.join(root,'firebase.json'),'utf8'));

assert.match(configText,/0\.4\.0-beta\.5-local-ai/);
assert.match(configText,/mode:\s*'local-browser'/);
assert.match(configText,/onnx-community\/whisper-tiny/);
assert.match(configText,/onnx-community\/Qwen2\.5-0\.5B-Instruct/);
assert.ok(!('functions' in firebase),'firebase.json must not deploy Cloud Functions');
const runtimeFiles=['src/ai.js','src/app.js','src/admin-gate.js','src/backend.js','src/firebase-backend.js','src/local-backend.js'];
for(const rel of runtimeFiles){
  const text=fs.readFileSync(path.join(root,rel),'utf8');
  for(const bad of ['api.openai.com','OPENAI_API_KEY','httpsCallable','firebase-functions']){
    assert.ok(!text.includes(bad),`${rel} must not contain paid/cloud AI dependency ${bad}`);
  }
}
assert.match(aiText,/@huggingface\/transformers@/);
assert.match(aiText,/automatic-speech-recognition/);
assert.match(aiText,/text-generation/);
console.log('local AI config / no-paid-API dependency checks passed');
