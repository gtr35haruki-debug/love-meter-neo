import assert from 'node:assert/strict';
import { validateResultCommentText } from '../src/ai.js';

const bad='会話358位BANNERS：52 BANNERS：52 題目：52題目52 52 52題目52 52題目5252題目52';
const good='心拍と声、それぞれに違う動きが見えました！';
const repeated='ドキドキドキドキドキドキドキドキ';
assert.equal(validateResultCommentText(bad).ok,false,'gibberish/numeric English output must be rejected');
assert.equal(validateResultCommentText(good).ok,true,'natural Japanese comment should pass');
assert.equal(validateResultCommentText(repeated).ok,false,'repetitive output must be rejected');
console.log('AI output guard checks passed');
