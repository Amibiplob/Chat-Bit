export function shouldNotify({hidden,permission,enabled}) {return hidden && permission==='granted' && enabled;}
export function notify(kind,tag,enabled) {
  if(typeof Notification==='undefined' || !shouldNotify({hidden:document.visibilityState==='hidden',permission:Notification.permission,enabled})) return;
  try {const notification=new Notification(kind==='call'?'Incoming ChatBit call':'New ChatBit message',{body:'Open ChatBit to view it.',tag:`chatbit-${tag}`});
    notification.onclick=()=>{window.focus();notification.close();};setTimeout(()=>notification.close(),15000);
  } catch { /* Some mobile browsers require service worker notifications; in-app delivery continues. */ }
}
