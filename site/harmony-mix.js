/* Keep separate stems in one temporary multichannel transport and one clock.
 * The media element supplies background/loop/seek behavior; Web Audio applies
 * independent gains. Prepared transports are saved locally, never uploaded.
 */
(function (root) {
  'use strict';
  const stemIds = ['melody','harmony','guitar'];
  const transportCache = 'interval-trainer-harmony-transports-v1';
  function pack(stems) {
    if (![2,3].includes(stems.length) || stems.some(stem => stem.numberOfChannels < 1 || stem.numberOfChannels > 2 || stem.sampleRate !== stems[0].sampleRate)) {
      throw Error('需要两至三段采样率相同的单声道或立体声音频');
    }
    const stereo = stems.some(stem => stem.numberOfChannels === 2), channels = stems.length*(stereo ? 2 : 1);
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
    return {bytes,stereo,stemCount:stems.length,duration:frames/rate};
  }
  function create(media) {
    const channel = root.TonaloomAudio.createChannel(1), cache = new Map(), transports = new Set();
    let epoch = 0, silentURL = null, graph = null, silent = false;
    const volumes = [100,100,100], muted = [false,false,false];
    function prepare(urls) {
      const key = JSON.stringify(urls), ownEpoch = epoch;
      if (!cache.has(key)) {
        const pending = (async () => {
          let disk, request, blob, transport;
          try {
            if (root.caches) {
              disk = await root.caches.open(transportCache);
              const sources = urls.map(url => new URL(url,root.document.baseURI).href);
              request = new URL('./__harmony_transport__?sources='+encodeURIComponent(JSON.stringify(sources)),root.document.baseURI).href;
              const saved = await disk.match(request);
              if (saved) {
                transport = {stereo:saved.headers.get('X-Tonaloom-Stereo') === 'true',
                  stemCount:Number(saved.headers.get('X-Tonaloom-Stems')),duration:Number(saved.headers.get('X-Tonaloom-Duration'))};
                if (transport.stemCount === urls.length && Number.isFinite(transport.duration) && transport.duration > 0) blob = await saved.blob();
              }
            }
          } catch { /* A restricted cache must not prevent normal playback. */ }
          if (!blob) {
            const stems = await Promise.all(urls.map(url => channel.recording(url)));
            if (ownEpoch !== epoch) throw Error('混合音轨加载已取消');
            transport = pack(stems);
            blob = new Blob([transport.bytes],{type:'audio/wav'});
            if (disk && request) try {
              await disk.put(request,new Response(blob,{headers:{'Content-Type':'audio/wav',
                'X-Tonaloom-Stereo':String(transport.stereo),'X-Tonaloom-Stems':String(transport.stemCount),
                'X-Tonaloom-Duration':String(transport.duration)}}));
            } catch { /* Original recordings remain playable if storage is full. */ }
          }
          if (ownEpoch !== epoch) throw Error('混合音轨加载已取消');
          const url = URL.createObjectURL(blob);
          transports.add(url);
          return {stereo:transport.stereo,stemCount:transport.stemCount,duration:transport.duration,url};
        })();
        cache.set(key,pending);
        pending.catch(() => { if (cache.get(key) === pending) cache.delete(key); });
      }
      return cache.get(key);
    }
    async function ready() {
      const context = await channel.ready();
      if (!graph) {
        const source = context.createMediaElementSource(media), splitter = context.createChannelSplitter(6);
        const mergers = Array.from({length:3},() => context.createChannelMerger(2));
        const levels = mergers.map(() => context.createGain());
        source.connect(splitter);
        mergers.forEach((node,i) => { node.connect(levels[i]); levels[i].connect(context.destination); });
        graph = {context,source,splitter,mergers,levels,stemCount:0};
        updateLevels(true);
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
      graph.stemCount = transport.stemCount;
      for (let stem=0;stem<transport.stemCount;stem++) for (let side=0;side<2;side++) {
        splitter.connect(mergers[stem],transport.stereo ? stem*2+side : stem,side);
      }
      media.pause(); media.src = transport.url; media.load();
      updateLevels(true);
    }
    function single() {
      if (graph) { graph.source.disconnect(); graph.source.connect(graph.context.destination); }
    }
    function updateLevels(immediate = false) {
      if (graph) {
        const at = graph.context.currentTime;
        graph.levels.forEach((node,i) => {
          const target = silent || muted[i] || i >= graph.stemCount ? 0 : volumes[i]/100, parameter = node.gain;
          parameter.cancelScheduledValues(at);
          parameter.setValueAtTime(immediate ? target : parameter.value,at);
          if (!immediate) parameter.linearRampToValueAtTime(target,at+.008);
        });
      }
    }
    function stemIndex(id) {
      const index = stemIds.indexOf(id);
      if (index < 0) throw Error('未知音轨：'+id);
      return index;
    }
    function setVolume(id,value) {
      const index = stemIndex(id);
      volumes[index] = Number.isFinite(value) ? Math.max(0,Math.min(100,value)) : 100;
      updateLevels(); return volumes[index];
    }
    function setMuted(id,value) { muted[stemIndex(id)] = Boolean(value); updateLevels(Boolean(value)); }
    function setSilent(value) { silent = Boolean(value); updateLevels(silent); }
    function release() {
      epoch++;
      for (const url of transports) URL.revokeObjectURL(url);
      transports.clear(); cache.clear();
      if (silentURL) URL.revokeObjectURL(silentURL);
      silentURL = null;
    }
    return {prepare,prime,ready,assign,single,resume:() => graph ? channel.ready() : undefined,
      setVolume,setMuted,setSilent,release};
  }
  root.TonaloomHarmonyMix = Object.freeze({pack,create});
})(window);
