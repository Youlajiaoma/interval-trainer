/* User-produced recordings. src is relative to site/, never a local disk path. */
(function (root) {
  'use strict';
  root.TonaloomHarmonySongs = Object.freeze([
    Object.freeze({id:'zai-ta-xiang', title:'在他乡', stems:Object.freeze({
      melody:'assets/harmony-practice/zai-ta-xiang/melody.wav?v=c0f9b8edcd8d',
      harmony:'assets/harmony-practice/zai-ta-xiang/harmony.wav?v=5e875bc7f4b5',
      guitar:'assets/harmony-practice/zai-ta-xiang/guitar.wav?v=aedd4595fdff'
    }), tracks:Object.freeze([
      Object.freeze({id:'ensemble', title:'在他乡', mix:Object.freeze(['melody','harmony','guitar'])})
    ])}),
    Object.freeze({id:'li-hua-zai-kai-fang', title:'梨花再开放', stems:Object.freeze({
      melody:'assets/harmony-practice/li-hua-zai-kai-fang/melody.wav?v=81fd901f4295',
      harmony:'assets/harmony-practice/li-hua-zai-kai-fang/harmony.wav?v=17c939c96670',
      guitar:'assets/harmony-practice/li-hua-zai-kai-fang/guitar.wav?v=a1c3d36916d9'
    }), tracks:Object.freeze([
      Object.freeze({id:'ensemble', title:'梨花再开放', mix:Object.freeze(['melody','harmony','guitar'])})
    ])})
  ]);
})(typeof window !== 'undefined' ? window : self);
