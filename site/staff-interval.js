/* Tonaloom v2.12: staff interval recognition, ten written intervals per set. */
(function(root){
'use strict';
const $=id=>document.getElementById(id);
const logic=root.IntervalLogic;
const KEY='tonaloom-staff-interval-v1', REVIEW_KEY='tonaloom-staff-interval-review-v1', OPTIONS=logic.INTERVALS;
const ROWS=[[0],[1,2],[3,4],[5,6,7],[8,9],[10,11],[12]];
const ACC={'♯':'#','♭':'b','𝄪':'##','𝄫':'bb'};
const MODES=['both'];
const store=()=>root.IntervalPwaStorageAdapter;
let active=false,initialized=false,drawSerial=0,advanceTimer=null,flashTimer=null,flashing=-1,review=null,questionAt=Date.now();
let setting={clef:'both'},set=null,previous=-1;
let audio=null,master=null;
const samples=new Map(),pending=new Map(),voices=new Set();
const random=n=>Math.floor(Math.random()*n);
function save(){
 try{store()?.setItem(KEY,JSON.stringify({setting,set}));}
 catch(err){console.error('谱面音程进度保存失败',err);}
}
function valid(s){
 return !!s&&s.layoutVersion===2&&Array.isArray(s.questions)&&s.questions.length===10&&
 Number.isInteger(s.pos)&&s.pos>=0&&s.pos<=10&&
 s.questions.every((q,i)=>q&&q.clef===(i<5?'treble':'bass')&&Number.isInteger(q.semitones)&&q.semitones>=0&&q.semitones<=12&&
 ['treble','bass'].includes(q.clef)&&Array.isArray(q.notes)&&q.notes.length===2&&
 q.notes.every(n=>typeof n==='string'&&n.length<=10)&&typeof q.done==='boolean'&&
 typeof q.mistake==='boolean');
}
function makeSet(){
 const questions=[];
 for(let i=0;i<10;i++){
  const chosen=review?.choose(OPTIONS.map(i=>i.semitones),previous);
  const interval=OPTIONS[chosen??random(OPTIONS.length)];
  previous=interval.semitones;
  const clef=i<5?'treble':'bass';
  // Choose stable, readable ranges for each clef (and their ledger lines).
  const low=(clef==='treble'?62:50)+random(9);
  questions.push({semitones:interval.semitones,clef,low,high:low+interval.semitones,
   notes:logic.spellPair(low,interval),done:false,mistake:false,revealed:false});
 }
 set={layoutVersion:2,pos:0,questions};questionAt=Date.now();save();
}
function current(){return set?.questions[set.pos]||null;}
function formatNote(label){
 const m=/^([A-G])(𝄫|𝄪|♭|♯)?(-?\d+)$/.exec(label);
 if(!m)throw Error('音符无法记谱：'+label);
 return {key:m[1].toLowerCase()+'/'+m[3],accidental:ACC[m[2]]||null};
}
async function drawScore(){
 const rootEl=$('staff-interval-score');
 if(!rootEl||!set)return;
 const token=++drawSerial;
 try{
  const VF=await root.SightVexFlowReady;
  if(!active||token!==drawSerial||!VF)throw Error('乐谱组件未就绪');
  if(typeof VF.setFonts==='function')VF.setFonts('Bravura','Academico');
  const width=Math.max(300,Math.floor(rootEl.clientWidth||340)-4);
  const ns='http://www.w3.org/2000/svg';
  const frag=document.createDocumentFragment();
  for(let row=0;row<2;row++){
   const clef=row===0?'treble':'bass';
   const host=document.createElement('div');
   host.className='staff-interval-system';
   const renderer=new VF.Renderer(host,VF.Renderer.Backends.SVG);
   renderer.resize(width,166);
   const ctx=renderer.getContext();
   const stave=new VF.Stave(7,26,width-14).addClef(clef);
   const chords=set.questions.slice(row*5,row*5+5).map(q=>{
    const p=q.notes.map(formatNote);
    const idxs=q.notes.map(label=>{const m=/^([A-G])(?:𝄫|𝄪|♭|♯)?(-?\d+)$/.exec(label);return Number(m[2])*7+'CDEFGAB'.indexOf(m[1]);});
    const middle=clef==='treble'?(4*7+6):(3*7+1); // B4 for treble; D3 for bass
    const dir=(idxs[0]+idxs[1])/2>=middle?-1:1;
    const note=new VF.StaveNote({keys:p.map(x=>x.key),duration:'q',clef,stem_direction:dir});
    p.forEach((x,i)=>{if(x.accidental)note.addModifier(new VF.Accidental(x.accidental),i);});
    return note;
   });
   const voice=new VF.Voice({num_beats:5,beat_value:4});
   voice.setStrict(false); // VexFlow 5 accepts five chords as an unbarred exercise.
   voice.addTickables(chords);
   new VF.Formatter().joinVoices([voice]).formatToStave([voice],stave);
   stave.setContext(ctx).draw();
   voice.draw(ctx,stave);
   const svg=host.querySelector('svg');
   if(!svg)throw Error('五线谱 SVG 未生成');
   // Use the original chord notehead and stem SVG group. No numeric labels.
   const notesInRow=[...svg.querySelectorAll('.vf-stavenote')];
   chords.forEach((note,i)=>{
    const idx=row*5+i;
    const node=note.getSVGElement?.()||notesInRow[i];
    if(!node)return;
    node.dataset.staffQuestion=String(idx);
    const current=idx===set.pos&&set.pos<10;
    const wrong=current&&flashing===idx;
    // Same color-feedback principle as note recognition. The entire chord,
    // including its stem and both noteheads, is colored together.
    if(current)node.style.filter=wrong?
      'brightness(0) saturate(100%) invert(28%) sepia(89%) saturate(2438%) hue-rotate(326deg) brightness(100%)':
      'brightness(0) saturate(100%) invert(50%) sepia(83%) saturate(402%) hue-rotate(103deg) brightness(90%)';
   });

   frag.appendChild(host);
  }
  if(active&&token===drawSerial)rootEl.replaceChildren(frag);
 }catch(err){
  console.error('五线谱和声音程绘制错误',err);
  if(active&&token===drawSerial)rootEl.textContent='谱面绘制失败：'+err.message;
 }
}
function countCorrect(){return set.questions.filter(q=>q.done&&!q.mistake&&!q.revealed).length;}
function renderOptions(){
 const el=$('staff-interval-options'),q=current();
 el.replaceChildren();
 for(const rowIndices of ROWS){
  const row=document.createElement('div');
  row.className='answer-row'+(rowIndices.length===3?' is-triple':'');
  for(const semi of rowIndices){
   const item=OPTIONS[semi],button=document.createElement('button');
   button.type='button';button.className='answer-button';
   button.textContent=item.name;button.dataset.answer=String(semi);
   if(q.done){
    button.disabled=true;
    if(semi===q.semitones)button.classList.add('correct-answer');
   }else{
    button.addEventListener('click',()=>choose(semi,button));
   }
   row.appendChild(button);
  }
  el.appendChild(row);
 }
}
function render(){
 if(!active||!set)return;
 const completed=set.pos===10;
 const q=current();
 $('staff-interval-count').textContent=String(set.pos);
 $('staff-interval-correct').textContent=String(countCorrect());
 $('staff-interval-summary').classList.toggle('hidden',!completed);
 $('staff-interval-work').classList.remove('hidden');
 void drawScore();
 if(completed){
  $('staff-interval-result').textContent='本组完成：首次答对 '+countCorrect()+' / 10';
  $('staff-interval-feedback').textContent='';
   $('staff-interval-reveal').classList.add('hidden');
  $('staff-interval-options').replaceChildren();
  return;
 }
 $('staff-interval-feedback').textContent=q.done
  ?(q.revealed?'正确答案：'+OPTIONS[q.semitones].name:'正确 · 正在播放钢琴和声')
  :'观察绿色和弦，选择对应的音程';
 $('staff-interval-reveal').classList.toggle('hidden',q.done);
 renderOptions();
}
function audioContext(){
 const Constructor=root.AudioContext||root.webkitAudioContext;
 if(!Constructor)throw Error('当前浏览器不支持钢琴播放');
 if(!audio){audio=new Constructor();master=audio.createGain();master.gain.value=.43;master.connect(audio.destination);}
 return audio;
}
async function piano(midi){
 const key=String(midi);
 if(samples.has(key))return samples.get(key);
 if(!pending.has(key)){
  const source=root.PIANO_SAMPLES?.[key];
  if(!source)throw Error('钢琴采样缺失：'+key);
  pending.set(key,(async()=>{
   const bin=atob(source),buf=new Uint8Array(bin.length);
   for(let i=0;i<bin.length;i++)buf[i]=bin.charCodeAt(i);
   return audioContext().decodeAudioData(buf.buffer);
  })());
 }
 try{
  const decoded=await pending.get(key);
  samples.set(key,decoded);return decoded;
 }finally{pending.delete(key);}
}
async function playCorrect(q){
 try{
  const ctx=audioContext();
  if(ctx.state==='suspended')await ctx.resume();
  const buffers=await Promise.all([piano(q.low),piano(q.high)]);
  const t=ctx.currentTime+.035;
  for(const buffer of buffers){
   const source=ctx.createBufferSource();
   const gain=ctx.createGain();
   source.buffer=buffer;
   gain.gain.setValueAtTime(0,t);
   gain.gain.linearRampToValueAtTime(q.low===q.high?.4:.68,t+.014);
   gain.gain.setValueAtTime(q.low===q.high?.4:.68,t+.85);
   gain.gain.linearRampToValueAtTime(.001,t+1.05);
   source.connect(gain);gain.connect(master);
   voices.add(source);
   source.onended=()=>{voices.delete(source);try{source.disconnect();gain.disconnect();}catch{}};
   source.start(t);source.stop(t+1.09);
  }
 }catch(err){console.error('钢琴音程播放失败',err);$('staff-interval-feedback').textContent='回答正确，但钢琴播放失败：'+err.message;}
}
function choose(semi,button){
 const q=current();if(!active||!q||q.done)return;
 if(semi!==q.semitones){
  if(!q.mistake)q.firstWrong=semi;
  q.mistake=true;save();
  flashing=set.pos;void drawScore();
  $('staff-interval-feedback').textContent='不正确，请重新选择';
  clearTimeout(flashTimer);flashTimer=setTimeout(()=>{flashing=-1;if(active)void drawScore();},340);
  return;
 }
 q.done=true;
 review?.record({actual:q.semitones,chosen:q.mistake?Number.isInteger(q.firstWrong)?q.firstWrong:semi:semi,revealed:false,low:q.low,high:q.high,responseMs:Date.now()-questionAt});
 save();render();
 void playCorrect(q);
 clearTimeout(advanceTimer);advanceTimer=setTimeout(()=>{if(active)next();},950);
}
function next(){
 if(!active||!set||set.pos>=10||!current()?.done)return;
 set.pos++;questionAt=Date.now();flashing=-1;save();render();
}
function reveal(){
 const q=current();if(!q||q.done)return;
 q.done=true;q.mistake=true;q.revealed=true;
 review?.record({actual:q.semitones,chosen:null,revealed:true,low:q.low,high:q.high,responseMs:Date.now()-questionAt});
 save();render();clearTimeout(advanceTimer);advanceTimer=setTimeout(()=>{if(active)next();},950);
}
function openSettings(){
 if(!active)return;
 for(const btn of document.querySelectorAll('[data-staff-clef]')){
  const on=btn.dataset.staffClef===setting.clef;
  btn.classList.toggle('active',on);
  btn.setAttribute('aria-pressed',String(on));
 }
 $('staff-interval-settings').showModal();
}
function enter(){
 if(!initialized)return;
 if(!set||!valid(set))makeSet();
 active=true;document.body.classList.add('module-active');
 document.documentElement.classList.remove('practice-scroll-locked');
 $('home-screen').classList.add('hidden');
 $('practice').classList.add('hidden');
 $('sight-practice').classList.add('hidden');
 $('staff-interval-practice').classList.remove('hidden');
 $('practice-navigation').classList.remove('hidden');
 $('practice-mode-title').textContent='音程辨认';
 $('open-settings').classList.remove('hidden');
 root.scrollTo(0,0);render();
}
function leave(){
 if(!active)return;active=false;drawSerial++;clearTimeout(advanceTimer);clearTimeout(flashTimer);flashing=-1;
 if($('staff-interval-settings').open)$('staff-interval-settings').close();
 $('staff-interval-practice').classList.add('hidden');
 $('practice-navigation').classList.add('hidden');
 $('open-settings').classList.add('hidden');
 $('home-screen').classList.remove('hidden');
 document.body.classList.remove('module-active');
}
function init(){
 if(initialized)return;
 let saved=null;
 try{saved=JSON.parse(store()?.getItem(KEY)||'null');}catch{}
 setting.clef='both';
 if(valid(saved?.set))set=saved.set;
 review=root.IntervalReview.createReviewManager(store(),REVIEW_KEY);
 $('staff-interval-reveal').addEventListener('click',reveal);
 $('staff-interval-next-set').addEventListener('click',()=>{makeSet();render();});
 $('staff-interval-settings-close').addEventListener('click',()=>$('staff-interval-settings').close());
 $('staff-open-stats').addEventListener('click',()=>{ $('staff-interval-settings').close();$('home-stats').click();$('stats-staff').click(); });
 $('staff-interval-settings-done').addEventListener('click',()=>$('staff-interval-settings').close());
 $('staff-interval-reset').addEventListener('click',()=>{
  if(!root.confirm('重新开始本组10题？当前进度将被替换。'))return;
  makeSet();$('staff-interval-settings').close();render();
 });
 for(const btn of document.querySelectorAll('[data-staff-clef]')){
  btn.addEventListener('click',()=>{
   setting.clef=btn.dataset.staffClef;save();openSettings();
  });
 }
 initialized=true;
}
function backup(){return {setting:{clef:setting.clef},set:valid(set)?set:null,review:review?.snapshot()||null};}
function restoreBackup(snapshot){
 if(!snapshot||typeof snapshot!=='object')return;
 setting.clef='both';
 set=valid(snapshot.set)?snapshot.set:null;
 if(snapshot.review&&review)review.importJson(JSON.stringify(snapshot.review));
 save();
}
root.StaffIntervalTrainer={enter,leave,openSettings,isActive:()=>active,backup,restoreBackup,reviewManager:()=>review};
if(root.IntervalAppReady)init();
else root.addEventListener('interval-trainer-ready',init,{once:true});
})(window);
