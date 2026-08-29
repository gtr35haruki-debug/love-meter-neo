import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CHILD_SUPPORT_VERSION, APP_VERSION } from '../src/config.js';
import { childReadAloudPrompt } from '../src/question-bank.js';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');

assert.equal(APP_VERSION,'0.3.2');
assert.equal(CHILD_SUPPORT_VERSION,'CHILD_SUPPORT_V1');
assert.match(app,/id="child-support"/);
assert.match(app,/childSupport,childSupportVersion/);
assert.match(app,/こどもサポート/);
assert.match(app,/スタッフ読み上げ例/);
assert.match(app,/この質問をスキップ/);
assert.match(app,/const needsSurvey=s\.protocolId==='RESEARCH_V1'/);
assert.doesNotMatch(app,/open-child-survey|EVENT_CHILD_|childQuestionnaireVersion|childPost[A-B]?/);
assert.doesNotMatch(app,/こどもアンケート/);
assert.match(css,/child-intro-display/);
assert.match(css,/child-question-large/);
assert.match(childReadAloudPrompt('好きな食べ物は？'),/好きな食べ物は？/);

console.log('EVENT child-support/no-questionnaire tests passed');
