import { createPerformanceTrace } from './connection-performance.mjs';
/** @typedef {import('./calling-types').CallRecord} CallRecord */
/** @typedef {import('./calling-types').CallingState} CallingState */
/** @typedef {import('./calling-types').CallSnapshot} CallSnapshot */

export const isLiveCall = (call) => Boolean(call && ['ringing','connecting','active'].includes(call.status));
export function mediaError(error) {
  if(error?.name==='NotAllowedError') return 'Microphone/camera permission was denied. Allow access in your browser settings and try again.';
  if(error?.name==='NotFoundError') return 'No suitable microphone or camera was found.';
  if(error?.name==='NotReadableError') return 'The microphone or camera is busy or unavailable.';
  return error instanceof Error ? error.message : 'The call could not connect.';
}

/** Native media and transport are injectable for deterministic and browser tests.
 * @param {{userId:string,tabId:string,onChange:(state:CallingState)=>void,
 * request:(url:string,options?:RequestInit)=>Promise<any>,
 * getMedia:(constraints:MediaStreamConstraints)=>Promise<MediaStream>,
 * createPeer:(config:RTCConfiguration)=>RTCPeerConnection,
 * makeStream:()=>MediaStream, visible?:()=>boolean,
 * now?:()=>number, setTimer?:typeof setTimeout, clearTimer?:typeof clearTimeout}} options
 */
