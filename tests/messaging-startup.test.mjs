import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

test('authenticated layout starts independent startup reads together and fails closed before fetching',async()=>{
  let releaseConversations,releaseSettings,denied=false;const starts=[];
  const mocks={
    requireUser:async()=>{if(denied)throw new Error('unauthorized');return {id:'test'};},
    getConversationList:()=>{starts.push('conversations');return new Promise(resolve=>{releaseConversations=resolve;});},
    mySettings:()=>{starts.push('settings');return new Promise(resolve=>{releaseSettings=resolve;});},
    SettingsProvider:()=>null,ChatLayout:()=>null,
    performanceRequest:fn=>fn(),performanceStep:(_stage,fn)=>fn(),
  };
  const key='__chatbitStartupTest';globalThis[key]=mocks;
  try {
    const source=await readFile(new URL('../app/(app)/layout.tsx',import.meta.url),'utf8');
    const injected=`const {${Object.keys(mocks).join(',')}}=globalThis.${key};\n`+source.replace(/^import .*;\n/gm,'');
    const code=ts.transpileModule(injected,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')));
    const {default:layout}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
    const loading=layout({children:'test'});await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(starts,['conversations','settings'],'Settings must start before the conversation response returns');
    releaseConversations([]);releaseSettings({theme:'system'});
    const rendered=await loading;assert.equal(rendered.props.initial.theme,'system');
    denied=true;starts.length=0;await assert.rejects(layout({children:'test'}),/unauthorized/);assert.deepEqual(starts,[]);
  } finally {delete globalThis[key];}
});
