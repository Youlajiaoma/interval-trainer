/* Stable module identity and storage names. Runtime behavior stays in each module. */
(function (root) {
  'use strict';
  const settingsKey = 'interval-trainer-settings';
  const definitions = [
    {id:'harmonic', name:'和声音程', homeId:'home-harmonic', statsId:'stats-harmonic', backupField:'harmonic',
      hearing:true, settingsKey, reviews:[{key:'interval-trainer-review-v1', maxIndex:12}]},
    {id:'melodic', name:'旋律音程', homeId:'home-melodic', statsId:'stats-melodic', backupField:'melodic',
      hearing:true, settingsKey, reviews:[{key:'interval-trainer-review-melodic-v1', maxIndex:12, directional:true}]},
    {id:'sight', name:'音符辨认', homeId:'home-sight', statsId:'stats-sight', backupField:'sight',
      settingsKey:'interval-trainer-sight-settings-v1', sessionKey:'interval-trainer-sight-session-v1',
      reviews:[{part:'treble', key:'interval-trainer-review-sight-treble-v1', maxIndex:62},
        {part:'bass', key:'interval-trainer-review-sight-bass-v1', maxIndex:62}]},
    {id:'staff', name:'音程辨认', homeId:'home-staff-interval', statsId:'stats-staff', backupField:'staffInterval',
      sessionKey:'tonaloom-staff-interval-v1', reviews:[{key:'tonaloom-staff-interval-review-v1', maxIndex:12}]}
  ].map(item => Object.freeze({...item, reviews:Object.freeze(item.reviews.map(Object.freeze))}));
  const list = Object.freeze(definitions), implementations = new Map();
  let statisticsMode = 'harmonic', showStatistics = null;
  function definition(id) {
    const item = list.find(module => module.id === id);
    if (!item) throw Error(`未知练习模块：${id}`);
    return item;
  }
  root.TonaloomModules = Object.freeze({
    list, settingsKey,
    reviewDefinitions:Object.freeze(list.flatMap(module => module.reviews)),
    storageKeys:Object.freeze([...new Set(list.flatMap(module =>
      [...module.reviews.map(review => review.key), module.settingsKey, module.sessionKey].filter(Boolean)))]),
    get(id) { return Object.freeze({...definition(id), ...implementations.get(id)}); },
    register(id, behavior) {
      definition(id);
      if (implementations.has(id)) throw Error(`练习模块重复初始化：${id}`);
      implementations.set(id, Object.freeze({...behavior}));
    },
    get statisticsMode() { return statisticsMode; },
    configureStatistics(initial, handler) { definition(initial); statisticsMode = initial; showStatistics = handler; },
    showStatistics(id, open = true) {
      definition(id); statisticsMode = id;
      showStatistics?.(open);
    }
  });
})(window);
