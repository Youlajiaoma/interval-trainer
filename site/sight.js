/* Five-line staff sight-reading module, v2.5. Shares IndexedDB and review engine. */
(function(root){
'use strict';
const $=id=>document.getElementById(id);
const NAMES=['C','D','E','F','G','A','B'];
const CH_NAME={treble:'高音谱号',bass:'低音谱号'};
const PATHS={"treble":"M314 801Q300 854 291.0 906.0Q282 958 282 1012Q282 1059 288.5 1100.5Q295 1142 307 1177Q320 1217 341.0 1252.5Q362 1288 385.5 1311.0Q409 1334 427 1334Q451 1334 493 1249Q514 1206 524.0 1156.0Q534 1106 534 1049Q534 978 515.0 907.5Q496 837 459.5 775.0Q423 713 372 666L407 498Q422 500 432.0 501.0Q442 502 447 502Q508 502 556.0 467.5Q604 433 632.5 377.0Q661 321 661 254Q661 177 621.5 115.5Q582 54 503 25Q508 8 532 -117Q538 -147 541.0 -164.5Q544 -182 545.0 -195.0Q546 -208 546 -225Q546 -275 521.5 -314.5Q497 -354 455.5 -376.0Q414 -398 363 -398Q311 -398 271.0 -378.5Q231 -359 208.0 -324.5Q185 -290 185 -245Q185 -197 211.5 -165.0Q238 -133 287 -133Q329 -133 355.5 -163.5Q382 -194 382 -236Q382 -272 357.0 -299.0Q332 -326 292 -326H282Q308 -365 364 -365Q433 -365 472.0 -320.0Q511 -275 511 -205Q511 -188 507.0 -159.5Q503 -131 493 -91Q483 -51 477.5 -25.0Q472 1 470 12Q436 2 390 2Q304 2 222 52Q142 102 96.0 184.0Q50 266 50 361Q50 451 91 530Q132 609 192.5 675.0Q253 741 314 801ZM341 826Q364 838 390.0 870.5Q416 903 440.0 945.0Q464 987 479.0 1029.5Q494 1072 494 1106Q494 1142 483.0 1163.0Q472 1184 445 1184Q421 1184 398.5 1162.0Q376 1140 358.5 1103.5Q341 1067 331.0 1022.0Q321 977 321 930Q321 898 327.5 872.0Q334 846 341 826ZM398 379Q371 373 347.0 353.5Q323 334 308.5 306.5Q294 279 294 248Q294 223 307.0 196.5Q320 170 339 154Q352 142 365 136Q380 129 380 123Q380 120 370 117Q332 126 301.5 151.0Q271 176 253.5 211.5Q236 247 236 287Q236 330 253.5 370.0Q271 410 302.5 442.0Q334 474 374 490L345 641Q229 547 174.5 456.5Q120 366 120 277Q120 212 154.0 156.0Q188 100 247.0 65.5Q306 31 380 31Q400 31 420.5 35.0Q441 39 464 45ZM495 55Q593 97 593 227Q593 270 571.0 305.5Q549 341 512.0 362.0Q475 383 429 383Z","bass":"M50 123Q216 231 288 301Q336 348 373.0 408.5Q410 469 431.5 536.0Q453 603 453 669Q453 728 435.0 773.5Q417 819 383.0 845.0Q349 871 302 871Q284 871 264.5 867.0Q245 863 224 855Q181 839 158.0 813.5Q135 788 135 765Q135 756 143.0 752.0Q151 748 158 748Q168 748 183 752Q190 754 196.5 755.0Q203 756 210 756Q248 756 272.0 733.5Q296 711 296 674Q296 638 266.0 612.0Q236 586 195 586Q146 586 111.0 617.0Q76 648 76 697Q76 756 109.0 802.0Q142 848 198.5 874.0Q255 900 324 900Q400 900 460.0 867.0Q520 834 555.5 776.5Q591 719 591 646Q591 551 538 464Q511 419 476.5 379.0Q442 339 389.0 297.5Q336 256 256.0 208.0Q176 160 57 101ZM687 809Q710 809 726.0 793.0Q742 777 742 754Q742 731 726.0 715.5Q710 700 687 700Q664 700 648.0 715.5Q632 731 632 754Q632 777 648.0 793.0Q664 809 687 809ZM687 589Q710 589 726.0 573.0Q742 557 742 534Q742 511 726.0 495.5Q710 480 687 480Q664 480 648.0 495.5Q632 511 632 534Q632 557 648.0 573.0Q664 589 687 589Z"};
const SETTINGS_KEY='interval-trainer-sight-settings-v1';
const SESSION_KEY='interval-trainer-sight-session-v1';
const TREBLE_KEY='interval-trainer-review-sight-treble-v1';
const BASS_KEY='interval-trainer-review-sight-bass-v1';
// Each measure sums to 4 quarter-note beats. Variable notes per measure.
const RHYTHMS=[
 [1,1,1,1], [2,1,1], [1,1,2], [2,2],
 [.5,.5,1,1,1], [1,.5,.5,1,1], [1,1,.5,.5,1],
 [.5,.5,.5,.5,1,1], [1,.5,.5,.5,.5,1],
 [1.5,.5,1,1], [1,.5,1.5,1], [.5,1.5,1,1],
 [1,.5,.5,.5,.5,1], [.5,.5,.5,.5,.5,.5,1],
 [1,1,.5,.25,.25,1], [.25,.25,.5,1,1,1],
 [.5,.5,.5,.5,.5,.5,.5,.5]
];
const DURATION_CODES={'2':'h','1.5':'qd','1':'q','0.5':'8','0.25':'16'};
const SEMITONES=[0,2,4,5,7,9,11];
const POOLS={
 treble:[...Array.from({length:13},(_,i)=>28+i)],
 bass:[...Array.from({length:13},(_,i)=>17+i)]
};
const CLEF_BASE={treble:30,bass:18};
const SEMI=SEMITONES;
let storage, review, settings={clef:'both'}, session=null, active=false, busy=false;
let initialized=false, pendingTimer=null, flashWrongPos=-1;
let drawing=0, lastLayoutWidth=0, resizeTimer=null;
const engravings=new Map();
const LAYOUT={minNote:41, firstBarExtra:78, otherBarExtra:20, maxPerLine:12};
let audioCtx=null, audioGain=null;
const buffers=new Map(), loading=new Map();
const random=(n)=>Math.floor(Math.random()*n);
const shuffle=(arr)=>{const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=random(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function letterFromIndex(i){return ((i%7)+7)%7;}
function pitchLabel(clef,id){ const n=POOLS[clef][id];return n===undefined?'—':NAMES[letterFromIndex(n)]+Math.floor(n/7); }
function nearestChosenPosition(clef,actualIndex,letter){
 const pool=POOLS[clef];
 return pool.map((n,i)=>({n,i})).filter(o=>letterFromIndex(o.n)===letter)
   .sort((a,b)=>Math.abs(a.n-actualIndex)-Math.abs(b.n-actualIndex))[0].i;
}
function diatonicToMidi(index){
 const oct=Math.floor(index/7), letter=letterFromIndex(index);
 return 12*(oct+1)+SEMI[letter];
}
function getJson(key){try{return JSON.parse(storage.getItem(key)||'null');}catch{return null;}}
function save(key,item){try{storage.setItem(key,JSON.stringify(item));}catch(err){console.error(err);$('sight-warning').textContent='学习记录保存失败';}}
function getReview(clef){return clef==='bass'?review.bass:review.treble;}
function currentNote(){return session && session.pos<20 ? session.notes[session.pos] : null;}
function measurePlans(){
 const candidates=RHYTHMS.map((beats)=>({beats,count:beats.length}));
 const possible=Array(21).fill(false); possible[0]=true;
 for(let n=1;n<=20;n++) possible[n]=candidates.some(p=>p.count<=n&&possible[n-p.count]);
 const bars=[]; let remaining=20;
 while(remaining>0){
  const valid=candidates.filter(p=>p.count<=remaining&&possible[remaining-p.count]);
  if(!valid.length) throw Error('无法构造20个音符');
  const plan=valid[random(valid.length)];
  bars.push({duration:plan.beats.slice(),start:20-remaining,end:20-remaining+plan.count,clef:null});
  remaining-=plan.count;
 }
 const clefs=[];
 if(settings.clef==='both'){
  // Group adjacent measures by clef. Each notated line has exactly one clef.
  for(let k=0;k<bars.length;k++) clefs.push(k%2===1?clefs[k-1]:(random(2)?'treble':'bass'));
  if(!clefs.includes('treble'))clefs[0]='treble';
  if(!clefs.includes('bass'))clefs[clefs.length-1]='bass';
 } else for(let k=0;k<bars.length;k++) clefs.push(settings.clef);
 bars.forEach((b,i)=>b.clef=clefs[i]);
 return bars;
}
function makeGroup(){
 const container=$('sight-score');if(container)delete container.dataset.layout;
 const notes=[],bars=measurePlans();
 for(const bar of bars)for(const duration of bar.duration){
  const clef=bar.clef, pool=POOLS[clef], candidates=pool.map((_,i)=>i);
  const last=notes.at(-1), previous=last?.clef===clef?last.index-pool[0]:null;
  const chosen=getReview(clef).choose(candidates,previous);
  const index=pool[chosen===null?random(pool.length):chosen];
  notes.push({clef,letter:letterFromIndex(index),index,duration,result:null,mistakeChosen:null});
 }
 session={version:3,pos:0,notes,bars,startedAt:Date.now(),correct:0};
 engravings.clear();save(SESSION_KEY,session);
}
function validatedSession(x){
 if(!x||!Number.isInteger(x.pos)||x.pos<0||x.pos>20||!Array.isArray(x.notes)||x.notes.length!==20||!Number.isInteger(x.correct))return null;
 const notes=x.notes;
 for(const n of notes){
  if(!n||!['treble','bass'].includes(n.clef)||!Number.isInteger(n.index)||!POOLS[n.clef].includes(n.index)||n.letter!==letterFromIndex(n.index))return null;
  if(![.25,.5,1,1.5,2].includes(n.duration))return null;
  if(n.mistakeChosen===undefined)n.mistakeChosen=null;
 }
 if(!Array.isArray(x.bars)||!x.bars.length){
  // Upgrade v2.4's four 5-note systems without losing the unfinished session.
  x.bars=Array.from({length:4},(_,i)=>({start:i*5,end:i*5+5,clef:notes[i*5].clef,duration:notes.slice(i*5,i*5+5).map(n=>n.duration)}));
 }
 let cursor=0;
 for(const bar of x.bars){
  if(!Number.isInteger(bar.start)||!Number.isInteger(bar.end)||bar.start!==cursor||bar.end<=cursor||bar.end>20||!['treble','bass'].includes(bar.clef))return null;
  if(notes.slice(bar.start,bar.end).some(n=>n.clef!==bar.clef))return null;
  cursor=bar.end;
 }
 if(cursor!==20)return null;
 x.version=3;
 return x;
}
function packLines(bars,width){
 const limit=Math.max(240,width-24),lines=[];
 let group=[],estimated=0,noteCount=0;
 for(const bar of bars){
  const count=bar.end-bar.start;
  const cost=count*LAYOUT.minNote+(group.length?LAYOUT.otherBarExtra:LAYOUT.firstBarExtra);
  if(group.length&&(group[0].clef!==bar.clef||estimated+cost>limit||noteCount+count>LAYOUT.maxPerLine)){
   lines.push(group);group=[];estimated=0;noteCount=0;
  }
  const oneCost=count*LAYOUT.minNote+(group.length?LAYOUT.otherBarExtra:LAYOUT.firstBarExtra);
  group.push(bar);estimated+=oneCost;noteCount+=count;
 }
 if(group.length)lines.push(group);
 return lines;
}
function scoreLayoutSignature(lines,width){return width+':'+lines.map(group=>group.map(b=>`${b.start}-${b.end}`).join(',')).join('|');}
async function ensureEngraver(){
 const vf=await root.SightVexFlowReady;
 if(!vf)throw Error('乐谱渲染组件加载失败，请联网重新打开应用');
 // The full VexFlow bundle embeds its music glyph tables.
 if(!ensureEngraver.fontSet){
  if(typeof vf.setFonts==='function')vf.setFonts('Bravura','Academico');
  ensureEngraver.fontSet=true;
 }
 return vf;
}
function applyDots(note,VF){
 if(typeof VF.Dot?.buildAndAttach==='function')VF.Dot.buildAndAttach([note],{all:true});
 else if(typeof note.addDotToAll==='function')note.addDotToAll();
 else throw Error('当前记谱引擎不支持附点音符');
}
function noteKey(diIndex){return `${NAMES[letterFromIndex(diIndex)].toLowerCase()}/${Math.floor(diIndex/7)}`;}
function addBarlines(host,bars,allNotes){
 if(bars.length<2)return;
 const svg=host.querySelector('svg');if(!svg)return;
 // Bar lines are purely graphical; all notes, beams, glyphs and ledger lines use VexFlow.
 for(let b=0;b<bars.length-1;b++){
  const last=allNotes[bars[b].end-bars[0].start-1];
  const next=allNotes[bars[b+1].start-bars[0].start];
  if(!last||!next)continue;
  const x=(last.getAbsoluteX()+next.getAbsoluteX())/2;
  const line=document.createElementNS('http://www.w3.org/2000/svg','line');
  for(const [k,v] of Object.entries({x1:x,x2:x,y1:30,y2:70,stroke:'#55545a','stroke-width':'1.2'}))line.setAttribute(k,String(v));
  svg.append(line);
 }
}
function drawLine(VF,group,width){
 const lineHost=document.createElement('div');lineHost.className='sight-system';
 lineHost.dataset.from=String(group[0].start);lineHost.dataset.to=String(group.at(-1).end);
 const w=Math.max(240,width-4),height=123;
 const renderer=new VF.Renderer(lineHost,VF.Renderer.Backends.SVG);
 renderer.resize(w,height);
 const ctx=renderer.getContext(),clef=group[0].clef;
 const stave=new VF.Stave(8,30,w-16).addClef(clef);
 const voiceNotes=[],barSlices=[];
 for(const bar of group){
  const bNotes=[];
  for(let i=bar.start;i<bar.end;i++){
   const n=session.notes[i];
   const note=new VF.StaveNote({keys:[noteKey(n.index)],duration:DURATION_CODES[String(n.duration)],clef});
   if(n.duration===1.5)applyDots(note,VF);
   bNotes.push(note);voiceNotes.push(note);
  }
  barSlices.push(bNotes);
 }
 const beats=group.length*4;
 const voice=new VF.Voice({num_beats:beats,beat_value:4});
 voice.addTickables(voiceNotes);
 // Never beam across barlines; the engraver decides the correct stem and beam geometry.
 const beams=barSlices.flatMap(part=>VF.Beam.generateBeams(part,{groups:[new VF.Fraction(2,8)]}));
 new VF.Formatter().joinVoices([voice]).formatToStave([voice],stave);
 stave.setContext(ctx).draw();
 voice.draw(ctx,stave);
 for(const b of beams)b.setContext(ctx).draw();
 addBarlines(lineHost,group,voiceNotes);
 const highlight=document.createElement('div');highlight.className='sight-position-highlight';
 lineHost.prepend(highlight);
 const byIndex=[];
 voiceNotes.forEach((note,i)=>{
  const index=group[0].start+i;
  const el=typeof note.getSVGElement==='function'?note.getSVGElement():null;
  if(el){el.classList.add('sight-vex-note');el.dataset.sightIndex=String(index);}
  byIndex.push({index,x:note.getAbsoluteX(),el,note,host:lineHost,highlight});
 });
 return {host:lineHost,entries:byIndex};
}
function markCurrent(){
 const container=$('sight-score');
 // One highlight element per engraved system, shared by its notes.
 for(const indicator of container.querySelectorAll('.sight-position-highlight')) indicator.classList.remove('visible');
 const info=engravings.get(session.pos);
 if(!info)return;
 const marker=info.highlight;
 marker.classList.add('visible');marker.style.left=`${info.x-19}px`;
 const y=info.note.getYs?.()?.[0];
 marker.style.top=`${Math.max(4,Math.min(25,(y??53)-45))}px`;
 const rect=info.host.getBoundingClientRect(),outer=container.getBoundingClientRect();
 if(rect.top<outer.top+2)container.scrollTop+=rect.top-outer.top-3;
 else if(rect.bottom>outer.bottom-3)container.scrollTop+=rect.bottom-outer.bottom+3;
}
function flashCurrent(){
 const entry=engravings.get(session.pos);
 if(!entry)return;
 if(entry.el){entry.el.classList.remove('sight-note-error');void entry.el.getBoundingClientRect();entry.el.classList.add('sight-note-error');}
 else {entry.highlight.classList.add('note-error');}
 setTimeout(()=>{entry.el?.classList.remove('sight-note-error');entry.highlight.classList.remove('note-error');},360);
}
async function renderScore(force=false){
 const container=$('sight-score');if(!container||!session)return;
 const token=++drawing;
 let vf;
 try{vf=await ensureEngraver();}catch(err){if(token===drawing){container.textContent='乐谱无法加载';$('sight-warning').textContent=err.message;}return;}
 if(token!==drawing||!session||!active)return;
 const width=Math.floor(container.getBoundingClientRect().width||container.clientWidth||340);
 const groups=packLines(session.bars,width),signature=scoreLayoutSignature(groups,width);
 if(!force&&container.dataset.layout===signature){markCurrent();return;}
 container.replaceChildren();engravings.clear();
 try{
  for(const group of groups){
   const output=drawLine(vf,group,width);
   container.append(output.host);
   for(const e of output.entries)engravings.set(e.index,e);
  }
  container.dataset.layout=signature;lastLayoutWidth=width;
  $('sight-warning').textContent='';
  markCurrent();
 }catch(err){console.error('Sight score rendering failed',err);container.textContent='乐谱生成失败';$('sight-warning').textContent='请重新开始本组练习';}
}
async function getAudioContext(){
 if(!window.AudioContext && !window.webkitAudioContext) throw Error('当前浏览器不支持 Web Audio');
 if(!audioCtx){ audioCtx=new (window.AudioContext||window.webkitAudioContext)(); audioGain=audioCtx.createGain(); audioGain.gain.value=.42; audioGain.connect(audioCtx.destination); }
 if(audioCtx.state==='suspended') await audioCtx.resume();
 return audioCtx;
}
async function loadSample(midi){
 const anchor=midi; const key=String(anchor);
 if(buffers.has(key)) return {buffer:buffers.get(key), rate:1};
 if(!loading.has(key)){
   const sample=root.PIANO_SAMPLES?.[String(anchor)];
   if(!sample) throw Error(`缺少钢琴音源：${anchor}`);
   loading.set(key,(async()=>{
     const bin=atob(sample), bytes=new Uint8Array(bin.length);
     for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
     const ctx=await getAudioContext();
     return await ctx.decodeAudioData(bytes.buffer);
   })());
 }
 try{ const buffer=await loading.get(key); buffers.set(key,buffer); return {buffer,rate:1}; }
 finally{ loading.delete(key); }
}
function scheduleTone(sample,at,duration,gainMultiplier=.7){
 const src=audioCtx.createBufferSource(); src.buffer=sample.buffer; src.playbackRate.value=sample.rate||1;
 const g=audioCtx.createGain();
 g.gain.setValueAtTime(0,at); g.gain.linearRampToValueAtTime(gainMultiplier,at+.01); g.gain.setValueAtTime(gainMultiplier,at+Math.max(.02,duration-.14)); g.gain.linearRampToValueAtTime(.0001,at+duration);
 src.connect(g); g.connect(audioGain); src.start(at); src.stop(at+duration+.03);
 src.onended=()=>{ try{src.disconnect(); g.disconnect();}catch{} };
}
async function playKeyPitch(letter){
 try{
  const ctx=await getAudioContext();
  // The keyboard is pitch-class only. C4–B4 stays constant and never leaks octave hints.
  const midi=60+SEMI[letter];
  const sample=await loadSample(midi);
  scheduleTone(sample,ctx.currentTime+.01,.92,.72);
 }catch(err){console.error('Sight key playback error:',err);}
}
function renderKeyboard(){
 const area=$('sight-keys'); area.replaceChildren();
 for(let i=0;i<7;i++){
  const btn=document.createElement('button'); btn.type='button'; btn.className='sight-key'; btn.textContent=NAMES[i]; btn.dataset.note=String(i);
  btn.disabled=busy||session.pos>=20;
  btn.addEventListener('click',()=>{ void playKeyPitch(i); answer(i,false); });
  area.append(btn);
 }
}
function render(){
 if(!session)return;
 const finished=session.pos===20;
 $('sight-count').textContent=String(Math.min(20,session.pos+1)).padStart(2,'0');
 $('sight-correct').textContent=String(session.correct);
 $('sight-accuracy').textContent=session.pos?`${Math.round(session.correct/session.pos*100)}%`:'—';
 void renderScore(); renderKeyboard();
 $('sight-reveal').classList.toggle('hidden',finished); $('sight-reveal').disabled=busy;
 $('sight-keys').classList.toggle('hidden',finished);
 $('sight-complete').classList.toggle('hidden',!finished);
 if(finished)$('sight-complete-score').textContent=`${session.correct} / 20  ·  ${Math.round(100*session.correct/20)}%`;
}
function blinkWrong(){
 if(pendingTimer)clearTimeout(pendingTimer);
 flashCurrent();
 pendingTimer=setTimeout(()=>{ pendingTimer=null; busy=false; renderKeyboard(); $('sight-reveal').disabled=false; },360);
}
function commitNote(outcome){
 const n=currentNote(); if(!n) return;
 const actualIndex=n.index-POOLS[n.clef][0];
 if(outcome==='correct'){
   if(n.mistakeChosen===null){
     session.correct++;
     getReview(n.clef).record({actual:actualIndex,chosen:actualIndex,revealed:false,hinted:false,low:0,high:0,responseMs:null});
   } else {
     const chosenIndex=nearestChosenPosition(n.clef,n.index,n.mistakeChosen);
     getReview(n.clef).record({actual:actualIndex,chosen:chosenIndex,revealed:false,hinted:false,low:0,high:0,responseMs:null});
   }
   n.mistakeChosen=null;
   session.pos++; save(SESSION_KEY,session); busy=false; render(); return;
 }
 if(outcome==='reveal'){
   const chosenIndex=n.mistakeChosen===null?null:nearestChosenPosition(n.clef,n.index,n.mistakeChosen);
   getReview(n.clef).record({actual:actualIndex,chosen:chosenIndex,revealed:true,hinted:false,low:0,high:0,responseMs:null});
   n.mistakeChosen=null;
   session.pos++; save(SESSION_KEY,session);
   busy=false;
   render();
 }
}
function answer(chosen,revealed){
 if(busy||!active||!session||session.pos>=20)return;
 const n=currentNote(); if(!n)return;
 if(revealed){
   busy=true;
   const keys=[...$('sight-keys').querySelectorAll('button')];
   for(const key of keys){ key.disabled=true; if(Number(key.dataset.note)===n.letter) key.classList.add('is-correct'); }
   pendingTimer=setTimeout(()=>{ commitNote('reveal'); if(pendingTimer){clearTimeout(pendingTimer); pendingTimer=null;} render(); },420);
   return;
 }
 if(chosen===n.letter){
   busy=true;
   const keys=[...$('sight-keys').querySelectorAll('button')];
   for(const key of keys){ key.disabled=true; if(Number(key.dataset.note)===n.letter) key.classList.add('is-correct'); }
   pendingTimer=setTimeout(()=>{ commitNote('correct'); if(pendingTimer){clearTimeout(pendingTimer); pendingTimer=null;} },280);
   return;
 }
 if(n.mistakeChosen===null) n.mistakeChosen=chosen;
 busy=true; blinkWrong();
}
function statsBox(label,val){const b=document.createElement('div');b.className='sight-kpi';b.append(Object.assign(document.createElement('span'),{textContent:label}),Object.assign(document.createElement('strong'),{textContent:val}));return b;}
function statRow(label,attempts,correct){ const row=document.createElement('div');row.className='sight-stat-row'; const lab=document.createElement('span');lab.textContent=label; const bar=document.createElement('div');bar.className='sight-stat-track'; const fill=document.createElement('div');fill.style.width=attempts?`${100*correct/attempts}%`:'0%';bar.append(fill); const value=document.createElement('span');value.textContent=attempts?`${correct}/${attempts} · ${Math.round(100*correct/attempts)}%`:'—'; row.append(lab,bar,value);return row; }
function renderStats(){
 const container=$('sight-stats-content');container.replaceChildren();
 const t=review.treble.statistics('all'), b=review.bass.statistics('all');
 const total=t.totals.answered+b.totals.answered,correct=t.totals.correct+b.totals.correct;
 const grid=document.createElement('div');grid.className='sight-stats-grid';
 [['累计识谱',total+''],['正确率',total?Math.round(100*correct/total)+'%':'—'],['高音谱号',t.totals.answered+''],['低音谱号',b.totals.answered+'']].forEach(v=>grid.append(statsBox(...v)));
 container.append(grid);
 for(const [title,s] of [['高音谱号',t],['低音谱号',b]]){
   const section=document.createElement('section');section.className='stats-panel';
   const h=document.createElement('h3');h.textContent=title;section.append(h);
   for(let i=0;i<13;i++){const d=s.byInterval[i];section.append(statRow(pitchLabel(title==='高音谱号'?'treble':'bass',i),d.answered,d.correct));}
   container.append(section);
 }
 const daily=new Map();
 for(const source of [t,b])for(const row of source.trend){ const d=daily.get(row.day)||{answered:0,correct:0}; d.answered+=row.answered;d.correct+=row.correct;daily.set(row.day,d); }
 const dates=[...daily.keys()].sort().slice(-7);
 if(dates.length){ const section=document.createElement('section');section.className='stats-panel'; section.append(Object.assign(document.createElement('h3'),{textContent:'最近练习'})); for(const date of dates){const d=daily.get(date);section.append(statRow(date.slice(5),d.answered,d.correct));} container.append(section); }
 const recent=[...t.history.map(h=>({...h,clef:'高音谱号'})),...b.history.map(h=>({...h,clef:'低音谱号'}))].sort((a,b)=>b.at-a.at).slice(0,10);
 if(recent.length){ const section=document.createElement('section');section.className='stats-panel'; section.append(Object.assign(document.createElement('h3'),{textContent:'最近答题'})); for(const h of recent){ const row=document.createElement('div');row.className='sight-confusion'; const wrong=h.revealed||h.actual!==h.chosen; const clef=h.clef==='高音谱号'?'treble':'bass'; const name=`${h.clef} · ${pitchLabel(clef,h.actual)}`; const chosen=h.revealed?'显示答案':wrong?`→ ${NAMES[letterFromIndex(POOLS[clef][h.chosen])]}`:'✓'; row.append(Object.assign(document.createElement('span'),{textContent:name}),Object.assign(document.createElement('strong'),{textContent:chosen})); section.append(row);} container.append(section); }
 const confused=[];
 for(const [clef,r] of [['高音谱号',review.treble],['低音谱号',review.bass]]){ for(const c of r.analysis(Array.from({length:13},(_,i)=>i)).confusions.slice(0,8))confused.push({label:`${clef} · ${pitchLabel(clef==='高音谱号'?'treble':'bass',c.actual)} → ${pitchLabel(clef==='高音谱号'?'treble':'bass',c.chosen)}`,count:c.count}); }
 confused.sort((a,b)=>b.count-a.count);
 if(confused.length){ const section=document.createElement('section');section.className='stats-panel'; const h=document.createElement('h3');h.textContent='常见误认';section.append(h); for(const item of confused.slice(0,10)){ const row=document.createElement('div');row.className='sight-confusion'; row.append(Object.assign(document.createElement('span'),{textContent:item.label}),Object.assign(document.createElement('strong'),{textContent:item.count+' 次'})); section.append(row); } container.append(section); }
}
function switchStats(on){
 const box=$('stats-dialog');box.classList.toggle('sight-stats-active',on);
 $('sight-stats-content').classList.toggle('hidden',!on);
 const sightBtn=$('stats-sight');sightBtn.classList.toggle('active',on);sightBtn.setAttribute('aria-pressed',String(on));
 if(on){for(const key of ['harmonic','melodic']){ const btn=$('stats-'+key);btn.classList.remove('active');btn.setAttribute('aria-pressed','false'); }}
 if(on)renderStats();
}
function openStats(){ if($('sight-settings-dialog').open)$('sight-settings-dialog').close(); if(!$('stats-dialog').open)$('home-stats').click(); switchStats(true); }
function openSettings(){ if(!active)return; for(const btn of document.querySelectorAll('.sight-clef-options button')){ const on=btn.dataset.clef===settings.clef;btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',String(on)); } $('sight-settings-dialog').showModal(); }
function enter(){
 if(!initialized)return;
 if(!session||!validatedSession(session))makeGroup();
 active=true; document.documentElement.classList.remove('practice-scroll-locked');
 $('home-screen').classList.add('hidden'); $('practice').classList.add('hidden'); $('practice-navigation').classList.remove('hidden'); $('practice-mode-title').textContent='五线谱识谱'; $('open-settings').classList.remove('hidden'); $('sight-practice').classList.remove('hidden'); $('back-home').onclick=e=>{e.stopImmediatePropagation();leave();}; $('sight-warning').textContent=''; render(); window.scrollTo(0,0);
}
function leave(){ if(!active)return; active=false; if($('sight-settings-dialog').open)$('sight-settings-dialog').close(); $('sight-practice').classList.add('hidden'); $('practice-navigation').classList.add('hidden'); $('open-settings').classList.add('hidden'); $('home-screen').classList.remove('hidden'); $('back-home').onclick=null; window.scrollTo(0,0); }
function backup(){return {treble:review.treble.snapshot(),bass:review.bass.snapshot(),settings:{clef:settings.clef}};}
function init(){
 if(initialized)return;
 storage=root.IntervalPwaStorageAdapter;if(!storage)return;
 review={treble:root.IntervalReview.createReviewManager(storage,TREBLE_KEY),bass:root.IntervalReview.createReviewManager(storage,BASS_KEY)};
 const existing=getJson(SETTINGS_KEY); if(['treble','bass','both'].includes(existing?.clef))settings.clef=existing.clef;
 session=validatedSession(getJson(SESSION_KEY));
 $('sight-reveal').addEventListener('click',()=>answer(null,true));
 $('sight-next-set').addEventListener('click',()=>{makeGroup();render();});
 $('sight-close-settings').addEventListener('click',()=>$('sight-settings-dialog').close());
 $('sight-settings-done').addEventListener('click',()=>$('sight-settings-dialog').close());
 $('sight-open-stats').addEventListener('click',openStats);
 $('sight-abandon').addEventListener('click',()=>{ if(!confirm('重新开始当前20音练习？未完成的题目会被替换。'))return; makeGroup(); $('sight-settings-dialog').close(); render(); });
 $('sight-settings-dialog').addEventListener('click',e=>{ if(e.target===$('sight-settings-dialog'))e.target.close(); });
 function openSettingsRefresh(){ for(const b of document.querySelectorAll('.sight-clef-options button')){ const on=b.dataset.clef===settings.clef; b.classList.toggle('active',on); b.setAttribute('aria-pressed',String(on)); } }
 for(const btn of document.querySelectorAll('.sight-clef-options button'))btn.addEventListener('click',()=>{ settings.clef=btn.dataset.clef; save(SETTINGS_KEY,settings); openSettingsRefresh(); });
 $('stats-sight').addEventListener('click',()=>switchStats(true));
 for(const id of ['stats-harmonic','stats-melodic']) $(''+id).addEventListener('click',()=>switchStats(false));
 $('close-stats').addEventListener('click',()=>switchStats(false));
 $('stats-dialog').addEventListener('close',()=>switchStats(false));
 initialized=true;
}
root.SightTrainer={enter,leave,openSettings,isActive:()=>active,backup,showStats:openStats};
if(root.IntervalAppReady)init(); else root.addEventListener('interval-trainer-ready',init,{once:true});
})(window);
