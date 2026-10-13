/* Five-line staff sight-reading module, v2.3. No framework; shares IndexedDB and review engine. */
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
 treble:[...Array.from({length:13},(_,i)=>28+i)], // C4 to A5 (diatonic)
 bass:[...Array.from({length:13},(_,i)=>17+i)] // F2 to D4
};
const CLEF_BASE={treble:30,bass:18};
let storage, review, settings={clef:'both'}, session=null, active=false, busy=false;
let initialized=false, pendingTimer=null;
const random=(n)=>Math.floor(Math.random()*n);
const shuffle=(arr)=>{const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=random(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
function letterFromIndex(i){return ((i%7)+7)%7;}
function pitchLabel(clef,id){
 const n=POOLS[clef][id];return n===undefined?'—':NAMES[letterFromIndex(n)]+Math.floor(n/7);
}
function nearestChosenPosition(clef,actualIndex,letter){
 const pool=POOLS[clef];
 return pool.map((n,i)=>({n,i})).filter(o=>letterFromIndex(o.n)===letter)
   .sort((a,b)=>Math.abs(a.n-actualIndex)-Math.abs(b.n-actualIndex))[0].i;
}
function getJson(key){try {return JSON.parse(storage.getItem(key)||'null');}catch{return null;}}
function save(key,item){try{storage.setItem(key,JSON.stringify(item));}catch(err){console.error(err);$('sight-warning').textContent='学习记录保存失败';}}
function getReview(clef){return clef==='bass'?review.bass:review.treble;}
function currentNote(){return session && session.pos<20 ? session.notes[session.pos] : null;}
function makeClefs(){
 if(settings.clef!=='both')return Array(4).fill(settings.clef);
 return shuffle(['treble','treble','bass','bass']);
}
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
   notes.push({clef,letter,index:noteIndex,duration:rhythm[k],result:null});
  }
 }
 session={version:1,pos:0,notes,startedAt:Date.now(),correct:0};
 save(SESSION_KEY,session);
}
function validatedSession(x){
 if(!x||x.version!==1||!Number.isInteger(x.pos)||x.pos<0||x.pos>20||!Array.isArray(x.notes)||x.notes.length!==20)return null;
 for(let row=0;row<4;row++){
  const clef=x.notes[row*5]?.clef;
  if(!['treble','bass'].includes(clef))return null;
  for(const n of x.notes.slice(row*5,row*5+5)){
   if(!n||n.clef!==clef||!Number.isInteger(n.index)||!POOLS[clef].includes(n.index)||n.letter!==letterFromIndex(n.index)||!RHYTHMS.some(p=>p.includes(n.duration))||![null,'correct','wrong'].includes(n.result))return null;
  }
 }
 return x;
}
function svgEl(tag,attrs={},text){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e;}
function line(parent,x1,y1,x2,y2,extras={}){parent.append(svgEl('line',{x1,y1,x2,y2,...extras}));}
function drawClef(svg,clef){
 const g=svgEl('g',{fill:'#27282f',transform:clef==='treble'?'translate(19 96) scale(.057 -.057)':'translate(19 104) scale(.072 -.072)'});
 g.append(svgEl('path',{d:PATHS[clef]}));svg.append(g);
}
function renderSystem(notes,rowIndex){
 const svg=svgEl('svg',{viewBox:'0 0 444 128',role:'img','aria-label':`第${rowIndex+1}行 ${CH_NAME[notes[0].clef]}`});
 const clef=notes[0].clef;
 svg.classList.add('sight-staff');
 const paper=svgEl('rect',{x:1,y:1,width:442,height:126,rx:12,fill:'#f6f5f0'});svg.append(paper);
 for(let n=0;n<5;n++)line(svg,65,39+12*n,430,39+12*n,{stroke:'#52535b','stroke-width':1.35});
 line(svg,429,39,429,87,{stroke:'#52535b','stroke-width':1.6});
 drawClef(svg,clef);
 const positions=[];
 const stemDirections=notes.map((note,k)=>{
   if(![.5,.25].includes(note.duration))return 87-(note.index-CLEF_BASE[clef])*6<63;
   let start=k,end=k;
   while(start>0&&[.5,.25].includes(notes[start-1].duration))start--;
   while(end<4&&[.5,.25].includes(notes[end+1].duration))end++;
   const meanY=notes.slice(start,end+1).reduce((sum,n)=>sum+87-(n.index-CLEF_BASE[clef])*6,0)/(end-start+1);
   return meanY<63;
 });
 notes.forEach((note,k)=>{
  const x=111+k*62, y=87-(note.index-CLEF_BASE[clef])*6;
  positions.push({x,y});
  const idx=rowIndex*5+k;
  if(idx===session.pos){
   svg.append(svgEl('rect',{x:x-22,y:7,width:44,height:110,rx:9,fill:'#99e8c9','fill-opacity':'.65',stroke:'#45ad83','stroke-width':1.8}));
  } else if(note.result){
   svg.append(svgEl('rect',{x:x-19,y:12,width:38,height:105,rx:8,fill:note.result==='correct'?'#b4e8d0':'#f6b6bc','fill-opacity':'.5'}));
  }
  if(y>87){for(let ly=99;ly<=y+1;ly+=12)line(svg,x-14,ly,x+14,ly,{stroke:'#3a3b42','stroke-width':1.3});}
  if(y<39){for(let ly=27;ly>=y-1;ly-=12)line(svg,x-14,ly,x+14,ly,{stroke:'#3a3b42','stroke-width':1.3});}
  const filled=note.duration!==2;
  const down=stemDirections[k], stemX=x+(down?-9:9), endY=y+(down?31:-33);
  const color='#26272d';
  const head=svgEl('ellipse',{cx:x,cy:y,rx:9.2,ry:6.2,fill:filled?color:'#f6f5f0',stroke:color,'stroke-width':1.8,transform:`rotate(-18 ${x} ${y})`});
  svg.append(head);
  line(svg,stemX,y,stemX,endY,{stroke:color,'stroke-width':1.9});
  if(note.duration===.5||note.duration===.25){
    const next=notes[k+1];
    const pairPrev=k>0&&[.5,.25].includes(notes[k-1].duration);
    const pairNext=next&&[.5,.25].includes(next.duration);
    if(!pairNext&&!pairPrev){
      const d=down?`M ${stemX} ${endY} q -1 -12 14 -17 q -8 13 -12 20`:`M ${stemX} ${endY} q 19 9 11 23 q -4 7 -10 8`;
      svg.append(svgEl('path',{d,fill:'none',stroke:color,'stroke-width':3,'stroke-linecap':'round'}));
      if(note.duration===.25)svg.append(svgEl('path',{d:down?`M ${stemX} ${endY+8} q 10 -9 14 -15`:`M ${stemX} ${endY+8} q 12 5 10 19`,fill:'none',stroke:color,'stroke-width':2.6}));
    }
  }
  if(note.duration===1.5)svg.append(svgEl('circle',{cx:x+15,cy:y-3,r:2.5,fill:color}));
 });
 // Repeated short durations are beamed, matching common rhythmic groupings.
 for(let k=0;k<notes.length-1;k++){
  if(![.5,.25].includes(notes[k].duration)||![.5,.25].includes(notes[k+1].duration))continue;
  const a=positions[k],b=positions[k+1],down=stemDirections[k];
  const x1=a.x+(down?-9:9),x2=b.x+(down?-9:9),y1=a.y+(down?31:-33),y2=b.y+(down?31:-33);
  svg.append(svgEl('path',{d:`M${x1} ${y1} L${x2} ${y2} l0 ${down?-5:5} L${x1} ${y1+(down?-5:5)}Z`,fill:'#26272d'}));
  if(notes[k].duration===.25&&notes[k+1].duration===.25)
   svg.append(svgEl('path',{d:`M${x1} ${y1+(down?-9:9)} L${x2} ${y2+(down?-9:9)} l0 ${down?-4:4} L${x1} ${y1+(down?-13:13)}Z`,fill:'#26272d'}));
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
  const target=container.children[row];if(!target)return;
  const outer=container.getBoundingClientRect(),rect=target.getBoundingClientRect();
  if(rect.bottom>outer.bottom-4||rect.top<outer.top+4)
    container.scrollTop+=rect.top-outer.top-7;
 });
}
function renderKeyboard(){
 const area=$('sight-keys');area.replaceChildren();
 for(let i=0;i<7;i++){
  const btn=document.createElement('button');btn.type='button';btn.className='sight-key';btn.textContent=NAMES[i];btn.dataset.note=String(i);
  btn.disabled=busy||session.pos>=20;
  btn.addEventListener('click',()=>answer(i,false));area.append(btn);
 }
}
function render(){
 if(!session)return;
 const finished=session.pos===20;
 $('sight-count').textContent=String(Math.min(20,session.pos+1)).padStart(2,'0');
 $('sight-correct').textContent=String(session.correct);
 $('sight-accuracy').textContent=session.pos?`${Math.round(session.correct/session.pos*100)}%`:'—';
 renderScore();renderKeyboard();
 $('sight-reveal').classList.toggle('hidden',finished);
 $('sight-reveal').disabled=busy;
 $('sight-keys').classList.toggle('hidden',finished);
 $('sight-complete').classList.toggle('hidden',!finished);
 if(finished)$('sight-complete-score').textContent=`${session.correct} / 20  ·  ${Math.round(100*session.correct/20)}%`;
}
function answer(chosen,revealed){
 if(busy||!active||!session||session.pos>=20)return;
 const n=currentNote();if(!n)return;
 busy=true;
 const correct=!revealed&&chosen===n.letter;
 n.result=correct?'correct':'wrong';
 if(correct)session.correct++;
 // The same note name at two different staff positions is remembered separately.
 // 13 pitch positions per clef, 26 independent review cards in total.
 const actualIndex=n.index-POOLS[n.clef][0];
 const chosenIndex=revealed?null:(correct?actualIndex:nearestChosenPosition(n.clef,n.index,chosen));
 const ok=getReview(n.clef).record({actual:actualIndex,chosen:chosenIndex,revealed,hinted:false,
   low:0,high:0,responseMs:null});
 if(!ok?.storageAvailable && !storage.available)console.warn('Sight-reading data may not persist');
 session.pos++;
 save(SESSION_KEY,session);
 const keys=[...$('sight-keys').querySelectorAll('button')];
 for(const key of keys){
   const id=Number(key.dataset.note);key.disabled=true;
   if(id===n.letter)key.classList.add('is-correct');
   else if(!revealed&&id===chosen)key.classList.add('is-wrong');
 }
 renderScore();
 pendingTimer=setTimeout(()=>{pendingTimer=null;busy=false;render();},correct?300:800);
}
function statsBox(label,val){const b=document.createElement('div');b.className='sight-kpi';b.append(Object.assign(document.createElement('span'),{textContent:label}),Object.assign(document.createElement('strong'),{textContent:val}));return b;}
function statRow(label,attempts,correct){
 const row=document.createElement('div');row.className='sight-stat-row';
 const lab=document.createElement('span');lab.textContent=label;
 const bar=document.createElement('div');bar.className='sight-stat-track';
 const fill=document.createElement('div');fill.style.width=attempts?`${100*correct/attempts}%`:'0%';bar.append(fill);
 const value=document.createElement('span');value.textContent=attempts?`${correct}/${attempts} · ${Math.round(100*correct/attempts)}%`:'—';
 row.append(lab,bar,value);return row;
}
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
 // Compact seven-day progress, using saved daily records from both clefs.
 const daily=new Map();
 for(const source of [t,b])for(const row of source.trend){
   const d=daily.get(row.day)||{answered:0,correct:0};
   d.answered+=row.answered;d.correct+=row.correct;daily.set(row.day,d);
 }
 const dates=[...daily.keys()].sort().slice(-7);
 if(dates.length){
   const section=document.createElement('section');section.className='stats-panel';
   section.append(Object.assign(document.createElement('h3'),{textContent:'最近练习'}));
   for(const date of dates){const d=daily.get(date);section.append(statRow(date.slice(5),d.answered,d.correct));}
   container.append(section);
 }
 const recent=[...t.history.map(h=>({...h,clef:'高音谱号'})),...b.history.map(h=>({...h,clef:'低音谱号'}))].sort((a,b)=>b.at-a.at).slice(0,10);
 if(recent.length){
   const section=document.createElement('section');section.className='stats-panel';
   section.append(Object.assign(document.createElement('h3'),{textContent:'最近答题'}));
   for(const h of recent){
     const row=document.createElement('div');row.className='sight-confusion';
     const wrong=h.revealed||h.actual!==h.chosen;
     const clef=h.clef==='高音谱号'?'treble':'bass';
     const name=`${h.clef} · ${pitchLabel(clef,h.actual)}`;
     const chosen=h.revealed?'显示答案':wrong?`→ ${NAMES[letterFromIndex(POOLS[clef][h.chosen])]}`:'✓';
     row.append(Object.assign(document.createElement('span'),{textContent:name}),Object.assign(document.createElement('strong'),{textContent:chosen}));
     section.append(row);
   }
   container.append(section);
 }
 const confused=[];
 for(const [clef,r] of [['高音谱号',review.treble],['低音谱号',review.bass]]){
   for(const c of r.analysis(Array.from({length:13},(_,i)=>i)).confusions.slice(0,8))confused.push({label:`${clef} · ${pitchLabel(clef==='高音谱号'?'treble':'bass',c.actual)} → ${pitchLabel(clef==='高音谱号'?'treble':'bass',c.chosen)}`,count:c.count});
 }
 confused.sort((a,b)=>b.count-a.count);
 if(confused.length){
   const section=document.createElement('section');section.className='stats-panel';
   const h=document.createElement('h3');h.textContent='常见误认';section.append(h);
   for(const item of confused.slice(0,10)){
     const row=document.createElement('div');row.className='sight-confusion';
     row.append(Object.assign(document.createElement('span'),{textContent:item.label}),Object.assign(document.createElement('strong'),{textContent:item.count+' 次'}));section.append(row);
   }
   container.append(section);
 }
 const note=document.createElement('div');note.className='sight-review-plan';
 const today=[['高音谱号',review.treble],['低音谱号',review.bass]].flatMap(([c,r])=>r.analysis(Array.from({length:13},(_,i)=>i)).yesterdayWrong.map(i=>`${c} ${pitchLabel(c==='高音谱号'?'treble':'bass',i.semi)}`));
 const due=[review.treble,review.bass].reduce((n,r)=>n+r.analysis(Array.from({length:13},(_,i)=>i)).due.length,0);
 note.textContent=`昨日错题 ${today.length} 种 · 当前到期 ${due} 种`; container.append(note);
}
function switchStats(on){
 const box=$('stats-dialog');box.classList.toggle('sight-stats-active',on);
 $('sight-stats-content').classList.toggle('hidden',!on);
 const sightBtn=$('stats-sight');sightBtn.classList.toggle('active',on);sightBtn.setAttribute('aria-pressed',String(on));
 if(on){for(const key of ['harmonic','melodic']){
  const btn=$('stats-'+key);btn.classList.remove('active');btn.setAttribute('aria-pressed','false');
 }}
 if(on)renderStats();
}
function openStats(){
 if($('sight-settings-dialog').open)$('sight-settings-dialog').close();
 if(!$('stats-dialog').open)$('home-stats').click();
 switchStats(true);
}
function openSettings(){
 if(!active)return;
 for(const btn of document.querySelectorAll('.sight-clef-options button')){
  const on=btn.dataset.clef===settings.clef;btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',String(on));
 }
 $('sight-settings-dialog').showModal();
}
function enter(){
 if(!initialized)return;
 if(!session||!validatedSession(session))makeGroup();
 active=true; document.documentElement.classList.remove('practice-scroll-locked');
 $('home-screen').classList.add('hidden');
 $('practice').classList.add('hidden');
 $('practice-navigation').classList.remove('hidden');
 $('practice-mode-title').textContent='五线谱识谱';
 $('open-settings').classList.remove('hidden');
 $('sight-practice').classList.remove('hidden');
 $('back-home').onclick=e=>{e.stopImmediatePropagation();leave();};
 $('sight-warning').textContent='';
 render();window.scrollTo(0,0);
}
function leave(){
 if(!active)return;
 active=false;
 if($('sight-settings-dialog').open)$('sight-settings-dialog').close();
 $('sight-practice').classList.add('hidden');
 $('practice-navigation').classList.add('hidden');
 $('open-settings').classList.add('hidden');
 $('home-screen').classList.remove('hidden');
 $('back-home').onclick=null;
 window.scrollTo(0,0);
}
function backup(){return {treble:review.treble.snapshot(),bass:review.bass.snapshot(),settings:{clef:settings.clef}};}
function init(){
 if(initialized)return;
 storage=root.IntervalPwaStorageAdapter;if(!storage)return;
 review={treble:root.IntervalReview.createReviewManager(storage,TREBLE_KEY),bass:root.IntervalReview.createReviewManager(storage,BASS_KEY)};
 const existing=getJson(SETTINGS_KEY);
 if(['treble','bass','both'].includes(existing?.clef))settings.clef=existing.clef;
 session=validatedSession(getJson(SESSION_KEY));
 $('sight-reveal').addEventListener('click',()=>answer(null,true));
 $('sight-next-set').addEventListener('click',()=>{makeGroup();render();});
 $('sight-close-settings').addEventListener('click',()=>$('sight-settings-dialog').close());
 $('sight-settings-done').addEventListener('click',()=>$('sight-settings-dialog').close());
 $('sight-open-stats').addEventListener('click',openStats);
 $('sight-abandon').addEventListener('click',()=>{if(!confirm('重新开始当前20音练习？未完成的题目会被替换。'))return;makeGroup();$('sight-settings-dialog').close();render();});
 $('sight-settings-dialog').addEventListener('click',e=>{if(e.target===$('sight-settings-dialog'))e.target.close();});
 for(const btn of document.querySelectorAll('.sight-clef-options button'))btn.addEventListener('click',()=>{
  settings.clef=btn.dataset.clef;save(SETTINGS_KEY,settings);openSettingsRefresh();
  // Existing 20-note group remains unchanged until next group.
 });
 function openSettingsRefresh(){for(const b of document.querySelectorAll('.sight-clef-options button')){
  const on=b.dataset.clef===settings.clef;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));}}
 $('stats-sight').addEventListener('click',()=>switchStats(true));
 for(const id of ['stats-harmonic','stats-melodic'])$(''+id).addEventListener('click',()=>switchStats(false));
 $('close-stats').addEventListener('click',()=>switchStats(false));
 $('stats-dialog').addEventListener('close',()=>switchStats(false));
 initialized=true;
}
root.SightTrainer={enter,leave,openSettings,isActive:()=>active,backup,showStats:openStats};
if(root.IntervalAppReady)init();else root.addEventListener('interval-trainer-ready',init,{once:true});
})(window);
