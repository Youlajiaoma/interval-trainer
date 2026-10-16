/* 图表无第三方依赖：不会联网，不修改练习页。 */
(function (root) {
  'use strict';
  const $=id=>document.getElementById(id);
  const names=['纯一度','小二度','大二度','小三度','大三度','纯四度','三全音','纯五度','小六度','大六度','小七度','大七度','纯八度'];
  const fmtPct=(correct,total)=>total?Math.round(100*correct/total)+'%':'—';
  const safeDate=(s)=>s.slice(5).replace('-','/');
  const label=(s,unit,clef)=>s.label?s.label(unit,clef):names[unit];
  function create(tag,cls,text) {
    const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;
  }
  function replace(id,el){$(id).replaceChildren(el);}
  const empty=(message)=>create('p','stats-empty',message);
  function renderSummary(s) {
    const t=s.totals, grid=create('div','stats-kpi-list');
    const cards=[['答题总数',t.answered+''],['正确率',fmtPct(t.correct,t.answered)],['练习天数',s.practiceDays+' 天'],['连续练习',s.streak+' 天']];
    for (const [title,value] of cards) {
      const c=create('div','stats-kpi');c.append(create('span','stats-kpi-label',title),create('strong','stats-kpi-value',value));grid.appendChild(c);
    }
    replace('stats-summary',grid);
  }
  function renderTrend(s) {
    const entries=s.trend;
    if (!s.totals.answered){replace('stats-trend',empty('当前时间段还没有答题记录。'));return;}
    // 时间范围过长时聚合到最多 42 个桶；避免全时间数据挤在一根轴上。
    const buckets=[];const bucketWidth=Math.max(1,Math.ceil(entries.length/42));
    for (let i=0;i<entries.length;i+=bucketWidth) {
      const subset=entries.slice(i,i+bucketWidth);
      buckets.push({day:subset[subset.length-1].day,answered:subset.reduce((x,d)=>x+d.answered,0),correct:subset.reduce((x,d)=>x+d.correct,0)});
    }
    const width=680,height=205,left=34,right=12,top=21,bottom=35,graphW=width-left-right,graphH=height-top-bottom;
    const maxNum=Math.max(1,...buckets.map(d=>d.answered));
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('role','img');
    svg.setAttribute('aria-label','每日答题次数柱状图与每日答题正确率折线图');svg.classList.add('stats-chart');
    const ns='http://www.w3.org/2000/svg';
    function el(tag,attrs){const node=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));svg.append(node);return node;}
    for(let n=0;n<=3;n++){
      const y=top+graphH*(1-n/3);
      el('line',{x1:left,y1:y,x2:width-right,y2:y,stroke:'#35374d','stroke-width':1});
      const txt=el('text',{x:4,y:y+4,fill:'#999bb1','font-size':10});txt.textContent=String(Math.round(maxNum*n/3));
    }
    const slot=graphW/Math.max(1,buckets.length),barW=Math.max(2,Math.min(18,slot*.52));
    const pts=[];
    buckets.forEach((d,i)=>{
      const cx=left+slot*(i+.5);
      const h=d.answered/maxNum*graphH;
      if (d.answered) {const bar=el('rect',{x:cx-barW/2,y:top+graphH-h,width:barW,height:h,rx:Math.min(4,barW/3),fill:'#6e648f'});const ti=document.createElementNS(ns,'title');ti.textContent=`${d.day}：${d.answered} 题`;bar.append(ti);}
      if(d.answered)pts.push(`${cx},${top+graphH*(1-d.correct/d.answered)}`);
    });
    // 不跨越无练习日连接正确率曲线，以免产生不存在的趋势。
    let seg=[];
    function flush(){if(seg.length>1)el('polyline',{points:seg.join(' '),fill:'none',stroke:'#c5a7ff','stroke-width':2.6,'stroke-linecap':'round','stroke-linejoin':'round'});seg=[];}
    buckets.forEach((d,i)=>{
      if(!d.answered){flush();return;}
      const x=left+slot*(i+.5),y=top+graphH*(1-d.correct/d.answered);seg.push(`${x},${y}`);
      el('circle',{cx:x,cy:y,r:Math.min(3.6,Math.max(1.6,slot*.15)),fill:'#c5a7ff'});
    });flush();
    if(buckets.length){const labels=[0,Math.floor((buckets.length-1)/2),buckets.length-1];for(const i of [...new Set(labels)]){
      const x=left+slot*(i+.5);const t=el('text',{x,y:height-9,fill:'#9698b0','font-size':11,'text-anchor':'middle'});t.textContent=safeDate(buckets[i].day);
    }}
    const wrap=create('div','stats-chart-wrap');wrap.append(svg);
    const leg=create('div','stats-legend');leg.append(create('span','legend-bars','答题数'),create('span','legend-line','正确率'));wrap.append(leg);
    replace('stats-trend',wrap);
  }
  function renderCalendar(s,now){
    // 和日期范围筛选无关的固定最近 49 天会交由 render 获取 fullLast49 数据。
    const days=s.last49;
    const wrap=create('div','stats-calendar-wrap');
    const daysEl=create('div','stats-heatmap');
    for(const d of days){
      const square=create('span','stats-heat');
      const n=d.answered;
      square.dataset.level=String(n===0?0:n<5?1:n<12?2:n<25?3:4);
      square.title=`${d.day}：${n} 题，正确率 ${fmtPct(d.correct,n)}`;
      square.setAttribute('aria-label',square.title);
      daysEl.appendChild(square);
    }
    wrap.append(daysEl);
    const caption=create('div','stats-heat-caption');caption.append(create('span','','49 天前'),create('span','','今天'));
    wrap.append(caption);replace('stats-calendar',wrap);
  }
  function renderIntervals(s){
    const wrap=create('div','stats-interval-list');
    const observed=(s.directional?s.byDirection:s.byInterval).filter(i=>i.answered>0).sort((a,b)=>
      a.correct/a.answered-b.correct/b.answered || b.answered-a.answered);
    if(!observed.length){replace('stats-intervals',empty(`练习后这里会显示各${s.unit||'音程'}的正确率。`));return;}
    for(const row of observed){
      const item=create('div','stats-interval-row');
      item.append(create('span','stats-interval-name',`${row.direction===1?'↑ ':row.direction===-1?'↓ ':''}${label(s,row.semi,row.clef)}`));
      const track=create('div','stats-interval-track'),fill=create('span','stats-interval-fill');
      fill.style.width=(100*row.correct/row.answered).toFixed(2)+'%';track.append(fill);item.append(track);
      item.append(create('span','stats-interval-value',`${fmtPct(row.correct,row.answered)}  ·  ${row.correct}/${row.answered}`));wrap.append(item);
    }
    replace('stats-intervals',wrap);
  }
  function renderConfusions(s){
    const rows=(s.directional?s.directionConfusions:s.confusions).slice(0,7);
    if(!rows.length){replace('stats-confusions',empty('目前没有误判记录。'));return;}
    const wrap=create('div','stats-confusion-list');
    for(const r of rows){const line=create('div','stats-confusion-row');
      line.append(create('span','',`${r.direction===1?'↑ ':r.direction===-1?'↓ ':''}${label(s,r.actual,r.clef)} → ${label(s,r.chosen,r.clef)}`),create('strong','',`${r.count} 次`));wrap.append(line);
    }replace('stats-confusions',wrap);
  }
  function renderPlan(s){
    const wrap=create('div','stats-plan');
    const focus=s.yesterdayWrong;
    const unit=s.unit||'音程';
    if(focus.length){
      wrap.append(create('p','',`昨日答错 ${focus.length} 种${unit}，今天将自动提高这些${unit}的出题优先级：`));
      const group=create('div','stats-focus-tags');
      for(const i of focus.sort((a,b)=>b.wrong-a.wrong))group.append(create('span','',`${i.direction===1?'↑ ':i.direction===-1?'↓ ':''}${label(s,i.semi,i.clef)} · 错 ${i.wrong} 题`));wrap.append(group);
    }else wrap.append(create('p','','昨日没有需要重点补练的错题；继续正常练习，系统会结合到期和历史误判调整题目比例。'));
    wrap.append(create('p','stats-plan-secondary',`当前有 ${s.due} 种${unit}到期待巩固。答错后也会在间隔其他题目后再次出现，不会让同一${unit}无休止地连续重复。`));
    replace('stats-review-plan',wrap);
  }
  function renderHistory(s){
    if(!s.history.length){replace('stats-history',empty('还没有作答记录。'));return;}
    const wrap=create('div','stats-history-list');
    for(const h of s.history.slice(0,25)){
      const correct=!h.revealed&&h.actual===h.chosen;
      const line=create('div','stats-history-row');
      line.append(create('span','stats-history-at',new Date(h.at).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})));
      const dir = h.direction === 1 ? '↑ ' : h.direction === -1 ? '↓ ' : '';
      const timbre = ({piano:'钢琴',violin:'小提琴',guitar:'吉他',sax:'萨克斯',flute:'长笛'})[h.timbre] || '';
      const actual=label(s,h.actual,h.clef),chosen=label(s,h.chosen,h.clef);
      const text = h.revealed ? `${actual} · 显示答案` : (correct ? actual : `${actual} → ${chosen}`);
      line.append(create('span','stats-history-names',`${dir}${text}${timbre ? ' · '+timbre : ''}`));
      line.append(create('span',correct?'stats-history-ok':'stats-history-bad',correct?'正确':'错误'));
      wrap.append(line);
    }
    replace('stats-history',wrap);
  }
  function readReview(review,enabled,period,now){
    const s=review.statistics(period,now),current=review.analysis(enabled,now);
    return {...s,last49:review.statistics(49,now).trend,yesterdayWrong:current.yesterdayWrong,
      due:current.due.length,storageAvailable:review.storageAvailable};
  }
  function init(getStatistics){
    const select=$('stats-period');
    function render(){
      // A page kept open across updates can retain the former note-only hiding class.
      $('stats-dialog').classList.remove('sight-stats-active');
      const now=Date.now();const value=select.value;
      const s=getStatistics(value==='all'?'all':Number(value),now);
      $('stats-performance-title').textContent=`各${s.unit||'音程'}表现`;
      $('stats-confusions-title').textContent=`易混淆${s.unit||'音程'}`;
      renderSummary(s);renderTrend(s);renderCalendar(s,now);renderIntervals(s);renderConfusions(s);renderPlan(s);renderHistory(s);
      const warn=$('stats-storage-warning');warn.textContent=s.storageAvailable && window.IntervalPwaStorageAdapter?.available !== false?'记录自动保存在本机 IndexedDB。卸载应用或清除站点数据仍可能丢失，建议定期导出备份。':(window.IntervalPwaStorageAdapter?.failureMessage || '本浏览器不允许持久保存记录！请勿依赖当前练习数据。');
    }
    select.addEventListener('change',render);
    return {render};
  }
  root.IntervalStats=Object.freeze({init,readReview});
})(typeof window!=='undefined'?window:globalThis);
