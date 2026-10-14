/* Five-line staff sight-reading module, v2.7. Uses native VexFlow SVG note glyphs for feedback. */
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
 treble:[...Array.from({length:21},(_,i)=>24+i)],
 bass:[...Array.from({length:21},(_,i)=>12+i)]
};
const CLEF_BASE={treble:30,bass:18};
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
let initialized=false, pendingTimer=null, flashTimer=null;
let drawing=0, lastLayoutWidth=0, resizeTimer=null;
const engravings=new Map();
const LAYOUT={minNote:34, firstBarExtra:60, otherBarExtra:10, maxPerLine:9};
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
  const clef=bar.clef, pool=POOLS[clef], candidates=pool.map((_,i)=>i);
  const last=notes.at(-1), previous=last?.clef===clef?last.index-pool[0]:null;
  const eligible=candidateReviewUnits(clef);
  const chosen=getReview(clef).choose(eligible,previous===null?null:previous*3);
  const selected=chosen===null?eligible[random(eligible.length)]:chosen;
  const index=pool[Math.floor(selected/3)],alter=selected%3;
  notes.push({clef,letter:letterFromIndex(index),index,alter,duration,result:null,mistakeChosen:null});
 }
 session={version:4,pos:0,notes,bars,startedAt:Date.now(),correct:0};
 engravings.clear();save(SESSION_KEY,session);
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
     ![.25,.5,1,1.5,2].includes(n.duration)))return null;
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
 const stave=new VF.Stave(8,45,w-16).addClef(clef);
 const voiceNotes=[],barSlices=[];
 for(const bar of group){
  const bNotes=[];
  for(let i=bar.start;i<bar.end;i++){
   const n=session.notes[i];
   const note=new VF.StaveNote({keys:[noteKey(n.index,n.alter)],duration:DURATION_CODES[String(n.duration)],clef});
   if(n.alter){
     const accidental=new VF.Accidental(ACCIDENTALS[n.alter]);
     note.addModifier(accidental,0);
   }
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
 // The selection rectangle lives INSIDE the same SVG as the engraved notes.
 // This ensures it follows VexFlow coordinates during responsive SVG scaling.
 const svg=lineHost.querySelector('svg');
 if(!svg)throw Error('VexFlow SVG 未生成');
 const ns='http://www.w3.org/2000/svg';
 const filterId=`sight-error-ink-${group[0].start}`;
 const defs=document.createElementNS(ns,'defs');
 const filter=document.createElementNS(ns,'filter');
 for(const [name,value] of Object.entries({id:filterId,x:'-35%',y:'-35%',width:'170%',height:'170%','color-interpolation-filters':'sRGB'})) filter.setAttribute(name,value);
 const matrix=document.createElementNS(ns,'feColorMatrix');
 matrix.setAttribute('type','matrix');
 // Recolor black ink red while keeping whites white and transparent parts transparent.
 // Consequently hollow noteheads retain their hollow centers during the flash.
 matrix.setAttribute('values','0.14 0 0 0 0.86  0 0.79 0 0 0.21  0 0 0.69 0 0.31  0 0 0 1 0');
 filter.append(matrix);defs.append(filter);svg.prepend(defs);
 const highlight=document.createElementNS(ns,'rect');
 highlight.setAttribute('class','sight-position-highlight');
 highlight.setAttribute('rx','7');
 highlight.setAttribute('ry','7');
 svg.insertBefore(highlight,defs.nextSibling);
 const byIndex=[];
 const renderedGroups=[...svg.querySelectorAll('.vf-stavenote')];
 voiceNotes.forEach((note,i)=>{
  const index=group[0].start+i;
  // Use the original SVG group generated by VexFlow; no duplicate/red notehead.
  const el=(typeof note.getSVGElement==='function'?note.getSVGElement():null)||renderedGroups[i]||null;
  if(el){el.classList.add('sight-vex-note');el.dataset.sightIndex=String(index);}
  // VexFlow draws stems of beamed notes in its Beam pass; attach to that
  // genuine SVG stem element too when the engine exposes it.
  const stem=note.getStem?.();
  const stemEl=stem?.getSVGElement?.()||null;
  byIndex.push({index,el,stemEl,note,host:lineHost,highlight,filterId});
 });
 return {host:lineHost,entries:byIndex};
}
function unionBounds(b,x1,y1,x2,y2){
 if(![x1,y1,x2,y2].every(Number.isFinite))return b;
 const lowX=Math.min(x1,x2),highX=Math.max(x1,x2);
 const lowY=Math.min(y1,y2),highY=Math.max(y1,y2);
 if(!b)return {x:lowX,y:lowY,right:highX,bottom:highY};
 return {x:Math.min(b.x,lowX),y:Math.min(b.y,lowY),right:Math.max(b.right,highX),bottom:Math.max(b.bottom,highY)};
}
function noteInkBounds(entry){
 // VexFlow .vf-note comprises the original notehead, stem and flag.
 // For beamed notes the beam engine sometimes draws the stem in a sibling
 // group, so additionally union the note's computed stem extents.
 const glyph=entry.el?.querySelector?.('.vf-note')||entry.el;
 let b=null;
 if(glyph&&typeof glyph.getBBox==='function'){
  try{
   const box=glyph.getBBox();
   if([box.x,box.y,box.width,box.height].every(Number.isFinite) && box.width>0 && box.height>0)
    b=unionBounds(b,box.x,box.y,box.x+box.width,box.y+box.height);
  }catch(_){ /* Hidden or not-yet-attached SVG: use VexFlow note geometry. */ }
 }
 const n=entry.note;
 const cx=n.getAbsoluteX?.(),cy=n.getYs?.()?.[0];
 if(Number.isFinite(cx)&&Number.isFinite(cy))b=unionBounds(b,cx-8,cy-5.5,cx+8,cy+5.5);
 try{
  const stem=n.getStemExtents?.(),stemX=n.getStemX?.();
  if(stem&&Number.isFinite(stemX))b=unionBounds(b,stemX-1.1,stem.topY,stemX+1.1,stem.baseY);
 }catch(_){ }
 return b;
}
function markCurrent(){
 const container=$('sight-score');
 for(const indicator of container.querySelectorAll('.sight-position-highlight')) indicator.classList.remove('visible');
 const info=engravings.get(session.pos);
 if(!info)return;
 const bounds=noteInkBounds(info);
 if(bounds){
   // Compact padding around the ACTUAL engraved geometry, not a fixed-height column.
   const px=6,py=5;
   const marker=info.highlight;
   marker.setAttribute('x',String(bounds.x-px));
   marker.setAttribute('y',String(bounds.y-py));
   marker.setAttribute('width',String(Math.max(20,bounds.right-bounds.x+px*2)));
   marker.setAttribute('height',String(Math.max(18,bounds.bottom-bounds.y+py*2)));
   marker.classList.add('visible');
 }
 const rect=info.host.getBoundingClientRect(),outer=container.getBoundingClientRect();
 if(rect.top<outer.top+2)container.scrollTop+=rect.top-outer.top-3;
 else if(rect.bottom>outer.bottom-3)container.scrollTop+=rect.bottom-outer.bottom+3;
}
function flashCurrent(){
 const entry=engravings.get(session.pos);
 if(!entry?.el)return;
 if(flashTimer){clearTimeout(flashTimer);flashTimer=null;}
 // Apply a color filter to the REAL VexFlow note group (not an overlaid ellipse).
 const originals=[entry.el];
 if(entry.stemEl && entry.stemEl!==entry.el && !entry.el.contains(entry.stemEl))originals.push(entry.stemEl);
 const prior=originals.map(element=>({element,filter:element.style.getPropertyValue('filter'),priority:element.style.getPropertyPriority('filter')}));
 for(const {element} of prior){
  element.classList.add('sight-note-error');
  element.style.setProperty('filter',`url(#${entry.filterId})`);
 }
 flashTimer=setTimeout(()=>{
  for(const {element,filter,priority} of prior){
   element.classList.remove('sight-note-error');
   if(filter)element.style.setProperty('filter',filter,priority);
   else element.style.removeProperty('filter');
  }
  flashTimer=null;
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
async function getAudioContext(){
 if(!window.AudioContext && !window.webkitAudioContext) throw Error('当前浏览器不支持 Web Audio');
 if(!audioCtx){ audioCtx=new (window.AudioContext||window.webkitAudioContext)(); audioGain=audioCtx.createGain(); audioGain.gain.value=.42; audioGain.connect(audioCtx.destination); }
 if(audioCtx.state==='suspended') await audioCtx.resume();
 return audioCtx;
}
async function loadSample(midi){
 const anchor=clamp(midi,36,96); const key=String(anchor);
 if(buffers.has(key)) return {buffer:buffers.get(key), rate:Math.pow(2,(midi-anchor)/12)};
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
 try{ const buffer=await loading.get(key); buffers.set(key,buffer); return {buffer,rate:Math.pow(2,(midi-anchor)/12)}; }
 finally{ loading.delete(key); }
}
function scheduleTone(sample,at,duration,gainMultiplier=.7){
 const src=audioCtx.createBufferSource(); src.buffer=sample.buffer; src.playbackRate.value=sample.rate||1;
 const g=audioCtx.createGain();
 g.gain.setValueAtTime(0,at); g.gain.linearRampToValueAtTime(gainMultiplier,at+.01); g.gain.setValueAtTime(gainMultiplier,at+Math.max(.02,duration-.14)); g.gain.linearRampToValueAtTime(.0001,at+duration);
 src.connect(g); g.connect(audioGain); src.start(at); src.stop(at+duration+.03);
 src.onended=()=>{ try{src.disconnect(); g.disconnect();}catch{} };
}
async function playCorrectPitch(note){
 if(!note)return;
 try{
  const ctx=await getAudioContext();
  const midi=noteMidi(note);
  const sample=await loadSample(midi);
  scheduleTone(sample,ctx.currentTime+.01,.85,.72);
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
     getReview(n.clef).record({actual:actualIndex,chosen:actualIndex,revealed:false,hinted:false,low:0,high:0,responseMs:null});
   } else {
     const chosenIndex=recordChosenUnit(n,n.mistakeChosen);
     getReview(n.clef).record({actual:actualIndex,chosen:chosenIndex,revealed:false,hinted:false,low:0,high:0,responseMs:null});
   }
   n.mistakeChosen=null;
   session.pos++; save(SESSION_KEY,session); busy=false; render(); return;
 }
 if(outcome==='reveal'){
   const chosenIndex=n.mistakeChosen===null?null:recordChosenUnit(n,n.mistakeChosen);
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
   for(let i=0;i<21;i++){const rows=s.byInterval.slice(i*3,i*3+3);const answered=rows.reduce((sum,n)=>sum+(n?.answered||0),0),correct=rows.reduce((sum,n)=>sum+(n?.correct||0),0);section.append(statRow(pitchLabel(title==='高音谱号'?'treble':'bass',i),answered,correct));}
   container.append(section);
 }
 const daily=new Map();
 for(const source of [t,b])for(const row of source.trend){ const d=daily.get(row.day)||{answered:0,correct:0}; d.answered+=row.answered;d.correct+=row.correct;daily.set(row.day,d); }
 const dates=[...daily.keys()].sort().slice(-7);
 if(dates.length){ const section=document.createElement('section');section.className='stats-panel'; section.append(Object.assign(document.createElement('h3'),{textContent:'最近练习'})); for(const date of dates){const d=daily.get(date);section.append(statRow(date.slice(5),d.answered,d.correct));} container.append(section); }
 const recent=[...t.history.map(h=>({...h,clef:'高音谱号'})),...b.history.map(h=>({...h,clef:'低音谱号'}))].sort((a,b)=>b.at-a.at).slice(0,10);
 if(recent.length){ const section=document.createElement('section');section.className='stats-panel'; section.append(Object.assign(document.createElement('h3'),{textContent:'最近答题'})); for(const h of recent){ const row=document.createElement('div');row.className='sight-confusion'; const wrong=h.revealed||h.actual!==h.chosen; const clef=h.clef==='高音谱号'?'treble':'bass'; const name=`${h.clef} · ${reviewLabel(clef,h.actual)}`; const chosen=h.revealed?'显示答案':wrong?`→ ${reviewLabel(clef,h.chosen)}`:'✓'; row.append(Object.assign(document.createElement('span'),{textContent:name}),Object.assign(document.createElement('strong'),{textContent:chosen})); section.append(row);} container.append(section); }
 const confused=[];
 for(const [clef,r] of [['高音谱号',review.treble],['低音谱号',review.bass]]){ for(const c of r.analysis(Array.from({length:63},(_,i)=>i)).confusions.slice(0,8))confused.push({label:`${clef} · ${reviewLabel(clef==='高音谱号'?'treble':'bass',c.actual)} → ${reviewLabel(clef==='高音谱号'?'treble':'bass',c.chosen)}`,count:c.count}); }
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
function openSettings(){ if(!active)return; $('sight-accidentals').checked=Boolean(settings.accidentals); for(const btn of document.querySelectorAll('.sight-clef-options button')){ const on=btn.dataset.clef===settings.clef;btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',String(on)); } $('sight-settings-dialog').showModal(); }
function enter(){
 if(!initialized)return;
 if(!session||!validatedSession(session))makeGroup();
 active=true; document.documentElement.classList.remove('practice-scroll-locked');
 $('home-screen').classList.add('hidden'); $('practice').classList.add('hidden'); $('practice-navigation').classList.remove('hidden'); $('practice-mode-title').textContent='五线谱识谱'; $('open-settings').classList.remove('hidden'); $('sight-practice').classList.remove('hidden'); $('back-home').onclick=e=>{e.stopImmediatePropagation();leave();}; $('sight-warning').textContent=''; render(); window.scrollTo(0,0);
}
function leave(){ if(!active)return; active=false; if($('sight-settings-dialog').open)$('sight-settings-dialog').close(); $('sight-practice').classList.add('hidden'); $('practice-navigation').classList.add('hidden'); $('open-settings').classList.add('hidden'); $('home-screen').classList.remove('hidden'); $('back-home').onclick=null; window.scrollTo(0,0); }
function backup(){return {treble:review.treble.snapshot(),bass:review.bass.snapshot(),settings:{clef:settings.clef,accidentals:Boolean(settings.accidentals)}};}
function migrateReviewRange(clef,key){
 const old=getJson(key);
 if(!old||old.cardRange===63)return;
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
 save(key,copy);
}
function init(){
 if(initialized)return;
 storage=root.IntervalPwaStorageAdapter;if(!storage)return;
 migrateReviewRange('treble',TREBLE_KEY); migrateReviewRange('bass',BASS_KEY);
 review={treble:root.IntervalReview.createReviewManager(storage,TREBLE_KEY,{maxIndex:REVIEW_MAX}),
         bass:root.IntervalReview.createReviewManager(storage,BASS_KEY,{maxIndex:REVIEW_MAX})};
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
 $('stats-sight').addEventListener('click',()=>switchStats(true));
 for(const id of ['stats-harmonic','stats-melodic']) $(''+id).addEventListener('click',()=>switchStats(false));
 $('close-stats').addEventListener('click',()=>switchStats(false));
 $('stats-dialog').addEventListener('close',()=>switchStats(false));
 initialized=true;
}
root.SightTrainer={enter,leave,openSettings,isActive:()=>active,backup,showStats:openStats};
if(root.IntervalAppReady)init(); else root.addEventListener('interval-trainer-ready',init,{once:true});
})(window);
