/* Five-line staff sight-reading module, v2.4. Shares IndexedDB and review engine. */
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
const RHYTHMS=[
 [1,1,1,.5,.5], [.5,.5,1,1,1], [1,.5,.5,1,1], [1,1,.5,.5,1],
 [.5,.5,.5,.5,2], [2,.5,.5,.5,.5], [1.5,.5,1,.5,.5],
 [1,.5,.5,.5,1.5], [.25,.25,.5,1,2], [2,1,.5,.25,.25]
];
const POOLS={
 treble:[...Array.from({length:13},(_,i)=>28+i)],
 bass:[...Array.from({length:13},(_,i)=>17+i)]
};
const CLEF_BASE={treble:30,bass:18};
const SEMI=[0,2,4,5,7,9,11];
let storage, review, settings={clef:'both'}, session=null, active=false, busy=false;
let initialized=false, pendingTimer=null, flashWrongPos=-1;
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
function makeClefs(){ if(settings.clef!=='both')return Array(4).fill(settings.clef); return shuffle(['treble','treble','bass','bass']); }
function makeGroup(){
 const notes=[];
 for(const clef of makeClefs()){
  const rhythm=RHYTHMS[random(RHYTHMS.length)];
  for(let k=0;k<5;k++){
   const pool=POOLS[clef];
   const candidates=pool.map((_,i)=>i);
   const previous=notes.length&&notes[notes.length-1].clef===clef?notes[notes.length-1].index-pool[0]:null;
   const chosen=getReview(clef).choose(candidates,previous);
   const noteIndex=pool[chosen===null?random(candidates.length):chosen];
   const letter=letterFromIndex(noteIndex);
   notes.push({clef,letter,index:noteIndex,duration:rhythm[k],mistakeChosen:null});
  }
 }
 session={version:2,pos:0,notes,startedAt:Date.now(),correct:0};
 save(SESSION_KEY,session);
}
function validatedSession(x){
 if(!x||!Number.isInteger(x.pos)||x.pos<0||x.pos>20||!Array.isArray(x.notes)||x.notes.length!==20||!Number.isInteger(x.correct))return null;
 for(let row=0;row<4;row++){
  const clef=x.notes[row*5]?.clef;
  if(!['treble','bass'].includes(clef))return null;
  for(const n of x.notes.slice(row*5,row*5+5)){
   if(!n||n.clef!==clef||!Number.isInteger(n.index)||!POOLS[clef].includes(n.index)||n.letter!==letterFromIndex(n.index))return null;
  }
 }
 x.version=2;
 return x;
}
function svgEl(tag,attrs={},text){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e;}
function line(parent,x1,y1,x2,y2,extras={}){parent.append(svgEl('line',{x1,y1,x2,y2,...extras}));}
function drawClef(svg,clef){
 const g=svgEl('g',{fill:'#27282f',transform:clef==='treble'?'translate(16 95) scale(.054 -.054)':'translate(14 101) scale(.068 -.068)'});
 g.append(svgEl('path',{d:PATHS[clef]}));svg.append(g);
}
function addLedger(svg,x,y){
 if(y>87){for(let ly=99;ly<=y+1;ly+=12)line(svg,x-14,ly,x+14,ly,{stroke:'#4b4d56','stroke-width':1.2});}
 if(y<39){for(let ly=27;ly>=y-1;ly-=12)line(svg,x-14,ly,x+14,ly,{stroke:'#4b4d56','stroke-width':1.2});}
}
function shortGroupInfo(notes, start, end, positions){
 const ys=positions.slice(start,end+1).map(p=>p.y);
 const meanY=ys.reduce((a,b)=>a+b,0)/ys.length;
 const down=meanY<63;
 const rawFirst=ys[0]+(down?32:-32), rawLast=ys[ys.length-1]+(down?32:-32);
 const x1=positions[start].x+(down?-8:8), x2=positions[end].x+(down?-8:8);
 const slope=clamp((rawLast-rawFirst)/(x2-x1||1),-.22,.22);
 const mid=(rawFirst+rawLast)/2;
 const base=clamp(mid,(down?54:18),(down?92:56));
 const intercept=base-slope*((x1+x2)/2);
 const stemYAt=x=>intercept+slope*x;
 return {start,end,down,stemYAt};
}
function drawFlag(svg,x,y,down,doubleFlag,color){
 const d1=down
  ? `M ${x} ${y} C ${x+2} ${y+8}, ${x+12} ${y+10}, ${x+14} ${y+19} C ${x+9} ${y+14}, ${x+4} ${y+13}, ${x} ${y+15}`
  : `M ${x} ${y} C ${x+2} ${y-8}, ${x+12} ${y-10}, ${x+14} ${y-19} C ${x+9} ${y-14}, ${x+4} ${y-13}, ${x} ${y-15}`;
 svg.append(svgEl('path',{d:d1,fill:'none',stroke:color,'stroke-width':2.5,'stroke-linecap':'round'}));
 if(doubleFlag){
  const shift=down?8:-8;
  const d2=down
   ? `M ${x} ${y+shift} C ${x+2} ${y+shift+8}, ${x+12} ${y+shift+10}, ${x+14} ${y+shift+19} C ${x+9} ${y+shift+14}, ${x+4} ${y+shift+13}, ${x} ${y+shift+15}`
   : `M ${x} ${y+shift} C ${x+2} ${y+shift-8}, ${x+12} ${y+shift-10}, ${x+14} ${y+shift-19} C ${x+9} ${y+shift-14}, ${x+4} ${y+shift-13}, ${x} ${y+shift-15}`;
  svg.append(svgEl('path',{d:d2,fill:'none',stroke:color,'stroke-width':2.3,'stroke-linecap':'round'}));
 }
}
function renderSystem(notes,rowIndex){
 const svg=svgEl('svg',{viewBox:'0 0 444 126',role:'img','aria-label':`第${rowIndex+1}行 ${CH_NAME[notes[0].clef]}`});
 const clef=notes[0].clef;
 svg.classList.add('sight-staff');
 for(let n=0;n<5;n++)line(svg,64,39+12*n,430,39+12*n,{stroke:'#52535b','stroke-width':1.35});
 line(svg,429,39,429,87,{stroke:'#52535b','stroke-width':1.6});
 drawClef(svg,clef);
 const positions=notes.map((note,k)=>({x:111+k*62,y:87-(note.index-CLEF_BASE[clef])*6}));
 const shortGroups=[];
 for(let k=0;k<notes.length;){
  if(![.5,.25].includes(notes[k].duration)){k++;continue;}
  let end=k;
  while(end+1<notes.length && [.5,.25].includes(notes[end+1].duration))end++;
  shortGroups.push(shortGroupInfo(notes,k,end,positions));
  k=end+1;
 }
 const groupByNote=new Map();
 for(const info of shortGroups)for(let i=info.start;i<=info.end;i++)groupByNote.set(i,info);
 const stemMeta=notes.map((note,k)=>{
  const pos=positions[k], info=groupByNote.get(k);
  if(info){
   const stemX=pos.x+(info.down?-8:8); return {down:info.down, stemX, stemEndY:info.stemYAt(stemX), group:info};
  }
  const down=pos.y<63; const stemX=pos.x+(down?-8:8); const stemEndY=pos.y+(down?32:-32); return {down,stemX,stemEndY,group:null};
 });
 notes.forEach((note,k)=>{
  const {x,y}=positions[k], meta=stemMeta[k], idx=rowIndex*5+k;
  const current=idx===session.pos;
  const wrongFlash=idx===flashWrongPos;
  if(current){
    svg.append(svgEl('rect',{x:x-20,y:8,width:40,height:108,rx:9,fill:wrongFlash?'#f4c4cc':'#bfe9d2','fill-opacity':wrongFlash?'.72':'.78',stroke:wrongFlash?'#c85b70':'#52b389','stroke-width':wrongFlash?2.1:1.8}));
  }
  addLedger(svg,x,y);
  const color=wrongFlash?'#ba415b':'#26272d';
  const filled=note.duration!==2;
  svg.append(svgEl('ellipse',{cx:x,cy:y,rx:9.2,ry:6.2,fill:filled?color:'transparent',stroke:color,'stroke-width':1.9,transform:`rotate(-18 ${x} ${y})`}));
  if(note.duration!==2||note.duration===2){
    line(svg,meta.stemX,y,meta.stemX,meta.stemEndY,{stroke:color,'stroke-width':1.9,'stroke-linecap':'round'});
  }
  if(note.duration===1.5)svg.append(svgEl('circle',{cx:x+15,cy:y-3,r:2.5,fill:color}));
  if([.5,.25].includes(note.duration) && (!meta.group || meta.group.start===meta.group.end)){
    drawFlag(svg,meta.stemX,meta.stemEndY,meta.down,note.duration===.25,color);
  }
 });
 const done=new Set();
 for(const info of shortGroups){
  const key=`${info.start}-${info.end}`; if(done.has(key))continue; done.add(key);
  if(info.end<=info.start)continue;
  const color='#26272d'; const beamThick=5;
  const beamPoly=[];
  const sx=stemMeta[info.start].stemX, ex=stemMeta[info.end].stemX;
  const sy=info.stemYAt(sx), ey=info.stemYAt(ex);
  const shift=info.down?-beamThick:beamThick;
  beamPoly.push(`M${sx} ${sy} L${ex} ${ey} L${ex} ${ey+shift} L${sx} ${sy+shift} Z`);
  svg.append(svgEl('path',{d:beamPoly[0],fill:color}));
  let segStart=null;
  for(let i=info.start;i<=info.end;i++){
    if(notes[i].duration===.25){ if(segStart===null)segStart=i; }
    else if(segStart!==null){
      const s=segStart, e=i-1;
      if(e>s){
        const x1=stemMeta[s].stemX, x2=stemMeta[e].stemX, y1=info.stemYAt(x1)+(info.down?-8:8), y2=info.stemYAt(x2)+(info.down?-8:8), sh=info.down?-4:4;
        svg.append(svgEl('path',{d:`M${x1} ${y1} L${x2} ${y2} L${x2} ${y2+sh} L${x1} ${y1+sh} Z`,fill:color}));
      } else {
        drawFlag(svg,stemMeta[s].stemX,info.stemYAt(stemMeta[s].stemX)+(info.down?-8:8),info.down,true,color);
      }
      segStart=null;
    }
  }
  if(segStart!==null){
    const s=segStart, e=info.end;
    if(e>s){
      const x1=stemMeta[s].stemX, x2=stemMeta[e].stemX, y1=info.stemYAt(x1)+(info.down?-8:8), y2=info.stemYAt(x2)+(info.down?-8:8), sh=info.down?-4:4;
      svg.append(svgEl('path',{d:`M${x1} ${y1} L${x2} ${y2} L${x2} ${y2+sh} L${x1} ${y1+sh} Z`,fill:color}));
    } else {
      drawFlag(svg,stemMeta[s].stemX,info.stemYAt(stemMeta[s].stemX)+(info.down?-8:8),info.down,true,color);
    }
  }
 }
 return svg;
}
function renderScore(){
 const container=$('sight-score'); const oldScroll=container.scrollTop;
 container.replaceChildren();
 for(let row=0;row<4;row++)container.append(renderSystem(session.notes.slice(row*5,row*5+5),row));
 container.scrollTop=oldScroll;
 const row=Math.min(3,Math.floor(session.pos/5));
 requestAnimationFrame(()=>{
  const target=container.children[row]; if(!target)return;
  const outer=container.getBoundingClientRect(), rect=target.getBoundingClientRect();
  if(rect.bottom>outer.bottom-4||rect.top<outer.top+4) container.scrollTop+=rect.top-outer.top-7;
 });
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
  const note=currentNote();
  let midi=60+SEMI[letter];
  if(note){
    const guessPos=nearestChosenPosition(note.clef,note.index,letter);
    midi=diatonicToMidi(POOLS[note.clef][guessPos]);
  }
  const sample=await loadSample(midi);
  scheduleTone(sample,ctx.currentTime+.01,.92,.72);
 }catch(err){ console.error('Sight key playback error:',err); }
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
 renderScore(); renderKeyboard();
 $('sight-reveal').classList.toggle('hidden',finished); $('sight-reveal').disabled=busy;
 $('sight-keys').classList.toggle('hidden',finished);
 $('sight-complete').classList.toggle('hidden',!finished);
 if(finished)$('sight-complete-score').textContent=`${session.correct} / 20  ·  ${Math.round(100*session.correct/20)}%`;
}
function blinkWrong(){
 if(pendingTimer) clearTimeout(pendingTimer);
 flashWrongPos=session.pos; render();
 pendingTimer=setTimeout(()=>{ flashWrongPos=-1; pendingTimer=null; busy=false; render(); },340);
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
