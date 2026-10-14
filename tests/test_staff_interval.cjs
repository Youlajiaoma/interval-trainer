// Requires Playwright and site/vendor/vexflow.js (same dependency as the Pages build).
// Set CHROMIUM_PATH when using an existing Chromium installation.
const {chromium}=require('playwright');
const path=require('path');
const site=path.join(__dirname,'../site');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const width of [390,900,320]){
  const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://127.0.0.1:8765/**',async r=>{const path=require('path').join(site,new URL(r.request().url()).pathname.replace(/\/$/,'/index.html'));try{await r.fulfill({path})}catch{await r.fulfill({status:404,body:''})}});
  await page.route('**/vendor/vexflow.js',r=>r.fulfill({path:path.join(site,'vendor/vexflow.js'),contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:8765');
  await page.waitForFunction(()=>window.IntervalAppReady&&window.StaffIntervalTrainer);
  await page.evaluate(async()=>{
   const VF=await SightVexFlowReady;window.drawn=[];
   const Original=VF.StaveNote;
   VF.StaveNote=class extends Original{constructor(o){super(o);window.drawn.push(this)}};
   const pairs=[['D4','F4'],['F♯4','E5'],['B4','D5'],['A4','C5'],['F4','F5'],['D3','F3'],['G3','B3'],['B2','D3'],['A3','A3'],['C3','E3']];
   StaffIntervalTrainer.restoreBackup({set:{layoutVersion:2,pos:0,questions:pairs.map((notes,i)=>({notes,clef:i<5?'treble':'bass',low:i<5?62:50,high:i<5?65:53,semitones:3,done:false,mistake:false}))}});
  });
  const coverage=await page.evaluate(async()=>{
   const VF=await SightVexFlowReady;let count=0,min=Infinity,max=-Infinity;
   for(const clef of ['treble','bass'])for(let low=clef==='treble'?62:50;low<(clef==='treble'?71:59);low++)for(const interval of IntervalLogic.INTERVALS){
    const labels=IntervalLogic.spellPair(low,interval),text=labels.join('');
    if(/[𝄪𝄫]/u.test(text)||(text.match(/[♯♭]/gu)||[]).length>1)continue;
    const keys=labels.map(n=>{const m=/^([A-G])(?:♯|♭)?(-?\d+)$/.exec(n);return m[1].toLowerCase()+'/'+m[2]});
    const n=new VF.StaveNote({keys,duration:'q',clef,autoStem:true});n.setStave(new VF.Stave(7,0,300));const e=n.getStemExtents();min=Math.min(min,e.topY,e.baseY);max=Math.max(max,e.topY,e.baseY);count++;
   }
   return {count,min,max};
  });
  if(coverage.min<0||coverage.max>112)throw Error('pitch bounds '+JSON.stringify(coverage));
  console.log('pitch coverage',coverage);
  await page.click('#home-staff-interval');
  await page.waitForFunction(()=>document.querySelectorAll('#staff-interval-score svg').length===2);
  const result=await page.evaluate(()=>{
   const notes=drawn.slice(-10);const dirs=notes.map(n=>n.getStemDirection());
   const boxes=[...document.querySelectorAll('#staff-interval-score svg')].map(s=>{const b=s.getBBox();return {y:b.y,bottom:b.y+b.height,height:s.clientHeight}});
   const score=document.querySelector('#staff-interval-score').getBoundingClientRect(),opts=document.querySelector('#staff-interval-options').getBoundingClientRect();
   return {dirs,boxes,gap:opts.top-score.bottom,overflow:document.documentElement.scrollWidth>innerWidth,stems:notes.map(n=>({direction:n.getStemDirection(),extent:n.getStemExtents()}))};
  });
  if(JSON.stringify(result.dirs)!==JSON.stringify([1,-1,-1,-1,-1,-1,-1,1,-1,-1]))throw Error('directions '+JSON.stringify(result));
  if(result.stems.some(s=>Math.min(s.extent.topY,s.extent.baseY)<0||Math.max(s.extent.topY,s.extent.baseY)>112)||result.overflow||result.gap<28)throw Error('layout '+JSON.stringify(result));
  await page.click('#staff-interval-options [data-answer="4"]');
  await page.waitForFunction(()=>document.querySelector('[data-staff-question="0"]').style.filter.includes('326deg'));
  await page.click('#staff-interval-options [data-answer="3"]');
  await page.waitForFunction(()=>window.StaffIntervalTrainer.backup().set.pos===1);
  await page.click('#back-home');await page.click('#home-harmonic');
  await page.locator('#answer-grid button').first().click();
  if(await page.locator('#feedback').count())throw Error('feedback remains');
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS staff direction, bounds, spacing, wrong-answer flash, auto-advance and silent feedback:',width)
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
