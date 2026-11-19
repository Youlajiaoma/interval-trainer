/* User-produced recordings. src is relative to site/, never a local disk path. */
(function (root) {
  'use strict';
  root.TonaloomHarmonySongs = Object.freeze([
    Object.freeze({id:'zai-ta-xiang', title:'在他乡', stems:Object.freeze({
      melody:'assets/harmony-practice/zai-ta-xiang/melody.wav',
      harmony:'assets/harmony-practice/zai-ta-xiang/harmony.wav'
    }), tracks:Object.freeze([
      Object.freeze({id:'melody-harmony', title:'旋律+和声', mix:Object.freeze(['melody','harmony'])}),
      Object.freeze({id:'accompaniment', title:'伴奏', src:null})
    ])})
  ]);
})(window);
