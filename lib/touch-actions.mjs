/** A stationary primary touch opens actions; scrolling, release and cancel stop it.
 * @param {()=>void} open
 * @param {{schedule?:(fn:()=>void,ms:number)=>any,cancel?:(id:any)=>void}} timers */
export function longPress(open, { schedule = setTimeout, cancel = clearTimeout } = {}) {
  let timer;
  let point;
  const stop = () => { if (timer !== undefined) cancel(timer); timer = undefined; point = undefined; };
  return {
    start(event) {
      stop();
      if (!event.isPrimary || !['touch', 'pen'].includes(event.pointerType)) return;
      point = { x: event.clientX, y: event.clientY };
      timer = schedule(() => { timer = undefined; point = undefined; open(); }, 550);
    },
    move(event) { if (point && Math.hypot(event.clientX - point.x, event.clientY - point.y) > 10) stop(); },
    stop,
  };
}
