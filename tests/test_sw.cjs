const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const site=path.join(__dirname,'..','site');
const root='https://example.test/interval-trainer/';
const handlers={};
const backend=new Map();
let online=true;
function resource(u){const relative=new URL(u).pathname.replace('/interval-trainer/','')||'index.html';return path.join(site,relative);}
function response(url){const p=resource(url);if(!fs.existsSync(p))throw Error('file missing '+url);return {ok:true,type:'basic',url,body:fs.readFileSync(p),clone(){return this;}};}
const cacheAPI={
 async open(name){if(!backend.has(name))backend.set(name,new Map());const entries=backend.get(name);return {
  async addAll(urls){for(const u of urls){if(!online)throw Error('offline');entries.set(String(u),response(String(u)));}},
  async match(req){return entries.get(typeof req==='string'?req:req.url)},
  async put(req,res){entries.set(req.url,res)}
 };},
 async keys(){return [...backend.keys()]},async delete(name){return backend.delete(name)}
};
const selfObj={registration:{scope:root},clients:{claim:async()=>{}},addEventListener:(name,handler)=>{handlers[name]=handler},skipWaiting() {}};
const env={self:selfObj,caches:cacheAPI,URL,fetch:async(req)=>{if(!online)throw Error('network off');return response(req.url)}};
vm.runInNewContext(fs.readFileSync(path.join(site,'sw.js'),'utf8'),env);
(async()=>{
 let installation;handlers.install({waitUntil:p=>{installation=p}});await installation;
 assert([...backend.values()][0].size>=13);
 online=false;
 async function offlineGet(p){let result;handlers.fetch({request:{url:new URL(p,root).toString(),method:'GET',mode:'navigate'},respondWith:x=>result=x});return result;}
 assert((await offlineGet('index.html')).body.length>1000);
 assert((await offlineGet('assets/piano-samples.js')).body.length>100000);
 assert((await offlineGet('')).body.length>1000);
 console.log('PASS ServiceWorker simulation: all assets cached, offline app & piano samples available');
})().catch(e=>{console.error(e);process.exitCode=1});
