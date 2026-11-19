/* Keep separate stems in one temporary multichannel transport and one clock.
 * The media element supplies background/loop/seek behavior; Web Audio applies
 * independent gains. No mixed recording is written or uploaded.
 */
(function (root) {
  'use strict';
  function gains(value) {
    const balance = Number.isFinite(value) ? Math.max(-100,Math.min(100,value)) : 0;
    return {melody:balance < 0 ? (100+balance)/100 : 1, harmony:balance > 0 ? (100-balance)/100 : 1};
  }
  function pack(stems) {
    if (stems.length !== 2 || stems.some(stem => stem.numberOfChannels < 1 || stem.numberOfChannels > 2) || stems[0].sampleRate !== stems[1].sampleRate) {
      throw Error('需要两段单声道或立体声音频');
    }
    const stereo = stems.some(stem => stem.numberOfChannels === 2), channels = stereo ? 4 : 2;
    const frames = Math.max(...stems.map(stem => stem.length)), rate = stems[0].sampleRate;
    const bytes = new ArrayBuffer(44+frames*channels*4), view = new DataView(bytes);
    const text = (at,value) => { for (let i=0;i<value.length;i++) view.setUint8(at+i,value.charCodeAt(i)); };
    text(0,'RIFF'); view.setUint32(4,bytes.byteLength-8,true); text(8,'WAVEfmt ');
    view.setUint32(16,16,true); view.setUint16(20,3,true); view.setUint16(22,channels,true);
    view.setUint32(24,rate,true); view.setUint32(28,rate*channels*4,true);
    view.setUint16(32,channels*4,true); view.setUint16(34,32,true);
    text(36,'data'); view.setUint32(40,frames*channels*4,true);
    const inputs = stereo ? stems.flatMap(stem => [stem.getChannelData(0),stem.getChannelData(stem.numberOfChannels-1)])
      : stems.map(stem => stem.getChannelData(0));
    for (let frame=0;frame<frames;frame++) for (let channel=0;channel<channels;channel++) {
      view.setFloat32(44+(frame*channels+channel)*4,inputs[channel][frame] ?? 0,true);
    }
    return {bytes,stereo,duration:frames/rate};
  }
  function create(media) {
    const channel = root.TonaloomAudio.createChannel(1), cache = new Map(), transports = new Set();
    let epoch = 0, silentURL = null, graph = null, balance = 0, muted = false;
    function prepare(urls) {
      const key = JSON.stringify(urls), ownEpoch = epoch;
      if (!cache.has(key)) {
        const pending = Promise.all(urls.map(url => channel.recording(url))).then(stems => {
          if (ownEpoch !== epoch) throw Error('混合音轨加载已取消');
          const transport = pack(stems);
          const url = URL.createObjectURL(new Blob([transport.bytes],{type:'audio/wav'}));
          transports.add(url);
          return {stereo:transport.stereo,duration:transport.duration,url};
        });
        cache.set(key,pending);
        pending.catch(() => { if (cache.get(key) === pending) cache.delete(key); });
      }
      return cache.get(key);
    }
    async function ready() {
      const context = await channel.ready();
      if (!graph) {
        const source = context.createMediaElementSource(media), splitter = context.createChannelSplitter(4);
        const mergers = [context.createChannelMerger(2),context.createChannelMerger(2)];
        const levels = [context.createGain(),context.createGain()];
        source.connect(splitter);
        mergers.forEach((node,i) => { node.connect(levels[i]); levels[i].connect(context.destination); });
        graph = {context,source,splitter,mergers,levels};
        setBalance(balance,true);
      }
      return context;
    }
    function prime() {
      // Unlock this same media element in the click, even if downloads take time.
      if (!silentURL) {
        const silence = new Float32Array(4410);
        const transport = pack([0,1].map(() => ({numberOfChannels:1,length:silence.length,sampleRate:44100,getChannelData:() => silence})));
        silentURL = URL.createObjectURL(new Blob([transport.bytes],{type:'audio/wav'}));
      }
      media.src = silentURL; media.loop = true; media.load();
      const device = ready(), activation = media.play();
      return Promise.all([device,activation]);
    }
    function assign(transport) {
      const {source,splitter,mergers} = graph;
      source.disconnect(); source.connect(splitter);
      splitter.disconnect();
      for (let stem=0;stem<2;stem++) for (let side=0;side<2;side++) {
        splitter.connect(mergers[stem],transport.stereo ? stem*2+side : stem,side);
      }
      media.pause(); media.src = transport.url; media.load();
      setBalance(balance,true);
    }
    function single() {
      if (graph) { graph.source.disconnect(); graph.source.connect(graph.context.destination); }
    }
    function setBalance(value,immediate = false) {
      balance = Number.isFinite(value) ? Math.max(-100,Math.min(100,value)) : 0;
      if (graph) {
        const values = gains(balance), at = graph.context.currentTime;
        graph.levels.forEach((node,i) => {
          const target = muted ? 0 : i === 0 ? values.melody : values.harmony, parameter = node.gain;
          parameter.cancelScheduledValues(at);
          parameter.setValueAtTime(immediate ? target : parameter.value,at);
          if (!immediate) parameter.linearRampToValueAtTime(target,at+.008);
        });
      }
      return gains(balance);
    }
    function setMuted(value) { muted = Boolean(value); setBalance(balance,muted); }
    function release() {
      epoch++;
      for (const url of transports) URL.revokeObjectURL(url);
      transports.clear(); cache.clear();
      if (silentURL) URL.revokeObjectURL(silentURL);
      silentURL = null;
    }
    return {prepare,prime,ready,assign,single,resume:() => graph ? channel.ready() : undefined,setBalance,setMuted,release};
  }
  root.TonaloomHarmonyMix = Object.freeze({gains,pack,create});
})(window);
