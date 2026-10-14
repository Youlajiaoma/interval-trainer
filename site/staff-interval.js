/* Tonaloom v2.12: staff interval recognition, ten written intervals per set. */
(function(root){
'use strict';
const $=id=>document.getElementById(id);
const logic=root.IntervalLogic;
const KEY='tonaloom-staff-interval-v1', OPTIONS=logic.INTERVALS;
const ROWS=[[0],[1,2],[3,4],[5,6,7],[8,9],[10,11],[12]];
const ACC={'♯':'#','♭':'b','𝄪':'##','𝄫':'bb'};
const MODES=['treble','bass','both'];
const store=()=>root.IntervalPwaStorageAdapter;
let active=false,initialized=false,drawSerial=0;
let setting={clef:'both'},set=null,previous=-1;
let audio=null,master=null;
const samples=new Map(),pending=new Map(),voices=new Set();
const random=n=>Math.floor(Math.random()*n);
function save(){
 try{store()?.setItem(KEY,JSON.stringify({setting,set}));}
 catch(err){console.error('谱面音程进度保存失败',err);}
}
function valid(s){
 return !!s&&Array.isArray(s.questions)&&s.questions.length===10&&
 Number.isInteger(s.pos)&&s.pos>=0&&s.pos<=10&&
 s.questions.every(q=>q&&Number.isInteger(q.semitones)&&q.semitones>=0&&q.semitones<=12&&
 ['treble','bass'].includes(q.clef)&&Array.isArray(q.notes)&&q.notes.length===2&&
 q.notes.every(n=>typeof n==='string'&&n.length<=10)&&typeof q.done==='boolean'&&
 typeof q.mistake==='boolean');
}
function makeSet(){
 const questions=[];
 for(let i=0;i<10;i++){
  const eligible=OPTIONS.filter(t=>t.semitones!==previous);
  const interval=eligible[random(eligible.length)];
  previous=interval.semitones;
  const clef=setting.clef==='both'?(Math.random()<.5?'treble':'bass'):setting.clef;
  // Choose stable, readable ranges for each clef (and their ledger lines).
  const low=(clef==='treble'?60:48)+random(12);
  questions.push({semitones:interval.semitones,clef,low,high:low+interval.semitones,
   notes:logic.spellPair(low,interval),done:false,mistake:false,revealed:false});
 }
 set={pos:0,questions};save();
}
function current(){return set?.questions[set.pos]||null;}
function formatNote(label){
 const m=/^([A-G])(𝄫|𝄪|♭|♯)?(-?\d+)$/.exec(label);
 if(!m)throw Error('音符无法记谱：'+label);
 return {key:m[1].toLowerCase()+'/'+m[3],accidental:ACC[m[2]]||null};
}
async function drawScore(){
 const rootEl=$('staff-interval-score'),q=current();
 if(!q||!rootEl)return;
 const token=++drawSerial;
 rootEl.replaceChildren();
 try{
  const VF=await root.SightVexFlowReady;
  if(!active||token!==drawSerial||!VF)return;
  if(typeof VF.setFonts==='function')VF.setFonts('Bravura','Academico');
  const width=Math.max(280,Math.floor(rootEl.clientWidth||340)-4),height=188;
  const host=document.createElement('div');
  const renderer=new VF.Renderer(host,VF.Renderer.Backends.SVG);
  renderer.resize(width,height);
  const ctx=renderer.getContext();
  const stave=new VF.Stave(12,39,width-24).addClef(q.clef);
  const notes=q.notes.map(label=>{
   const p=formatNote(label);
   const note=new VF.StaveNote({keys:[p.key],duration:'q',clef:q.clef});
   if(p.accidental)note.addModifier(new VF.Accidental(p.accidental),0);
   return note;
  });
  const voice=new VF.Voice({num_beats:2,beat_value:4});
  voice.addTickables(notes);
  new VF.Formatter().joinVoices([voice]).formatToStave([voice],stave);
  stave.setContext(ctx).draw();voice.draw(ctx,stave);
  if(active&&token===drawSerial)rootEl.replaceChildren(host);
 }catch(err){
  if(token===drawSerial&&active){rootEl.textContent='谱面绘制失败，请检查网络后重试';console.error(err);}
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
 $('staff-interval-count').textContent=String(Math.min(10,set.pos+1)).padStart(2,'0');
 $('staff-interval-correct').textContent=String(countCorrect());
 $('staff-interval-summary').classList.toggle('hidden',!completed);
 $('staff-interval-work').classList.toggle('hidden',completed);
 if(completed){
  $('staff-interval-result').textContent='本组完成：首次答对 '+countCorrect()+' / 10';
  $('staff-interval-feedback').textContent='';
  return;
 }
 $('staff-interval-feedback').textContent=q.done
  ?(q.revealed?'正确答案：'+OPTIONS[q.semitones].name:'回答正确，已播放钢琴和声音程。')
  :'识别两个音符之间的音程';
 $('staff-interval-next').classList.toggle('hidden',!q.done);
 $('staff-interval-reveal').classList.toggle('hidden',q.done);
 renderOptions();
 void drawScore();
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
  q.mistake=true;save();
  button.classList.add('wrong-answer');
  $('staff-interval-feedback').textContent='音程不正确，请重新选择';
  setTimeout(()=>button.classList.remove('wrong-answer'),360);
  return;
 }
 q.done=true;save();render();
 // Playback is initiated in the correct-answer click event only.
 void playCorrect(q);
}
function next(){
 if(!active||!set||set.pos>=10||!current()?.done)return;
 set.pos++;save();render();
}
function reveal(){
 const q=current();if(!q||q.done)return;
 q.done=true;q.mistake=true;q.revealed=true;save();render();
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
 $('practice-mode-title').textContent='五线谱音程识别';
 $('open-settings').classList.remove('hidden');
 root.scrollTo(0,0);render();
}
function leave(){
 if(!active)return;active=false;drawSerial++;
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
 if(saved&&MODES.includes(saved.setting?.clef))setting.clef=saved.setting.clef;
 if(valid(saved?.set))set=saved.set;
 $('staff-interval-next').addEventListener('click',next);
 $('staff-interval-reveal').addEventListener('click',reveal);
 $('staff-interval-next-set').addEventListener('click',()=>{makeSet();render();});
 $('staff-interval-settings-close').addEventListener('click',()=>$('staff-interval-settings').close());
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
function backup(){return {setting:{clef:setting.clef},set:valid(set)?set:null};}
function restoreBackup(snapshot){
 if(!snapshot||typeof snapshot!=='object')return;
 if(MODES.includes(snapshot.setting?.clef))setting.clef=snapshot.setting.clef;
 set=valid(snapshot.set)?snapshot.set:null;
 save();
}
root.StaffIntervalTrainer={enter,leave,openSettings,isActive:()=>active,backup,restoreBackup};
if(root.IntervalAppReady)init();
else root.addEventListener('interval-trainer-ready',init,{once:true});
})(window);
