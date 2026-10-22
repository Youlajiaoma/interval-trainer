/* 音程听辨 v1.4：本地统计与无感间隔复习（无联网依赖）。
 * 沿用 v1.3 的存储键与基本记录结构，保留既有学习数据。
 * 复习对象是音程类别，并在每次生成题目时重新随机选择根音。
 * 基于 SM-2 的简化日程 + 昨日错题优先 + 当天隔题重测，不是 FSRS。
 */
(function (root) {
  'use strict';
  const STORAGE_KEY = 'interval-trainer-review-v1';
  const MAX_HISTORY = 8000;
  const MAX_DAYS = 3650;
  const valid = n => Number.isInteger(n) && n >= 0 && n <= 12;
  const num = (v, min, max, fallback = 0) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  function dayKey(time) {
    const d = new Date(time);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function addCalendarDays(time, count) {
    const d = new Date(time);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + count, 0, 0, 0).getTime();
  }
  const newStore = () => ({version: 1, cardRange:13, totalAnswers: 0, cards: {}, confusions: {}, history: [], daily: {},
    directionalInitialized:false, directionalCards:{}, directionalDaily:{}});
  const directionKey = (semi, direction) => `${semi}:${direction === 1 ? 'up' : 'down'}`;
  const validDirectionKey = key => /^(?:[0-9]|1[0-2]):(?:up|down)$/.test(key);
  const blankCard = () => ({attempts:0,correct:0,wrong:0,repetitions:0,intervalDays:0,ease:2.5,dueAt:0,lastAt:0,pendingAfter:null,streak:0,responseTotal:0,responseCount:0});
  function schedule(card, correct, hinted, now, position) {
    card.attempts++;card.lastAt=now;
    if(correct){card.correct++;card.streak++;}else{card.wrong++;card.streak=0;}
    const grade=correct?(hinted?3:5):1, delta=5-grade;
    card.ease=Math.max(1.3,Math.min(3.5,card.ease+.1-delta*(.08+delta*.02)));
    if(!correct){card.repetitions=0;card.intervalDays=1;card.pendingAfter=position+2;}
    else{card.repetitions++;card.intervalDays=card.repetitions===1?1:card.repetitions===2?3:
      Math.min(3650,Math.max(1,Math.round(card.intervalDays*card.ease)));card.pendingAfter=null;}
    card.dueAt=addCalendarDays(now,card.intervalDays);
    return card;
  }
  function normalizedCard(c) {
    const attempts=num(c.attempts,0,1000000),correct=num(c.correct,0,attempts);
    return {attempts,correct,wrong:attempts-correct,repetitions:num(c.repetitions,0,100000),
      intervalDays:num(c.intervalDays,0,3650),ease:num(c.ease,1.3,3.5,2.5),
      dueAt:num(c.dueAt,0,8640000000000000),lastAt:num(c.lastAt,0,8640000000000000),
      pendingAfter:Number.isFinite(c.pendingAfter)?num(c.pendingAfter,0,10000000):null,
      streak:num(c.streak,0,100000),responseTotal:num(c.responseTotal,0,3.6e12),responseCount:num(c.responseCount,0,1000000)};
  }
  function recordResponseTime(card, responseMs) {
    if (!Number.isFinite(responseMs)) return;
    card.responseTotal = Math.min(3.6e12, card.responseTotal + num(responseMs, 0, 3600000));
    card.responseCount = Math.min(1000000, card.responseCount + 1);
  }
  function addDirectionalDay(store, at, key, correct) {
    const day=dayKey(at);
    if(!store[day])store[day]={};
    const row=store[day][key]||{answered:0,correct:0};
    row.answered++;if(correct)row.correct++;store[day][key]=row;
  }
  function blankDay() { return {answered: 0, correct: 0, hints: 0, skipped: 0, responseTotal: 0, responseCount: 0, intervals: {}}; }
  function incrementDay(d, actual, correct, hinted, responseMs) {
    d.answered++; if (correct) d.correct++; if (hinted) d.hints++;
    if (responseMs !== null) { d.responseTotal += responseMs; d.responseCount++; }
    const i = d.intervals[actual] || {answered: 0, correct: 0};
    i.answered++; if (correct) i.correct++;
    d.intervals[actual] = i;
  }
  function cleanDay(v,maxIndex=12) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return blankDay();
    const result = blankDay();
    result.answered = num(v.answered, 0, 1000000);
    result.correct = num(v.correct, 0, result.answered);
    result.hints = num(v.hints, 0, result.answered);
    result.skipped = num(v.skipped, 0, 1000000);
    result.responseCount = num(v.responseCount, 0, result.answered);
    result.responseTotal = num(v.responseTotal, 0, 1e12);
    for (const [k, i] of Object.entries(v.intervals || {})) {
      if (!/^\d{1,2}$/.test(k) || !(Number(k)>=0 && Number(k)<=maxIndex) || !i) continue;
      const answered = num(i.answered, 0, 1000000);
      result.intervals[k] = {answered, correct: num(i.correct, 0, answered)};
    }
    return result;
  }
  function normalizeStore(raw, maxIndex = 12) {
    if (!raw || raw.version !== 1 || typeof raw !== 'object' || Array.isArray(raw)) throw Error('不支持的记录格式');
    const data = newStore();
    data.cardRange = [13, 21, 63].includes(raw.cardRange) ? raw.cardRange : 13;
    const isValid = n => Number.isInteger(n) && n >= 0 && n <= maxIndex;
    for (let n = 0; n <= maxIndex; n++) {
      const c = raw.cards?.[n]; if (!c || typeof c !== 'object') continue;
      data.cards[n] = normalizedCard(c);
    }
    for (const [k, count] of Object.entries(raw.confusions || {})) {
      const pair = k.split('>');
      if (pair.length !== 2 || pair.some(x => !/^\d{1,2}$/.test(x) || !isValid(Number(x))) || pair[0] === pair[1]) continue;
      data.confusions[k] = num(count, 0, 1000000);
    }
    for (const h of (Array.isArray(raw.history) ? raw.history.slice(-MAX_HISTORY) : [])) {
      if (!h || !isValid(h.actual) || !(isValid(h.chosen) || (h.chosen === null && h.revealed === true))) continue;
      data.history.push({at: num(h.at, 0, 8640000000000000), actual: h.actual, chosen: h.chosen, revealed: h.revealed===true,
        hinted: !!h.hinted, low: num(h.low, 0, 127), high: num(h.high, 0, 127),
        responseMs: Number.isFinite(h.responseMs) ? num(h.responseMs, 0, 3600000) : null,
        direction: [-1,0,1].includes(h.direction) ? h.direction : null,
        firstMode: ['a440','random','user-recording'].includes(h.firstMode) ? h.firstMode : null,
        timbre: ['piano','violin','guitar','sax','flute'].includes(h.timbre) ? h.timbre : null});
    }
    if (raw.daily && typeof raw.daily === 'object' && !Array.isArray(raw.daily)) {
      for (const [key, item] of Object.entries(raw.daily).filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key)).sort().slice(-MAX_DAYS))
        data.daily[key] = cleanDay(item, maxIndex);
    } else {
      // 无缝迁移 v1.3：用旧记录构建过去的逐日数据（仅覆盖历史保留范围）。
      for (const h of data.history) {
        const key = dayKey(h.at);
        const d = data.daily[key] || blankDay();
        incrementDay(d, h.actual, h.actual === h.chosen, h.hinted, h.responseMs);
        data.daily[key] = d;
      }
    }
    if (raw.directionalInitialized === true) {
      data.directionalInitialized = true;
      for (const [key,c] of Object.entries(raw.directionalCards||{})) {
        if(validDirectionKey(key) && c && typeof c==='object')data.directionalCards[key]=normalizedCard(c);
      }
      for(const [day, items] of Object.entries(raw.directionalDaily||{})) {
        if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!items||typeof items!=='object')continue;
        const out={};
        for(const [key,v] of Object.entries(items))if(validDirectionKey(key)&&v){
          const answered=num(v.answered,0,1000000);
          out[key]={answered,correct:num(v.correct,0,answered)};
        }
        data.directionalDaily[day]=out;
      }
    }
    data.totalAnswers = Object.values(data.cards).reduce((sum, c) => sum + c.attempts, 0);
    return data;
  }
  function storageAvailable(storage) {
    if (!storage || storage.available === false) return false;
    try { const key = STORAGE_KEY + '-test'; storage.setItem(key, '1'); storage.removeItem(key); return true; }
    catch { return false; }
  }
  function createReviewManager(storage, key = STORAGE_KEY, {directional = false, maxIndex = 12, responseSensitive = false} = {}) {
    const isValid = n => Number.isInteger(n) && n >= 0 && n <= maxIndex;
    let available = storageAvailable(storage);
    let data = newStore(); data.cardRange = maxIndex+1;
    let lastSaved = null;
    let storageWarning = '';
    if (available) {
      try { lastSaved = storage.getItem(key); if (lastSaved) data = normalizeStore(JSON.parse(lastSaved), maxIndex); }
      catch { storageWarning = '检测到损坏的旧记录，原始存储没有被自动删除。请先导出备份再继续练习。'; available = false; }
    }
    function initializeDirectional(data) {
      if (!directional || data.directionalInitialized) return;
      // Migration is lossless for original aggregated totals. The retained directional
      // history is replayed solely to seed per-direction scheduling and breakdowns.
      let position=Math.max(0,data.totalAnswers-data.history.length);
      for (const h of [...data.history].sort((a,b)=>a.at-b.at)) {
        position++;
        if(h.direction!==1 && h.direction!==-1)continue;
        const k=directionKey(h.actual,h.direction);
        const correct=!h.revealed && h.actual===h.chosen;
        data.directionalCards[k]=schedule(data.directionalCards[k]||blankCard(),correct,h.hinted,h.at,position);
        addDirectionalDay(data.directionalDaily,h.at,k,correct);
      }
      data.directionalInitialized=true;
    }
    function readData(saved) {
      const next = saved ? normalizeStore(JSON.parse(saved), maxIndex) : newStore();
      if (!saved) next.cardRange = maxIndex+1;
      initializeDirectional(next);
      return next;
    }
    function sync() {
      if (!available || !storage.updateItem) return;
      const saved = storage.getItem(key);
      if (saved === lastSaved) return;
      try { data = readData(saved); lastSaved = saved; }
      catch { available = false; storageWarning = '检测到损坏的记录，请先导出备份并检查数据。'; }
    }
    function save() {
      if (!available) return false;
      try { storage.setItem(key, JSON.stringify(data)); return true; }
      catch { available = false; storageWarning = '存储失败，请导出记录并检查浏览器存储空间。'; return false; }
    }
    function mutate(change) {
      sync();
      if (available && storage.updateItem) {
        try {
          lastSaved = storage.updateItem(key, saved => {
            const next = readData(saved);
            return JSON.stringify(change(next) || next);
          });
          data = readData(lastSaved);
          return true;
        } catch { available = false; storageWarning = '存储失败，请导出记录并检查浏览器存储空间。'; return false; }
      }
      data = change(data) || data;
      return save();
    }
    if (directional && !data.directionalInitialized) {
      // Migrate the latest stored record, rather than writing an old window copy.
      mutate(next => { initializeDirectional(next); });
    }
    function record({ actual, chosen, revealed = false, hinted = false, low, high, direction = null, firstMode = null, timbre = null, responseMs = null, now = Date.now() }) {
      if (!isValid(actual) || !(isValid(chosen) || (revealed && chosen === null))) throw Error('无效的音程');
      if(directional && direction!==1 && direction!==-1)throw Error('旋律音程缺少方向');
      now=num(now,0,8640000000000000);
      const ms=Number.isFinite(responseMs)?num(responseMs,0,3600000):null;
      const correct=!revealed && actual===chosen;
      mutate(data => {
        data.totalAnswers++;
        const c=schedule(data.cards[actual]||blankCard(),correct,hinted,now,data.totalAnswers);
        if(responseSensitive)recordResponseTime(c,ms);
        data.cards[actual]=c;
        // "Show answer" is a wrong attempt but not a confusion with another interval.
        if(!correct && isValid(chosen)) {
          const pair=`${actual}>${chosen}`;
          data.confusions[pair]=(data.confusions[pair]||0)+1;
        }
        if(directional) {
          const dk=directionKey(actual,direction);
          data.directionalCards[dk]=schedule(data.directionalCards[dk]||blankCard(),correct,hinted,now,data.totalAnswers);
          addDirectionalDay(data.directionalDaily,now,dk,correct);
        }
        data.history.push({at:now,actual,chosen,revealed:!!revealed,hinted:!!hinted,low,high,
          responseMs:ms,direction,firstMode,timbre});
        if(data.history.length>MAX_HISTORY)data.history.splice(0,data.history.length-MAX_HISTORY);
        const today=dayKey(now),d=data.daily[today]||blankDay();
        incrementDay(d,actual,correct,!!hinted,ms);data.daily[today]=d;
        for(const k of Object.keys(data.daily).sort().slice(0,Math.max(0,Object.keys(data.daily).length-MAX_DAYS)))delete data.daily[k];
        if(directional)for(const k of Object.keys(data.directionalDaily).sort().slice(0,Math.max(0,Object.keys(data.directionalDaily).length-MAX_DAYS)))delete data.directionalDaily[k];
      });
      return {correct,dueAt:directional?data.directionalCards[directionKey(actual,direction)]?.dueAt:data.cards[actual]?.dueAt};
    }
    function skip({now = Date.now()} = {}) {
      mutate(data => {
        const today = dayKey(now); const d = data.daily[today] || blankDay();
        d.skipped++; data.daily[today] = d;
      });
    }
    function weightedChoice(choices, weighting, random, uniformShare = 0) {
      const weights = choices.map(s => Math.max(.001, weighting(s)));
      const total = weights.reduce((a,b) => a+b,0);
      const sample=Math.max(0, Math.min(.99999999, random()));
      if(uniformShare>0&&sample<uniformShare){
        return choices[Math.min(choices.length-1,Math.floor(sample/uniformShare*choices.length))];
      }
      let v = (uniformShare>0?(sample-uniformShare)/(1-uniformShare):sample) * total;
      for (let i=0;i<choices.length;i++) { v -= weights[i]; if (v < 0) return choices[i]; }
      return choices[choices.length-1];
    }
    function responseWeight(card) {
      if (!responseSensitive || !card || !card.responseCount) return 1;
      const averageMs=card.responseTotal/card.responseCount;
      // Longer answers gain weight gradually; every note keeps a base weight of 1.
      return 1+Math.log1p(averageMs/1000);
    }
    function choose(eligible, previous = null, {now = Date.now(), random = Math.random} = {}) {
      sync();
      let choices=directional
        ? [...new Set(eligible.filter(isValid).flatMap(semi=>[`${semi}:up`,`${semi}:down`]))]
        : [...new Set(eligible.filter(isValid))];
      if(!choices.length)return null;
      if(choices.length>1)choices=choices.filter(s=>s!==previous);
      const cards=directional?data.directionalCards:data.cards;
      const today=directional?{intervals:data.directionalDaily[dayKey(now)]||{}}:(data.daily[dayKey(now)]||blankDay());
      const yesterday=directional?{intervals:data.directionalDaily[dayKey(addCalendarDays(now,-1))]||{}}:(data.daily[dayKey(addCalendarDays(now,-1))]||blankDay());
      const ready=choices.filter(k=>{
        const c=cards[k];return !c||c.pendingAfter===null||c.pendingAfter===undefined||data.totalAnswers>=c.pendingAfter||dayKey(c.lastAt)!==dayKey(now);
      });
      if(ready.length)choices=ready;
      const focus=choices.filter(k=>{
        const prev=yesterday.intervals[k],curr=today.intervals[k];
        return prev&&prev.answered>prev.correct&&(!curr||curr.answered<Math.min(2,prev.answered-prev.correct+1));
      });
      const todayAnswers=directional?Object.values(today.intervals).reduce((n,v)=>n+v.answered,0):today.answered;
      if(focus.length&&(todayAnswers===0||random()<.42)) {
        return weightedChoice(focus,k=>{const v=yesterday.intervals[k];return (1+2*(v.answered-v.correct)/v.answered)*responseWeight(cards[k]);},random,responseSensitive ? .2 : 0);
      }
      return weightedChoice(choices,k=>{
        const c=cards[k];if(!c)return 1;
        return (1+2*c.wrong/Math.max(1,c.attempts)+(c.dueAt&&c.dueAt<=now?5:0)+
          (c.pendingAfter!==null&&c.pendingAfter!==undefined&&data.totalAnswers>=c.pendingAfter?12:0))*responseWeight(c);
      },random,responseSensitive ? .2 : 0);
    }
    function analysis(enabled = Array.from({length:maxIndex+1},(_,i)=>i), now=Date.now()) {
      sync();
      const cards = Array.from({length:maxIndex+1},(_,semi)=>({semi,...(data.cards[semi] || {attempts:0,correct:0,wrong:0,dueAt:0,pendingAfter:null})}));
      const inScope = cards.filter(c => enabled.includes(c.semi));
      const directionCards=directional?enabled.flatMap(semi=>[1,-1].map(dir=>{
        const k=directionKey(semi,dir);return {key:k,semi,direction:dir,...(data.directionalCards[k]||blankCard())};
      })):[];
      const due = directional ? directionCards.filter(c=>c.attempts&&c.dueAt<=now) : inScope.filter(c => c.attempts && c.dueAt <= now);
      const weak = inScope.filter(c => c.wrong>0).sort((a,b) => (b.wrong/b.attempts-a.wrong/a.attempts) || b.wrong-a.wrong);
      const confusions = Object.entries(data.confusions).map(([k,count])=>{
        const [actual,chosen]=k.split('>').map(Number); return {actual,chosen,count};
      }).sort((a,b)=>b.count-a.count || a.actual-b.actual);
      const correct=cards.reduce((sum,c)=>sum+c.correct,0);
      const yd=data.daily[dayKey(addCalendarDays(now,-1))] || blankDay();
      const yesterdayWrong = directional
        ? Object.entries(data.directionalDaily[dayKey(addCalendarDays(now,-1))]||{}).filter(([k,i])=>enabled.includes(Number(k.split(':')[0]))&&i.answered>i.correct)
          .map(([k,i])=>({semi:Number(k.split(':')[0]),direction:k.endsWith('up')?1:-1,wrong:i.answered-i.correct}))
        : Object.entries(yd.intervals).filter(([key,i])=>enabled.includes(Number(key))&&i.answered>i.correct).map(([key,i])=>({semi:Number(key),wrong:i.answered-i.correct}));
      return {total:data.totalAnswers,correct,wrong:data.totalAnswers-correct,due,weak,cards,confusions,
        yesterdayWrong,directionCards,storageAvailable:available && storage?.available!==false,storageWarning};
    }
    function statistics(period = 30, now = Date.now()) {
      sync();
      const days = period === 'all' ? null : Math.max(1, Math.min(365,Number(period)||30));
      const todayKey=dayKey(now);
      const minKey = days === null ? '0000-01-01' : dayKey(addCalendarDays(now,1-days));
      const keys = Object.keys(data.daily).filter(k=>k>=minKey&&k<=todayKey).sort();
      const totals={answered:0,correct:0,skipped:0,hints:0,responseTotal:0,responseCount:0};
      const byInterval=Array.from({length:maxIndex+1},(_,semi)=>({semi,answered:0,correct:0}));
      const byDirection=directional?Array.from({length:maxIndex+1},(_,semi)=>[1,-1].map(direction=>({semi,direction,answered:0,correct:0}))).flat():null;
      for (const key of keys) {
        const d = data.daily[key];
        for (const field of Object.keys(totals)) totals[field] += d[field] || 0;
        for (const [s,i] of Object.entries(d.intervals)) if (byInterval[Number(s)]) {
          byInterval[Number(s)].answered+=i.answered;
          byInterval[Number(s)].correct+=i.correct;
        }
      }
      if(directional) for (const day of keys)for(const [dk,v] of Object.entries(data.directionalDaily[day]||{})) {
        const row=byDirection.find(r=>directionKey(r.semi,r.direction)===dk);
        if(row){row.answered+=v.answered;row.correct+=v.correct;}
      }
      const trend=[];
      if (days!==null) {
        for(let i=days-1;i>=0;i--) {const key=dayKey(addCalendarDays(now,-i));trend.push({day:key,...(data.daily[key]||blankDay())});}
      } else {
        for (const key of keys) trend.push({day:key,...data.daily[key]});
      }
      const filteredHistory=data.history.filter(h=>dayKey(h.at)>=minKey && dayKey(h.at)<=todayKey);
      const history=filteredHistory.slice(-80).reverse();
      const confusions= days===null ? analysis().confusions : Object.entries(filteredHistory.reduce((acc,h)=>{
        if(!h.revealed && isValid(h.chosen) && h.actual!==h.chosen){const key=`${h.actual}>${h.chosen}`;acc[key]=(acc[key]||0)+1;} return acc;
      },{})).map(([key,count])=>{const [actual,chosen]=key.split('>').map(Number);return {actual,chosen,count};}).sort((a,b)=>b.count-a.count);
      const directionConfusions=directional?Object.entries(filteredHistory.reduce((acc,h)=>{
        if(!h.revealed&&isValid(h.chosen)&&h.actual!==h.chosen&&(h.direction===1||h.direction===-1)){
          const k=`${h.direction}:${h.actual}>${h.chosen}`;acc[k]=(acc[k]||0)+1;}return acc;
      },{})).map(([key,count])=>{const [dir,pair]=key.split(':');const [actual,chosen]=pair.split('>').map(Number);
        return {direction:Number(dir),actual,chosen,count};}).sort((a,b)=>b.count-a.count):null;
      const allDays=Object.keys(data.daily).filter(k=>data.daily[k].answered>0).sort();
      const practiced=new Set(allDays);
      let date = (practiced.has(todayKey)?now:addCalendarDays(now,-1));
      let streak=0;
      while (practiced.has(dayKey(date)) && streak<MAX_DAYS) {streak++;date=addCalendarDays(date,-1);}
      return {period,totals,byInterval,byDirection,directionConfusions,directional,trend,history,practiceDays:keys.filter(k=>data.daily[k].answered>0).length,
        streak,allTime:data.totalAnswers,confusions,storageAvailable:available && storage?.available!==false,
        yesterdayWrong:analysis(undefined,now).yesterdayWrong,
        due:analysis(undefined,now).due.length};
    }
    function importJson(json) {
      const next=readData(json); const prev=data;
      if (!mutate(() => next)) {data=prev;throw Error('无法保存导入的记录');}
      return analysis();
    }
    function reset() {mutate(() => {const next=newStore();next.cardRange=maxIndex+1;initializeDirectional(next);return next;});}
    return {record,skip,choose,analysis,statistics,importJson,reset,
      exportJson:()=>{sync();return JSON.stringify(data,null,2);}, snapshot:()=>{sync();return JSON.parse(JSON.stringify(data));},
      get storageAvailable(){return available && storage?.available!==false;}
    };
  }
  root.IntervalReview=Object.freeze({createReviewManager,normalizeStore,dayKey,addCalendarDays});
})(typeof window!=='undefined'?window:globalThis);