export function createCallingController(options) {
  const {userId,tabId,onChange,request,getMedia,createPeer,makeStream}=options;
  let trace=createPerformanceTrace('calling');
  const now=options.now??Date.now, setTimer=options.setTimer??setTimeout, clearTimer=options.clearTimer??clearTimeout;
  /** @type {CallingState} */
  let state={call:null,local:null,remote:null,error:'',phase:'',muted:false,camera:true,working:false,seconds:0};
  /** @type {RTCPeerConnection|null} */ let peer=null;
  let generation=0, stopped=false, timer, after=0, offered=false, negotiated=false, connecting=false, busyPoll=false, lastSuccess=now();
  let pendingIce=[], signalQueue=Promise.resolve();
  let permissionGeneration=0;
  let pollQueued=false, pollingStarted=false, mediaReady=false, markingConnected=false;
  let mutationVersion=0;
  const locallyEnded=new Set();
  function endLocally(call,status='ended') {
    if(!call) return;
    locallyEnded.add(call.id);if(locallyEnded.size>50) locallyEnded.delete(locallyEnded.values().next().value);
    disposeMedia();emit({call:{...call,status,endedAt:new Date(now()).toISOString()}});
  }
  const emit=(patch={})=> {state={...state,...patch};onChange({...state});};
  const json=(body,keepalive=false)=>({method:'POST',body:JSON.stringify(body),keepalive,signal:AbortSignal.timeout(10000)});
  function disposeMedia() {
    generation++; permissionGeneration++;
    if(peer) {peer.ontrack=null;peer.onicecandidate=null;peer.onconnectionstatechange=null;peer.close();peer=null;}
    state.local?.getTracks().forEach((track)=>track.stop());
    state.remote?.getTracks().forEach((track)=>track.stop());
    mediaReady=false;markingConnected=false;
    pendingIce=[];after=0;offered=false;negotiated=false;connecting=false;signalQueue=Promise.resolve();
    emit({local:null,remote:null,muted:false,camera:true});
  }
  async function command(action,call=state.call,keepalive=false) {
    if(!call) return null;
    return request(`/api/calls/${call.id}`,json({tabId,action},keepalive));
  }
  async function fail(error) {
    const call=state.call;
    endLocally(call,'failed');emit({error:mediaError(error),phase:'Call failed',working:false});
    if(call?.owned && isLiveCall(call)) {
      try {const updated=await command('fail',call);if(state.call?.id===call.id) emit({call:updated});} catch { /* Lease expiry is authoritative if transport is lost. */ }
    }
  }
  function sendSignal(kind,payload,call=state.call) {
    if(!call) return Promise.reject(new Error('Call ended.'));
    const currentGeneration=generation;
    const body={tabId,clientId:crypto.randomUUID(),signal:{kind,payload}};
    const send=async()=> {
      if(stopped || currentGeneration!==generation) return;
      let last;
      for(let attempt=0;attempt<3;attempt++) {
        try {await request(`/api/calls/${call.id}/signals`,json(body));return;}
        catch(error) {last=error;if(error.status && error.status<500) break;}
        if(stopped || currentGeneration!==generation) return;
      }
      throw last;
    };
    const result=signalQueue.then(() => trace.step(kind==='ice'?'ice-candidate':kind,send));signalQueue=result.catch(()=>{});return result;
  }
  async function markConnected() {
    if(markingConnected || !mediaReady || !peer || peer.connectionState!=='connected' || !negotiated || !isLiveCall(state.call)) return;
    if(state.call.status==='active') {emit({phase:'Connected'});return;}
    const call=state.call;const capture=generation;markingConnected=true;
    try {const updated=await command('connected',call);if(capture===generation && state.call?.id===call?.id && isLiveCall(state.call)) {trace.mark('connected');emit({call:updated,phase:'Connected'});}}
    catch(error) {if(capture===generation && state.call?.id===call?.id && isLiveCall(state.call)) await fail(error);}
    finally {if(capture===generation) markingConnected=false;}
  }
  async function acquire(kind) {
    const capture=++permissionGeneration;
    const stream=await trace.step('permission', () => getMedia({audio:true,video:kind==='video'}));
    if(stopped || capture!==permissionGeneration) {stream.getTracks().forEach((track)=>track.stop());throw new Error('Call cancelled.');}
    emit({local:stream,muted:false,camera:kind==='video'});return stream;
  }
  async function ensurePeer() {
    if(peer || connecting || !state.call?.owned || !['connecting','active'].includes(state.call.status)) return;
    connecting=true; const call=state.call, capture=generation;
    try {
      const config=await trace.step('ice-config', () => request(`/api/calls/${call.id}/ice?tabId=${tabId}`,{signal:AbortSignal.timeout(10000)}));
      if(capture!==generation || stopped) return;
      const local=state.local??await acquire(call.kind);
      if(capture!==generation || stopped) return;
      const connection=createPeer(config);peer=connection;
      const remote=makeStream();emit({remote,phase:'Connecting…'});
      local.getTracks().forEach((track)=>connection.addTrack(track,local));
      connection.ontrack=(event)=> {
        if(peer!==connection) return;
        if(!remote.getTracks().some((track)=>track.id===event.track.id)) remote.addTrack(event.track);
        emit({remote});
        const ready=()=>{if(peer!==connection) return;mediaReady=true;trace.mark('media-ready');void markConnected();};
        if(event.track.muted===false) ready();
        else event.track.addEventListener('unmute',ready,{once:true});
      };
      connection.onicecandidate=(event)=> {if(event.candidate && peer===connection) void sendSignal('ice',event.candidate.toJSON(),call).catch((error)=>{if(peer===connection) void fail(error);});};
      connection.onconnectionstatechange=()=> {
        if(peer!==connection) return;
        if(connection.connectionState==='connected') {trace.mark('ice-connected');void markConnected();}
        else if(connection.connectionState==='failed') void fail(new Error('Media connection failed. Check your network or TURN configuration.'));
        else if(connection.connectionState==='disconnected') emit({phase:'Media disconnected; reconnecting…'});
      };
    } finally {if(capture===generation) connecting=false;}
  }
  async function receive(snapshot) {
    const call=snapshot.call;
    if(!call || (locallyEnded.has(call.id) && isLiveCall(call))) return;
    if(state.call?.id!==call.id) {trace=createPerformanceTrace('calling');trace.mark('discovery');disposeMedia();emit({call,error:'',phase:call.owned?'Calling…':'Incoming call'});}
    else emit({call, ...(call.status==='active' && !mediaReady ? {phase:'Connecting media…'} : {})});
    if(!isLiveCall(call)) {disposeMedia();emit({phase:call.status,working:false});return;}
    if(!call.owned) return;
    await ensurePeer();
    const connection=peer;
    if(!connection) return;
    const capture=generation;
    if(call.callerId===userId && call.status==='connecting' && !offered) {
      offered=true;
      const offer=await connection.createOffer();if(capture!==generation) return;
      await connection.setLocalDescription(offer);if(capture!==generation) return;
      await sendSignal('offer',connection.localDescription.toJSON(),call);
    }
    for(const signal of snapshot.signals) {
      if(capture!==generation || stopped) return;
      if(signal.sequence<=after) continue;
      if(signal.kind==='ice') {
        if(connection.remoteDescription) await connection.addIceCandidate(signal.payload);
        else pendingIce.push(signal.payload);
      } else if(signal.kind==='offer' && call.calleeId===userId && !connection.remoteDescription) {
        await connection.setRemoteDescription(signal.payload);
        for(const candidate of pendingIce) await connection.addIceCandidate(candidate);pendingIce=[];
        const answer=await connection.createAnswer();await connection.setLocalDescription(answer);
        await sendSignal('answer',connection.localDescription.toJSON(),call);negotiated=true;
      } else if(signal.kind==='answer' && call.callerId===userId && !connection.remoteDescription) {
        await connection.setRemoteDescription(signal.payload);negotiated=true;
        for(const candidate of pendingIce) await connection.addIceCandidate(candidate);pendingIce=[];
      }
      after=signal.sequence;
    }
    if(capture===generation) await markConnected();
  }
  async function poll() {
    if(stopped || busyPoll) return;
    busyPoll=true;pollQueued=false;const startedAt=now();
    try {
      if(isLiveCall(state.call) || options.visible?.()!==false) {
        const callId=isLiveCall(state.call)?state.call.id:null;
        const version=mutationVersion;
        const snapshot=await request('/api/calls/sync',json({tabId,callId,after:callId?after:0}));
        if(stopped) return;
        lastSuccess=now();
        if(version!==mutationVersion || (!callId && isLiveCall(state.call))) return;
        // User actions may finish/change the call while the poll is in flight.
        if(callId && state.call?.id!==callId) return;
        if(callId && !isLiveCall(state.call) && snapshot.call && isLiveCall(snapshot.call)) return;
        try { await receive(snapshot); } catch(error) { if(state.call?.id===snapshot.call?.id && state.call?.owned) await fail(error); else throw error; }
        if(state.call?.connectedAt && isLiveCall(state.call)) emit({seconds:Math.max(0,Math.floor((now()-Date.parse(state.call.connectedAt))/1000))});
        if(state.call?.owned && peer?.connectionState==='disconnected' && now()-lastMediaConnected>15000) await fail(new Error('Media connection was lost.'));
        if(peer?.connectionState==='connected') lastMediaConnected=now();
      }
    } catch(error) {
      if(stopped) return;
      if(error.status===401) {disposeMedia();emit({call:null,error:'Your session expired. Sign in again.'});}
      else if(isLiveCall(state.call) && state.call?.owned && now()-lastSuccess>15000) await fail(new Error('Signaling connection was lost.'));
      else emit({error:mediaError(error)});
    } finally {
      busyPoll=false;
      if(!stopped) timer=setTimer(poll,pollQueued?0:Math.max(500,(isLiveCall(state.call)?1000:3000)-(now()-startedAt)));
    }
  }
  function wake() {
    if(stopped || !pollingStarted) return;
    clearTimer(timer);
    if(busyPoll) pollQueued=true;
    else void poll();
  }
  let lastMediaConnected=now();
  async function start(conversationId,kind) {
    if(state.working || isLiveCall(state.call)) return;
    mutationVersion++;
    trace=createPerformanceTrace('calling');
    disposeMedia();emit({call:null,error:'',working:true,phase:'Requesting media permission…',seconds:0});
    const capture=generation;
    try {
      await acquire(kind);
      if(stopped || capture!==generation) return;
      const call=await trace.step('create', () => request('/api/calls',json({conversationId,kind,tabId,clientId:crypto.randomUUID()})));
      if(stopped || capture!==generation) {void command('cancel',call,true).catch(()=>{});return;}
      after=0;emit({call,phase:'Ringing…'});lastSuccess=now();
    } catch(error) {if(!stopped && capture===generation) {disposeMedia();emit({error:mediaError(error),phase:'',working:false});}}
    finally {mutationVersion++;if(!stopped && capture===generation) {emit({working:false});wake();}}
  }
  async function act(action) {
    if(action==='cancel' && state.working && !state.call) {mutationVersion++;disposeMedia();emit({working:false,phase:''});return;}
    if(state.working || !state.call) return;
    mutationVersion++;
    emit({working:true,error:''});
    const call=state.call;
    if(['end','cancel','reject'].includes(action)) endLocally(call,action==='reject'?'rejected':action==='cancel'?'cancelled':'ended');
    try {
      const updated=await trace.step(action==='accept'?'accept':'request', () => command(action,call));
      if(stopped || state.call?.id!==call.id) return;
      emit({call:updated});
      if(!isLiveCall(updated)) {disposeMedia();emit({phase:updated.status});}
      else if(action==='accept') await ensurePeer();
    } catch(error) {if(action==='accept' && state.call?.owned) await fail(error);else emit({error:mediaError(error)});}
    finally {mutationVersion++;if(!stopped) {emit({working:false});wake();}}
  }
  return {
    start,act,
    begin() {if(pollingStarted && !stopped) return;pollingStarted=true;stopped=false;lastSuccess=now();void poll();},
    wake,
    stop() {stopped=true;clearTimer(timer);const call=state.call;if(call?.owned && isLiveCall(call)) endLocally(call);else disposeMedia();if(call?.owned && isLiveCall(call)) void command('end',call,true).catch(()=>{});},
    dismiss() {if(!state.working && !isLiveCall(state.call)) {disposeMedia();emit({call:null,error:'',phase:''});}},
    mute() {const muted=!state.muted;state.local?.getAudioTracks().forEach((track)=>{track.enabled=!muted;});emit({muted});},
    camera() {const camera=!state.camera;state.local?.getVideoTracks().forEach((track)=>{track.enabled=camera;});emit({camera});},
    // Used by deterministic tests as well as the normal serialized polling loop.
    receive,
    getState:()=>state,
  };
}
