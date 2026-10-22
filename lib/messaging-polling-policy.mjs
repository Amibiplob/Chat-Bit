/** Foreground interaction opens a bounded fast-poll window, never a keep-awake job. */
export function createMessagingPollingPolicy(clock=()=>performance.now()){
  let activeAt=clock();
  return {
    activate(){activeAt=clock();},
    interval(conversationId,visible){
      if(!visible)return 15000; // Existing opted-in background notifications only.
      if(!conversationId)return 5000;
      return clock()-activeAt<15000?1000:2500;
    },
  };
}
