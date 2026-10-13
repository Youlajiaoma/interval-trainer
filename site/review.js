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
  const newStore = () => ({version: 1, totalAnswers: 0, cards: {}, confusions: {}, history: [], daily: {}});
  function blankDay() { return {answered: 0, correct: 0, hints: 0, skipped: 0, responseTotal: 0, responseCount: 0, intervals: {}}; }
  function incrementDay(d, actual, correct, hinted, responseMs) {
    d.answered++; if (correct) d.correct++; if (hinted) d.hints++;
    if (responseMs !== null) { d.responseTotal += responseMs; d.responseCount++; }
    const i = d.intervals[actual] || {answered: 0, correct: 0};
    i.answered++; if (correct) i.correct++;
    d.intervals[actual] = i;
  }
  function cleanDay(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return blankDay();
    const result = blankDay();
    result.answered = num(v.answered, 0, 1000000);
    result.correct = num(v.correct, 0, result.answered);
    result.hints = num(v.hints, 0, result.answered);
    result.skipped = num(v.skipped, 0, 1000000);
    result.responseCount = num(v.responseCount, 0, result.answered);
    result.responseTotal = num(v.responseTotal, 0, 1e12);
    for (const [k, i] of Object.entries(v.intervals || {})) {
      if (!/^\d{1,2}$/.test(k) || !valid(Number(k)) || !i) continue;
      const answered = num(i.answered, 0, 1000000);
      result.intervals[k] = {answered, correct: num(i.correct, 0, answered)};
    }
    return result;
  }
  function normalizeStore(raw) {
    if (!raw || raw.version !== 1 || typeof raw !== 'object' || Array.isArray(raw)) throw Error('不支持的记录格式');
    const data = newStore();
    for (let n = 0; n <= 12; n++) {
      const c = raw.cards?.[n]; if (!c || typeof c !== 'object') continue;
      const attempts = num(c.attempts, 0, 1000000);
      const correct = num(c.correct, 0, attempts);
      data.cards[n] = {
        attempts, correct, wrong: attempts - correct,
        repetitions: num(c.repetitions, 0, 100000), intervalDays: num(c.intervalDays, 0, 3650),
        ease: num(c.ease, 1.3, 3.5, 2.5), dueAt: num(c.dueAt, 0, 8640000000000000),
        lastAt: num(c.lastAt, 0, 8640000000000000),
        pendingAfter: Number.isFinite(c.pendingAfter) ? num(c.pendingAfter, 0, 10000000) : null,
        streak: num(c.streak, 0, 100000)
      };
    }
    for (const [k, count] of Object.entries(raw.confusions || {})) {
      const pair = k.split('>');
      if (pair.length !== 2 || pair.some(x => !/^\d{1,2}$/.test(x) || !valid(Number(x))) || pair[0] === pair[1]) continue;
      data.confusions[k] = num(count, 0, 1000000);
    }
    for (const h of (Array.isArray(raw.history) ? raw.history.slice(-MAX_HISTORY) : [])) {
      if (!h || !valid(h.actual) || !valid(h.chosen)) continue;
      data.history.push({at: num(h.at, 0, 8640000000000000), actual: h.actual, chosen: h.chosen,
        hinted: !!h.hinted, low: num(h.low, 0, 127), high: num(h.high, 0, 127),
        responseMs: Number.isFinite(h.responseMs) ? num(h.responseMs, 0, 3600000) : null});
    }
    if (raw.daily && typeof raw.daily === 'object' && !Array.isArray(raw.daily)) {
      for (const [key, item] of Object.entries(raw.daily).filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key)).sort().slice(-MAX_DAYS))
        data.daily[key] = cleanDay(item);
    } else {
      // 无缝迁移 v1.3：用旧记录构建过去的逐日数据（仅覆盖历史保留范围）。
      for (const h of data.history) {
        const key = dayKey(h.at);
        const d = data.daily[key] || blankDay();
        incrementDay(d, h.actual, h.actual === h.chosen, h.hinted, h.responseMs);
        data.daily[key] = d;
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
  function createReviewManager(storage) {
    let available = storageAvailable(storage);
    let data = newStore();
    let storageWarning = '';
    if (available) {
      try { const saved = storage.getItem(STORAGE_KEY); if (saved) data = normalizeStore(JSON.parse(saved)); }
      catch { storageWarning = '检测到损坏的旧记录，原始存储没有被自动删除。请先导出备份再继续练习。'; available = false; }
    }
    function save() {
      if (!available) return false;
      try { storage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; }
      catch { available = false; storageWarning = '存储失败，请导出记录并检查浏览器存储空间。'; return false; }
    }
    function record({ actual, chosen, hinted = false, low, high, responseMs = null, now = Date.now() }) {
      if (!valid(actual) || !valid(chosen)) throw Error('无效的音程');
      now = num(now, 0, 8640000000000000);
      const correct = actual === chosen;
      const c = data.cards[actual] || {attempts:0,correct:0,wrong:0,repetitions:0,intervalDays:0,ease:2.5,dueAt:0,lastAt:0,pendingAfter:null,streak:0};
      data.totalAnswers++; c.attempts++; c.lastAt = now;
      if (correct) { c.correct++; c.streak++; } else { c.wrong++; c.streak = 0; }
      const grade = correct ? (hinted ? 3 : 5) : 1;
      const delta = 5 - grade;
      c.ease = Math.max(1.3, Math.min(3.5, c.ease + .1 - delta * (.08 + delta * .02)));
      if (!correct) {
        c.repetitions = 0; c.intervalDays = 1;
        c.pendingAfter = data.totalAnswers + 2;
        const confusionKey = `${actual}>${chosen}`;
        data.confusions[confusionKey] = (data.confusions[confusionKey] || 0) + 1;
      } else {
        c.repetitions++;
        c.intervalDays = c.repetitions === 1 ? 1 : c.repetitions === 2 ? 3 :
          Math.min(3650, Math.max(1, Math.round(c.intervalDays * c.ease)));
        c.pendingAfter = null;
      }
      c.dueAt = addCalendarDays(now, c.intervalDays);
      data.cards[actual] = c;
      const ms = Number.isFinite(responseMs) ? num(responseMs, 0, 3600000) : null;
      data.history.push({at: now, actual, chosen, hinted: !!hinted, low, high, responseMs:ms});
      if (data.history.length > MAX_HISTORY) data.history.splice(0, data.history.length - MAX_HISTORY);
      const today = dayKey(now);
      const d = data.daily[today] || blankDay();
      incrementDay(d, actual, correct, !!hinted, ms); data.daily[today] = d;
      const days = Object.keys(data.daily).sort();
      for (const k of days.slice(0, Math.max(0, days.length-MAX_DAYS))) delete data.daily[k];
      save();
      return {correct, dueAt:c.dueAt};
    }
    function skip({now = Date.now()} = {}) {
      const today = dayKey(now); const d = data.daily[today] || blankDay();
      d.skipped++; data.daily[today] = d; save();
    }
    function weightedChoice(choices, weighting, random) {
      const weights = choices.map(s => Math.max(.001, weighting(s)));
      const total = weights.reduce((a,b) => a+b,0);
      let v = Math.max(0, Math.min(.99999999, random())) * total;
      for (let i=0;i<choices.length;i++) { v -= weights[i]; if (v < 0) return choices[i]; }
      return choices[choices.length-1];
    }
    function choose(eligible, previous = null, {now = Date.now(), random = Math.random} = {}) {
      let choices = [...new Set(eligible.filter(valid))];
      if (!choices.length) return null;
      if (choices.length > 1) choices = choices.filter(semi => semi !== previous);
      const ready = choices.filter(s => {
        const c = data.cards[s];
        return !c || c.pendingAfter == null || data.totalAnswers >= c.pendingAfter || dayKey(c.lastAt) !== dayKey(now);
      });
      if (ready.length) choices = ready;
      if (!choices.length) return null;
      const today = data.daily[dayKey(now)] || blankDay();
      const yesterday = data.daily[dayKey(addCalendarDays(now, -1))] || blankDay();
      const focus = choices.filter(s => {
        const prev = yesterday.intervals[s], curr = today.intervals[s];
        // 昨日有误的音程，今天至少优先复查一次，最多获得两次强制优先。
        return prev && prev.answered > prev.correct && (!curr || curr.answered < Math.min(2, prev.answered-prev.correct+1));
      });
      if (focus.length && (today.answered === 0 || random() < .42)) {
        return weightedChoice(focus, s => {
          const i = yesterday.intervals[s];
          return 1 + 2 * (i.answered-i.correct) / i.answered;
        }, random);
      }
      return weightedChoice(choices, s => {
        const c = data.cards[s]; if (!c) return 1;
        const error = c.wrong / Math.max(1,c.attempts);
        const due = c.dueAt && c.dueAt <= now ? 5 : 0;
        const pending = c.pendingAfter !== null && data.totalAnswers >= c.pendingAfter ? 12 : 0;
        return 1 + 2 * error + due + pending;
      }, random);
    }
    function analysis(enabled = Array.from({length:13},(_,i)=>i), now=Date.now()) {
      const cards = Array.from({length:13},(_,semi)=>({semi,...(data.cards[semi] || {attempts:0,correct:0,wrong:0,dueAt:0,pendingAfter:null})}));
      const inScope = cards.filter(c => enabled.includes(c.semi));
      const due = inScope.filter(c => c.attempts && c.dueAt <= now);
      const weak = inScope.filter(c => c.wrong>0).sort((a,b) => (b.wrong/b.attempts-a.wrong/a.attempts) || b.wrong-a.wrong);
      const confusions = Object.entries(data.confusions).map(([k,count])=>{
        const [actual,chosen]=k.split('>').map(Number); return {actual,chosen,count};
      }).sort((a,b)=>b.count-a.count || a.actual-b.actual);
      const correct=cards.reduce((sum,c)=>sum+c.correct,0);
      const yd=data.daily[dayKey(addCalendarDays(now,-1))] || blankDay();
      const yesterdayWrong = Object.entries(yd.intervals).filter(([key,i])=>enabled.includes(Number(key))&&i.answered>i.correct).map(([key,i])=>({semi:Number(key),wrong:i.answered-i.correct}));
      return {total:data.totalAnswers,correct,wrong:data.totalAnswers-correct,due,weak,cards,confusions,
        yesterdayWrong,storageAvailable:available,storageWarning};
    }
    function statistics(period = 30, now = Date.now()) {
      const days = period === 'all' ? null : Math.max(1, Math.min(365,Number(period)||30));
      const todayKey=dayKey(now);
      const minKey = days === null ? '0000-01-01' : dayKey(addCalendarDays(now,1-days));
      const keys = Object.keys(data.daily).filter(k=>k>=minKey&&k<=todayKey).sort();
      const totals={answered:0,correct:0,skipped:0,hints:0,responseTotal:0,responseCount:0};
      const byInterval=Array.from({length:13},(_,semi)=>({semi,answered:0,correct:0}));
      for (const key of keys) {
        const d = data.daily[key];
        for (const field of Object.keys(totals)) totals[field] += d[field] || 0;
        for (const [s,i] of Object.entries(d.intervals)) if (byInterval[Number(s)]) {
          byInterval[Number(s)].answered+=i.answered;
          byInterval[Number(s)].correct+=i.correct;
        }
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
        if(h.actual!==h.chosen){const key=`${h.actual}>${h.chosen}`;acc[key]=(acc[key]||0)+1;} return acc;
      },{})).map(([key,count])=>{const [actual,chosen]=key.split('>').map(Number);return {actual,chosen,count};}).sort((a,b)=>b.count-a.count);
      const allDays=Object.keys(data.daily).filter(k=>data.daily[k].answered>0).sort();
      const practiced=new Set(allDays);
      let date = (practiced.has(todayKey)?now:addCalendarDays(now,-1));
      let streak=0;
      while (practiced.has(dayKey(date)) && streak<MAX_DAYS) {streak++;date=addCalendarDays(date,-1);}
      return {period,totals,byInterval,trend,history,practiceDays:keys.filter(k=>data.daily[k].answered>0).length,
        streak,allTime:data.totalAnswers,confusions,storageAvailable:available,
        yesterdayWrong:analysis(undefined,now).yesterdayWrong,
        due:analysis(undefined,now).due.length};
    }
    function importJson(json) {
      const next=normalizeStore(JSON.parse(json)); const prev=data;
      data=next; if (!save()) {data=prev;throw Error('无法保存导入的记录');}
      return analysis();
    }
    function reset() {data=newStore();save();}
    return {record,skip,choose,analysis,statistics,importJson,reset,
      exportJson:()=>JSON.stringify(data,null,2), snapshot:()=>JSON.parse(JSON.stringify(data)),
      get storageAvailable(){return available;}
    };
  }
  root.IntervalReview=Object.freeze({createReviewManager,normalizeStore,dayKey,addCalendarDays});
})(typeof window!=='undefined'?window:globalThis);
