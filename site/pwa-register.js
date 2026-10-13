/* Non-disruptive PWA update prompt. Never clears IndexedDB or site storage. */
(function(){
  'use strict';
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  let refreshing=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!refreshing){refreshing=true;window.location.reload();}
  });
  function offerUpdate(worker){
    if(!worker || document.getElementById('pwa-update-notice'))return;
    const notice=document.createElement('div');notice.id='pwa-update-notice';notice.className='pwa-update-notice';
    const msg=document.createElement('span');msg.textContent='程序有新版本';
    const update=document.createElement('button');update.type='button';update.textContent='立即更新';
    const later=document.createElement('button');later.type='button';later.textContent='稍后';
    update.addEventListener('click',()=>{update.disabled=true;update.textContent='正在更新…';worker.postMessage({type:'SKIP_WAITING'});});
    later.addEventListener('click',()=>notice.remove());
    notice.append(msg,update,later);document.body.appendChild(notice);
  }
  window.addEventListener('load',async()=>{
    try{
      const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
      if(registration.waiting && navigator.serviceWorker.controller)offerUpdate(registration.waiting);
      registration.addEventListener('updatefound',()=>{
        const worker=registration.installing;
        if(worker)worker.addEventListener('statechange',()=>{
          if(worker.state==='installed' && navigator.serviceWorker.controller)offerUpdate(worker);
        });
      });
      if(navigator.onLine)registration.update().catch(()=>{});
    }catch(e){console.warn('离线缓存注册失败，请使用 HTTPS 或 localhost',e);}
  });
})();
