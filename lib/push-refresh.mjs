/** Coalesce event bursts without continually aborting/starving active snapshots. */
export function createPushRefresh(refresh,onError=()=>{}){
  let running=false,dirty=false,stopped=false;
  async function run(){
    if(stopped||running)return;
    running=true;
    do {
      dirty=false;
      try{await refresh();}catch{onError();}
    }while(dirty&&!stopped);
    running=false;
  }
  return {wake(){if(stopped)return;dirty=true;void run();},stop(){stopped=true;dirty=false;}};
}
