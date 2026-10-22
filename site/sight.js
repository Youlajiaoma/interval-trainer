/* Five-line staff sight-reading module. VexFlow chooses adaptive stem directions. */
(function(root){
'use strict';
const $=id=>document.getElementById(id);
const modules=root.TonaloomModules, definition=modules.get('sight');
const NAMES=['C','D','E','F','G','A','B'];
const SETTINGS_KEY=definition.settingsKey, SESSION_KEY=definition.sessionKey;
const TREBLE_KEY=definition.reviews[0].key, BASS_KEY=definition.reviews[1].key;
const DURATION_CODES={'2':'h','1.5':'qd','1':'q','0.5':'8','0.25':'16'};
const SEMITONES=[0,2,4,5,7,9,11];
const POOLS={
 treble:[...Array.from({length:21},(_,i)=>24+i)],
 bass:[...Array.from({length:21},(_,i)=>12+i)]
};
const SEMI=SEMITONES;
const ACCIDENTALS={0:'',1:'#',2:'b'};
const PITCH_SIGN={0:'',1:'♯',2:'♭'};
const REVIEW_MAX=62;
const OLD_POOL_START={treble:28,bass:17};
const ALLOWED_SHARP=new Set([0,1,3,4,5]);
const ALLOWED_FLAT=new Set([1,2,4,5,6]);
const WHITE_KEYS=[0,2,4,5,7,9,11];
const BLACK_KEYS=[{semi:1,boundary:1,name:'C♯/D♭'},{semi:3,boundary:2,name:'D♯/E♭'},
 {semi:6,boundary:4,name:'F♯/G♭'},{semi:8,boundary:5,name:'G♯/A♭'},{semi:10,boundary:6,name:'A♯/B♭'}];
function accidentalPossibilities(letter,include=Boolean(settings.accidentals)){
 return include?[0,...(ALLOWED_SHARP.has(letter)?[1]:[]),...(ALLOWED_FLAT.has(letter)?[2]:[])]:[0];
}
function reviewUnit(note){return (note.index-POOLS[note.clef][0])*3+(note.alter||0);}
function noteSemitone(note){return (SEMI[note.letter]+(note.alter===1?1:note.alter===2?-1:0)+12)%12;}
function noteMidi(note){return diatonicToMidi(note.index)+(note.alter===1?1:note.alter===2?-1:0);}
function reviewLabel(clef,unit){
 const di=Math.floor(unit/3), alter=unit%3;
 return pitchLabel(clef,di)+PITCH_SIGN[alter];
}
function candidateReviewUnits(clef,include=Boolean(settings.accidentals)){
 return POOLS[clef].flatMap((index,di)=>accidentalPossibilities(letterFromIndex(index),include).map(alter=>di*3+alter));
}
function recordChosenUnit(note,chosenSemi){
 const actual=reviewUnit(note);
 const result=candidateReviewUnits(note.clef,true).filter(u=>{
  const di=Math.floor(u/3),alter=u%3,index=POOLS[note.clef][di];
  return ((SEMI[letterFromIndex(index)]+(alter===1?1:alter===2?-1:0)+12)%12)===chosenSemi && u!==actual;
 }).sort((a,b)=>Math.abs(Math.floor(a/3)-(actual/3)) - Math.abs(Math.floor(b/3)-(actual/3)));
 return result.length?result[0]:(actual===0?1:0);
}

let storage, review, settings={clef:'both',accidentals:false}, session=null, active=false, busy=false;
let initialized=false, pendingTimer=null, flashTimer=null, flashingIndex=-1;
let drawing=0, lastLayoutWidth=0, resizeTimer=null;
const engravings=new Map();
const LAYOUT={minNote:34, firstBarExtra:60, otherBarExtra:10, maxPerLine:9};
const audio=root.TonaloomAudio.createChannel(.42);
const random=(n)=>Math.floor(Math.random()*n);
const shuffle=(arr)=>{const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=random(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
function letterFromIndex(i){return ((i%7)+7)%7;}
function pitchLabel(clef,id){ const n=POOLS[clef][id];return n===undefined?'—':NAMES[letterFromIndex(n)]+Math.floor(n/7); }
function diatonicToMidi(index){
 const oct=Math.floor(index/7), letter=letterFromIndex(index);
 return 12*(oct+1)+SEMI[letter];
}
function getJson(key){try{return JSON.parse(storage.getItem(key)||'null');}catch{return null;}}
function save(key,item){try{storage.setItem(key,JSON.stringify(item));}catch(err){console.error(err);$('sight-warning').textContent='学习记录保存失败';}}
function getReview(clef){return clef==='bass'?review.bass:review.treble;}
function currentNote(){return session && session.pos<20 ? session.notes[session.pos] : null;}
function measurePlans(){
 // Three standard 4/4 bars, rendered as exactly three systems.
 // Note counts vary (6 / 7 / 7), not five per line.
 const noteCounts=shuffle([6,7,7]);
 const rhythmicShapes={
  6:[[.5,.5,.5,.5,1,1],[1,1,.5,.5,.5,.5],[.25,.25,.5,1,1,1],
     [.25,.25,.5,.5,.5,2],[2,.5,.5,.5,.25,.25]],
  7:[[1,.5,.5,.5,.5,.5,.5],[.5,.5,1,.5,.5,.5,.5],
     [.25,.25,.5,.5,.5,1,1],[1,1,.5,.5,.5,.25,.25],
     [.5,.5,.5,1,.5,.5,.5]]
 };
 const clefs=settings.clef==='both'?shuffle(['treble','bass',random(2)?'treble':'bass']):Array(3).fill(settings.clef);
 let start=0;
 return noteCounts.map((count,i)=>{
  const possible=rhythmicShapes[count].filter(a=>Math.abs(a.reduce((sum,x)=>sum+x,0)-4)<1e-9);
  if(!possible.length)throw Error('节奏时值无效');
  const duration=shuffle(possible)[0].slice();
  const bar={start,end:start+count,clef:clefs[i],duration};start+=count;return bar;
 });
}
function makeGroup(){
 const container=$('sight-score');if(container)delete container.dataset.layout;
 const notes=[],bars=measurePlans();
 for(const bar of bars)for(const duration of bar.duration){
  const clef=bar.clef, pool=POOLS[clef];
  const last=notes.at(-1), previous=last?.clef===clef?last.index-pool[0]:null;
  const eligible=candidateReviewUnits(clef);
  const chosen=getReview(clef).choose(eligible,previous===null?null:previous*3);
  const selected=chosen===null?eligible[random(eligible.length)]:chosen;
  const index=pool[Math.floor(selected/3)],alter=selected%3;
  notes.push({clef,letter:letterFromIndex(index),index,alter,duration,result:null,mistakeChosen:null,
    questionStartedAt:null,responseMs:null});
 }
 session={version:4,pos:0,notes,bars,startedAt:Date.now(),correct:0};
 engravings.clear();flashingIndex=-1;if(flashTimer){clearTimeout(flashTimer);flashTimer=null;}save(SESSION_KEY,session);
}
function validatedSession(x){
 // Older unfinished groups used 13-pitch pools and variable line counts;
 // keep their submitted review history but start a fresh 3-line group.
 if(!x||x.version!==4||!Number.isInteger(x.pos)||x.pos<0||x.pos>20||
   !Array.isArray(x.notes)||x.notes.length!==20||!Number.isInteger(x.correct)||
   !Array.isArray(x.bars)||x.bars.length!==3)return null;
 let cursor=0;
 for(const bar of x.bars){
  if(!Number.isInteger(bar.start)||!Number.isInteger(bar.end)||bar.start!==cursor||
     bar.end<=cursor||bar.end>20||!['treble','bass'].includes(bar.clef))return null;
  const notes=x.notes.slice(bar.start,bar.end);
  if(notes.some(n=>!n||n.clef!==bar.clef||!POOLS[n.clef].includes(n.index)||
     n.letter!==letterFromIndex(n.index)||![0,1,2].includes(n.alter)||
     ![.25,.5,1,1.5,2].includes(n.duration)||
     (n.questionStartedAt!==null&&n.questionStartedAt!==undefined&&!Number.isFinite(n.questionStartedAt))||
     (n.responseMs!==null&&n.responseMs!==undefined&&(!Number.isFinite(n.responseMs)||n.responseMs<0))))return null;
  if(Math.abs(notes.reduce((v,n)=>v+n.duration,0)-4)>1e-8)return null;
  cursor=bar.end;
 }
 return cursor===20?x:null;
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
function noteKey(diIndex,alter=0){return `${NAMES[letterFromIndex(diIndex)].toLowerCase()}${ACCIDENTALS[alter]}/${Math.floor(diIndex/7)}`;}
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
 const w=Math.max(240,width-4),height=149;
 const renderer=new VF.Renderer(lineHost,VF.Renderer.Backends.SVG);
 renderer.resize(w,height);
 const ctx=renderer.getContext(),clef=group[0].clef;
 // VexFlow puts the staff below the stave's y argument.  The old value
 // of 45 left too much blank space above the first system and crowded low
 // ledger notes at the bottom of the third.  Move every system 32 units up
 // without changing the pitch range or the three-system layout.
 const stave=new VF.Stave(8,13,w-16).addClef(clef);
 const voiceNotes=[],barSlices=[];
 for(const bar of group){
  const bNotes=[];
  const alterations=new Map();
  for(let i=bar.start;i<bar.end;i++){
   const n=session.notes[i];
   const note=new VF.StaveNote({keys:[noteKey(n.index,n.alter)],duration:DURATION_CODES[String(n.duration)],clef,autoStem:true});
   // Accidentals apply to this staff position until the barline. Keep explicit
   // sharps/flats as before, but cancel them when this pitch returns to natural.
   const accidentalType=n.alter?ACCIDENTALS[n.alter]:(alterations.get(n.index)?'n':null);
   if(accidentalType){
     const accidental=new VF.Accidental(accidentalType);
     note.addModifier(accidental,0);
   }
   alterations.set(n.index,n.alter);
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
 // Color the ORIGINAL VexFlow SVG notes, not a second notehead or a box.
 // Two color matrices preserve white and alpha, including hollow noteheads.
 const svg=lineHost.querySelector('svg');
 if(!svg)throw Error('VexFlow SVG 未生成');
 const ns='http://www.w3.org/2000/svg';
 const errorFilterId=`sight-error-ink-${group[0].start}`;
 const currentFilterId=`sight-current-ink-${group[0].start}`;
 const defs=document.createElementNS(ns,'defs');
 function addInkFilter(id,red,green,blue){
  const filter=document.createElementNS(ns,'filter');
  for(const [name,value] of Object.entries({id,x:'-35%',y:'-35%',width:'170%',height:'170%','color-interpolation-filters':'sRGB'}))filter.setAttribute(name,value);
  const matrix=document.createElementNS(ns,'feColorMatrix');
  matrix.setAttribute('type','matrix');
  // 1=>1 for every channel: white notehead interiors stay white.
  // 0=>specified color: engraved black ink receives our highlight color.
  const vals=[
   1-red,0,0,0,red,
   0,1-green,0,0,green,
   0,0,1-blue,0,blue,
   0,0,0,1,0
  ];
  matrix.setAttribute('values',vals.join(' '));
  filter.append(matrix);defs.append(filter);
 }
 addInkFilter(errorFilterId,.86,.21,.31);
 addInkFilter(currentFilterId,.10,.59,.39);
 svg.prepend(defs);
 const byIndex=[];
 const renderedGroups=[...svg.querySelectorAll('.vf-stavenote')];
 // VexFlow 5 renders the stems of beamed notes as separate .vf-stem SVG
 // groups, *outside* their .vf-stavenote groups. Each Stem.draw() uses
 // the Stem object's ID, whereas getSVGElement() is often unset. Resolve
 // the real group by its stable SVG ID; never color the shared .vf-beam.
 const svgStems=[...svg.querySelectorAll('.vf-stem')];
 const claimedStems=new Set();
 function findDrawnStem(note){
  const stem=note.getStem?.();
  if(!stem)return null; // Whole notes and other stemless symbols.
  const id=stem.getAttribute?.('id');
  if(id){
   const target=String(id).startsWith('vf-')?String(id):`vf-${id}`;
   const byId=svgStems.find(el=>el.id===target&&!claimedStems.has(el));
   if(byId){claimedStems.add(byId);return byId;}
  }
  // Compatibility fallback: correlate a rendered vertical stem to the
  // associated VexFlow note's stem X coordinate. This does not use DOM
  // order, which is unreliable when beam/voice drawing passes differ.
  const x=note.getStemX?.();
  if(!Number.isFinite(x))return null;
  let best=null,delta=Infinity;
  for(const el of svgStems){
   if(claimedStems.has(el)||typeof el.getBBox!=='function')continue;
   try{
    const b=el.getBBox();
    if(!Number.isFinite(b.x)||b.height<8||b.width>6)continue;
    const distance=Math.abs((b.x+b.width/2)-x);
    if(distance<delta){best=el;delta=distance;}
   }catch(_){ /* Some SVG engines cannot measure detached shapes. */ }
  }
  if(best&&delta<=3){claimedStems.add(best);return best;}
  return null;
 }
 voiceNotes.forEach((note,i)=>{
  const index=group[0].start+i;
  const el=(typeof note.getSVGElement==='function'?note.getSVGElement():null)||renderedGroups[i]||null;
  if(el){el.classList.add('sight-vex-note');el.dataset.sightIndex=String(index);}
  const stemEl=findDrawnStem(note);
  byIndex.push({index,el,stemEl,note,host:lineHost,errorFilterId,currentFilterId});
 });
 return {host:lineHost,entries:byIndex};
}
// A VexFlow beamed stem is a thin, independently drawn SVG stroke. Applying
// an SVG filter to that separate <g> can collapse its zero-width filter box,
// making the whole stem disappear. Color ONLY its original painted strokes.
// The shared .vf-beam graphic is never modified.
function colorSeparateStem(entry, color){
 const stem=entry.stemEl;
 if(!stem||!entry.el||entry.el.contains(stem))return;
 // Clean up a stale filter left by an earlier render/state if present.
 stem.style.removeProperty('filter');
 for(const shape of stem.querySelectorAll('path,line,polyline')){
  if(color)shape.style.setProperty('stroke',color,'important');
  else shape.style.removeProperty('stroke');
 }
}
function markCurrent(){
 const container=$('sight-score');
 // Color the engraved notehead/group as before, but recolor beamed stems via
 // their own CSS stroke rather than via a filter on a zero-width group.
 for(const entry of engravings.values()){
  const activeNote=entry.index===session.pos&&session.pos<20;
  const isWrongFlash=activeNote&&flashingIndex===entry.index;
  const filterId=isWrongFlash?entry.errorFilterId:(activeNote?entry.currentFilterId:null);
  if(entry.el){
   entry.el.classList.toggle('sight-note-current',activeNote&&!isWrongFlash);
   entry.el.classList.toggle('sight-note-error',isWrongFlash);
   if(filterId)entry.el.style.setProperty('filter',`url(#${filterId})`);
   else entry.el.style.removeProperty('filter');
  }
  colorSeparateStem(entry,isWrongFlash?'#db364f':(activeNote?'#199763':null));
 }
 const info=engravings.get(session.pos);
 if(!info)return;
 const rect=info.host.getBoundingClientRect(),outer=container.getBoundingClientRect();
 if(rect.top<outer.top+2)container.scrollTop+=rect.top-outer.top-3;
 else if(rect.bottom>outer.bottom-3)container.scrollTop+=rect.bottom-outer.bottom+3;
}
function flashCurrent(){
 const entry=engravings.get(session.pos);
 if(!entry?.el)return;
 if(flashTimer){clearTimeout(flashTimer);flashTimer=null;}
 flashingIndex=session.pos;
 markCurrent();
 flashTimer=setTimeout(()=>{
  flashingIndex=-1;
  flashTimer=null;
  markCurrent();
 },320);
}
async function renderScore(force=false){
 const container=$('sight-score');if(!container||!session)return;
 const token=++drawing;
 let vf;
 try{vf=await ensureEngraver();}catch(err){if(token===drawing){container.textContent='乐谱无法加载';$('sight-warning').textContent=err.message;}return;}
 if(token!==drawing||!session||!active)return;
 const width=Math.floor(container.getBoundingClientRect().width||container.clientWidth||340);
 const groups=session.bars.map(bar=>[bar]),signature=scoreLayoutSignature(groups,width);
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
async function playCorrectPitch(note){
 if(!note)return;
 const token=audio.token;
 try{
  const ctx=await audio.ready();
  const midi=noteMidi(note);
  const sample=await audio.piano(midi,true);
  if(token!==audio.token)return;
  audio.tone(sample,ctx.currentTime+.01,.85,.72,{attack:.01,hold:.71,floor:.0001,tail:.03});
 }catch(err){ console.error('Sight correct-note playback error:',err); }
}
function renderKeyboard(){
 const area=$('sight-keys');area.replaceChildren();
 for(let i=0;i<7;i++){
  const btn=document.createElement('button');btn.type='button';btn.className='sight-key sight-white';
  btn.textContent=NAMES[i];btn.dataset.semitone=String(WHITE_KEYS[i]);
  btn.disabled=busy||session.pos>=20;
  btn.addEventListener('click',()=>answer(WHITE_KEYS[i],false));area.append(btn);
 }
 for(const black of BLACK_KEYS){
  const btn=document.createElement('button');btn.type='button';btn.className='sight-key sight-black';
  btn.textContent=black.name;btn.dataset.semitone=String(black.semi);
  btn.style.left=`${black.boundary/7*100}%`;
  btn.disabled=busy||session.pos>=20;
  btn.addEventListener('click',()=>answer(black.semi,false));area.append(btn);
 }
}
function render(){
 if(!session)return;
 const finished=session.pos===20;
 const note=currentNote();
 if(note&&note.questionStartedAt==null){note.questionStartedAt=Date.now();save(SESSION_KEY,session);}
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
 const actualIndex=reviewUnit(n);
 if(outcome==='correct'){
   if(n.mistakeChosen===null){
     session.correct++;
     getReview(n.clef).record({actual:actualIndex,chosen:actualIndex,revealed:false,hinted:false,low:0,high:0,responseMs:n.responseMs});
   } else {
     const chosenIndex=recordChosenUnit(n,n.mistakeChosen);
     getReview(n.clef).record({actual:actualIndex,chosen:chosenIndex,revealed:false,hinted:false,low:0,high:0,responseMs:n.responseMs});
   }
   n.mistakeChosen=null;
   flashingIndex=-1;if(flashTimer){clearTimeout(flashTimer);flashTimer=null;}
   session.pos++; save(SESSION_KEY,session); busy=false; render(); return;
 }
 if(outcome==='reveal'){
   const chosenIndex=n.mistakeChosen===null?null:recordChosenUnit(n,n.mistakeChosen);
   getReview(n.clef).record({actual:actualIndex,chosen:chosenIndex,revealed:true,hinted:false,low:0,high:0,responseMs:n.responseMs});
   n.mistakeChosen=null;
   flashingIndex=-1;if(flashTimer){clearTimeout(flashTimer);flashTimer=null;}
   session.pos++; save(SESSION_KEY,session);
   busy=false;
   render();
 }
}
function answer(chosen,revealed){
 if(busy||!active||!session||session.pos>=20)return;
 const n=currentNote(); if(!n)return;
 if(n.responseMs===null||n.responseMs===undefined){
  n.responseMs=Math.max(0,Math.min(3600000,Date.now()-(Number.isFinite(n.questionStartedAt)?n.questionStartedAt:Date.now())));
  save(SESSION_KEY,session);
 }
 if(revealed){
   busy=true;
   const keys=[...$('sight-keys').querySelectorAll('button')];
   for(const key of keys){ key.disabled=true; if(Number(key.dataset.semitone)===noteSemitone(n)) key.classList.add('is-correct'); }
   pendingTimer=setTimeout(()=>{ commitNote('reveal'); if(pendingTimer){clearTimeout(pendingTimer); pendingTimer=null;} render(); },420);
   return;
 }
 if(chosen===noteSemitone(n)){
   busy=true;
   void playCorrectPitch(n);
   const keys=[...$('sight-keys').querySelectorAll('button')];
   for(const key of keys){ key.disabled=true; if(Number(key.dataset.semitone)===noteSemitone(n)) key.classList.add('is-correct'); }
   pendingTimer=setTimeout(()=>{ commitNote('correct'); if(pendingTimer){clearTimeout(pendingTimer); pendingTimer=null;} },280);
   return;
 }
 if(n.mistakeChosen===null){n.mistakeChosen=chosen;save(SESSION_KEY,session);}
 busy=true; blinkWrong();
}
function statistics(period,now){
 const sources=['treble','bass'].map(clef=>{
  const enabled=settings.clef==='both'||settings.clef===clef?candidateReviewUnits(clef):[];
  const stats=root.IntervalStats.readReview(review[clef],enabled,period,now);
  return {clef,stats,allDays:period==='all'?stats.trend:review[clef].statistics('all',now).trend};
 });
 function mergeDays(series){
  const days=new Map();
  for(const rows of series)for(const row of rows){
   const day=days.get(row.day)||{day:row.day,answered:0,correct:0};
   day.answered+=row.answered;day.correct+=row.correct;days.set(row.day,day);
  }
  return [...days.values()].sort((a,b)=>a.day.localeCompare(b.day));
 }
 const trend=mergeDays(sources.map(source=>source.stats.trend));
 const totals=Object.fromEntries(Object.keys(sources[0].stats.totals).map(key=>
  [key,sources.reduce((sum,source)=>sum+source.stats.totals[key],0)]));
 const byInterval=sources.flatMap(({clef,stats})=>Array.from({length:21},(_,i)=>{
  // Preserve the existing per-position grouping of natural, sharp and flat notes.
  const rows=stats.byInterval.slice(i*3,i*3+3);
  return {semi:i*3,clef,answered:rows.reduce((sum,row)=>sum+row.answered,0),
   correct:rows.reduce((sum,row)=>sum+row.correct,0)};
 }));
 const tagged=key=>sources.flatMap(({clef,stats})=>stats[key].map(row=>({...row,clef})));
 const {dayKey,addCalendarDays}=root.IntervalReview;
 const practiced=new Set(mergeDays(sources.map(source=>source.allDays)).filter(day=>day.answered>0).map(day=>day.day));
 let date=practiced.has(dayKey(now))?now:addCalendarDays(now,-1),streak=0;
 while(practiced.has(dayKey(date))){streak++;date=addCalendarDays(date,-1);}
 return {period,unit:'音符',label:(unit,clef)=>`${clef==='treble'?'高音谱号':'低音谱号'} · ${reviewLabel(clef,unit)}`,
  totals,byInterval,trend,last49:mergeDays(sources.map(source=>source.stats.last49)),
  practiceDays:trend.filter(day=>day.answered>0).length,streak,
  history:tagged('history').sort((a,b)=>b.at-a.at),
  confusions:tagged('confusions').sort((a,b)=>b.count-a.count),
  yesterdayWrong:tagged('yesterdayWrong'),due:sources.reduce((sum,source)=>sum+source.stats.due,0),
  storageAvailable:sources.every(source=>source.stats.storageAvailable)};
}
function clearHistory(){
 review.treble.reset();review.bass.reset();
}
function openStats(){ if($('sight-settings-dialog').open)$('sight-settings-dialog').close(); modules.showStatistics(definition.id); }
function openSettings(){ if(!active)return; $('sight-accidentals').checked=Boolean(settings.accidentals); for(const btn of document.querySelectorAll('.sight-clef-options button')){ const on=btn.dataset.clef===settings.clef;btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',String(on)); } $('sight-settings-dialog').showModal(); }
function enter(){
 if(!initialized)return;
 if(!session||!validatedSession(session))makeGroup();
 active=true; document.body.classList.add('module-active'); document.documentElement.classList.remove('practice-scroll-locked');
 $('home-screen').classList.add('hidden'); $('practice').classList.add('hidden'); $('practice-navigation').classList.remove('hidden'); $('practice-mode-title').textContent=definition.name; $('open-settings').classList.remove('hidden'); $('sight-practice').classList.remove('hidden'); $('sight-warning').textContent=''; render(); window.scrollTo(0,0);
}
function leave(){ if(!active)return; active=false; audio.stop(); document.body.classList.remove('module-active'); flashingIndex=-1;if(flashTimer){clearTimeout(flashTimer);flashTimer=null;} if($('sight-settings-dialog').open)$('sight-settings-dialog').close(); $('sight-practice').classList.add('hidden'); $('practice-navigation').classList.add('hidden'); $('open-settings').classList.add('hidden'); $('home-screen').classList.remove('hidden'); window.scrollTo(0,0); }
function backup(){return {treble:review.treble.snapshot(),bass:review.bass.snapshot(),settings:{clef:settings.clef,accidentals:Boolean(settings.accidentals)}};}
function convertReviewRange(clef,old){
 if(!old||old.cardRange===63)return old;
 const oldStart=OLD_POOL_START[clef], offset=oldStart-POOLS[clef][0];
 const scale=x=>(Number(x)+offset)*3;
 function transformFields(map){
  const out={};for(const [k,v] of Object.entries(map||{})){
   if(!/^\d+$/.test(k))continue;
   const ix=scale(k);if(ix>=0&&ix<=REVIEW_MAX)out[ix]=v;
  }return out;
 }
 const copy=JSON.parse(JSON.stringify(old));
 copy.cards=transformFields(old.cards);
 const confused={};for(const [key,value] of Object.entries(old.confusions||{})){
  const pair=key.split('>');if(pair.length!==2)continue;
  const x=scale(pair[0]),y=scale(pair[1]);if(x>=0&&x<=REVIEW_MAX&&y>=0&&y<=REVIEW_MAX)confused[`${x}>${y}`]=value;
 }copy.confusions=confused;
 for(const h of copy.history||[]){h.actual=scale(h.actual);if(h.chosen!==null)h.chosen=scale(h.chosen);}
 for(const d of Object.values(copy.daily||{}))d.intervals=transformFields(d.intervals);
 copy.cardRange=63;
 return copy;
}
function normalizeReview(clef,raw){
 return root.IntervalReview.normalizeStore(convertReviewRange(clef,raw),REVIEW_MAX);
}
function backupEntries(obj){
 if(obj.version!==3||!obj[definition.backupField])return [];
 const snapshot=obj[definition.backupField];
 const treble=normalizeReview('treble',snapshot.treble),bass=normalizeReview('bass',snapshot.bass);
 const config=snapshot.settings&&['treble','bass','both'].includes(snapshot.settings.clef)?
  {clef:snapshot.settings.clef,accidentals:snapshot.settings.accidentals===true}:{clef:'both',accidentals:false};
 return [[TREBLE_KEY,JSON.stringify(treble)],[BASS_KEY,JSON.stringify(bass)],[SETTINGS_KEY,JSON.stringify(config)]];
}
function migrateReviewRange(clef,key){
 const existing=getJson(key);
 if(!existing||existing.cardRange===63)return;
 if(storage.updateItem)storage.updateItem(key,raw=>raw?JSON.stringify(convertReviewRange(clef,JSON.parse(raw))):null);
 else save(key,convertReviewRange(clef,existing));
}
function init(){
 if(initialized)return;
 storage=root.IntervalPwaStorageAdapter;if(!storage)return;
 migrateReviewRange('treble',TREBLE_KEY); migrateReviewRange('bass',BASS_KEY);
 review={treble:root.IntervalReview.createReviewManager(storage,TREBLE_KEY,{maxIndex:REVIEW_MAX,responseSensitive:true}),
         bass:root.IntervalReview.createReviewManager(storage,BASS_KEY,{maxIndex:REVIEW_MAX,responseSensitive:true})};
 const existing=getJson(SETTINGS_KEY); if(['treble','bass','both'].includes(existing?.clef))settings.clef=existing.clef; settings.accidentals=existing?.accidentals===true;
 session=validatedSession(getJson(SESSION_KEY));
 $('sight-accidentals').addEventListener('change',e=>{settings.accidentals=e.target.checked;save(SETTINGS_KEY,settings);});
 $('sight-reveal').addEventListener('click',()=>answer(null,true));
 $('sight-next-set').addEventListener('click',()=>{makeGroup();render();});
 $('sight-close-settings').addEventListener('click',()=>$('sight-settings-dialog').close());
 $('sight-settings-done').addEventListener('click',()=>$('sight-settings-dialog').close());
 $('sight-open-stats').addEventListener('click',openStats);
 $('sight-abandon').addEventListener('click',()=>{ if(!confirm('重新开始当前20音练习？未完成的题目会被替换。'))return; makeGroup(); $('sight-settings-dialog').close(); render(); });
 $('sight-settings-dialog').addEventListener('click',e=>{ if(e.target===$('sight-settings-dialog'))e.target.close(); });
 function openSettingsRefresh(){ for(const b of document.querySelectorAll('.sight-clef-options button')){ const on=b.dataset.clef===settings.clef; b.classList.toggle('active',on); b.setAttribute('aria-pressed',String(on)); } }
 for(const btn of document.querySelectorAll('.sight-clef-options button'))btn.addEventListener('click',()=>{ settings.clef=btn.dataset.clef; save(SETTINGS_KEY,settings); openSettingsRefresh(); });
 modules.register(definition.id,{enter,leave,openSettings,isActive:()=>active,backup,backupEntries,clearHistory,statistics});
 initialized=true;
}
root.SightTrainer={enter,leave,openSettings,isActive:()=>active,backup,showStats:openStats,
 isStatsActive:()=>modules.statisticsMode===definition.id,clearHistory,normalizeReview};
if(root.IntervalAppReady)init(); else root.addEventListener('interval-trainer-ready',init,{once:true});
})(window);
