/* VexFlow v5.0.0 runtime loader. MIT licensed dependency: https://github.com/vexflow/vexflow */
/* For permanent standalone offline hosting, put the upstream vexflow.js in /site/vendor/. */
(function(root){
'use strict';
const VERSION='5.0.0';
const CDN=`https://cdn.jsdelivr.net/npm/vexflow@${VERSION}/build/cjs/vexflow.js`;
const CACHE='interval-trainer-vexflow-v5.0.0';
const LOCAL='./vendor/vexflow.js';
function expose(){return root.VexFlow||root.Vex?.Flow||null;}
async function runScript(source){
 const blob=new Blob([source],{type:'text/javascript'}),url=URL.createObjectURL(blob);
 try{
  await new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src=url;
   script.onload=()=>{script.remove();resolve();};script.onerror=()=>{script.remove();reject(Error('VexFlow 运行文件无法执行'));};
   document.head.append(script);
  });
 }finally{URL.revokeObjectURL(url);}
 if(!expose())throw Error('乐谱组件没有正确初始化');
 return expose();
}
async function fetchCode(){
 // Prefer a vendor file on the user's GitHub Pages site if it was installed.
 try{const local=await fetch(new URL(LOCAL,document.baseURI),{cache:'no-store'});if(local.ok)return local.text();}catch(_){ }
 // Download exactly once and store in CacheStorage; subsequent offline sessions use the same bytes.
 const cache=await caches.open(CACHE);
 const prior=await cache.match(CDN);
 if(prior)return prior.text();
 const response=await fetch(CDN,{mode:'cors',cache:'no-cache'});
 if(!response.ok)throw Error(`VexFlow 下载失败：HTTP ${response.status}`);
 const code=await response.text();
 try{await cache.put(CDN,new Response(code,{headers:{'Content-Type':'text/javascript'}}));}catch(_){}
 return code;
}
root.SightVexFlowReady=(async()=>{
 if(expose())return expose();
 return runScript(await fetchCode());
})().catch(error=>{console.error('VexFlow unavailable',error);return null;});
})(window);
