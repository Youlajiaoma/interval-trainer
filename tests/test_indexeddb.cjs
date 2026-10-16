'use strict';
// No npm dependencies; a deterministic IndexedDB transaction emulator verifies
// initialization, first migration, writes, reload preservation and atomic imports.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const path=require('path');
const site=path.resolve(__dirname,'../site');
const records=new Map();
let exists=false, sequence=Promise.resolve();
const db={
  objectStoreNames:{contains:()=>exists},
  createObjectStore(){exists=true;},
  close(){},
  transaction(name,mode){
    const tx={oncomplete:null,onerror:null,onabort:null,error:null,ops:[],
      objectStore(){ return {
        get(key){const r={};tx.ops.push({type:'get',key,r});return r;},
        put(val,key){tx.ops.push({type:'put',key,val});},
        delete(key){tx.ops.push({type:'delete',key});}
      }; }
    };
    sequence=sequence.then(()=>new Promise(resolve=>setTimeout(()=>{
      try {for(const op of tx.ops){
        if(op.type==='get'){op.r.result=records.get(op.key);op.r.onsuccess?.();}
        else if(op.type==='put')records.set(op.key,op.val);
        else records.delete(op.key);
      }tx.oncomplete?.();}catch(e){tx.error=e;tx.onerror?.();}resolve();
    },0)));
    return tx;
  }
};
const dbAPI={open(){const r={};setTimeout(()=>{r.result=db;if(!exists)r.onupgradeneeded?.();r.onsuccess?.();},0);return r;}};
const legacy=new Map();
const w={indexedDB:dbAPI,localStorage:{getItem:k=>legacy.get(k)??null,setItem:(k,v)=>legacy.set(k,v),removeItem:k=>legacy.delete(k)},navigator:{storage:{persist:async()=>true}}};
const ctx=vm.createContext({window:w,indexedDB:dbAPI,console,Map,Set,Promise,setTimeout,Date});
vm.runInContext(fs.readFileSync(path.join(site,'review.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(site,'modules.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(site,'storage.js'),'utf8'),ctx);
const K=w.IntervalPwaStorage.REVIEW_KEY, S=w.IntervalPwaStorage.SETTINGS_KEY;
(async()=>{
  const a=await w.IntervalPwaStorage.initialize();
  assert(a.available);assert(!a.migrated);
  a.setItem(K,JSON.stringify({version:1,totalAnswers:2,cards:{},history:[],daily:{}}));
  a.setItem(S,JSON.stringify({enabled:[3,4,7]}));
  await a.flush();
  const b=await w.IntervalPwaStorage.initialize();
  assert.equal(JSON.parse(b.getItem(K)).totalAnswers,2);
  assert.deepEqual(JSON.parse(b.getItem(S)).enabled,[3,4,7]);
  legacy.set(K,JSON.stringify({version:1,totalAnswers:99,cards:{3:{attempts:99,correct:0}},history:[]}));
  const c=await w.IntervalPwaStorage.initialize();
  assert.equal(JSON.parse(c.getItem(K)).totalAnswers,2,'IDB must win against stale legacy data');
  await c.replaceBoth(JSON.stringify({enabled:[6]}),JSON.stringify({version:1,totalAnswers:3,cards:{3:{attempts:3,correct:1}},history:[]}));
  const d=await w.IntervalPwaStorage.initialize();
  assert.deepEqual(JSON.parse(d.getItem(S)).enabled,[6]);
  assert.equal(JSON.parse(d.getItem(K)).totalAnswers,3);
  records.clear();
  const e=await w.IntervalPwaStorage.initialize();
  assert(e.migrated,'first time should migrate from localStorage');
  assert(e.migratedKeys.includes(K));
  assert.equal(JSON.parse(e.getItem(K)).totalAnswers,99);
  const f=await w.IntervalPwaStorage.initialize();
  assert(!f.migrated);
  assert.equal(JSON.parse(f.getItem(K)).totalAnswers,99);
  console.log('PASS IndexedDB adapter: durable reads/writes, atomic restore, old-data migration, idb precedence');
})().catch(e=>{console.error(e);process.exitCode=1;});
