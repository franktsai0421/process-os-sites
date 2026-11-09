// Test-only retired scheduler: synthetic callback/race driver, never shipped.
  window.createForegroundPoll = () => {
    let timer=null,task=null,running=false,disposed=false,lastStart=null,urgent=false,generation=0;
    const foreground=()=>document.visibilityState!=='hidden'&&document.hasFocus?.()!==false;
    let wasForeground=foreground();
    const clear=()=>{if(timer!==null)clearTimeout(timer);timer=null;};
    function arm(){
      clear();if(disposed||running||!task||!foreground())return;
      const delay=urgent?0:lastStart===null?30000:Math.max(0,30000-(performance.now()-lastStart));
      timer=setTimeout(async()=>{
        timer=null;if(disposed||running||!task||!foreground())return;
        const callback=task;task=null;urgent=false;running=true;lastStart=performance.now();
        try{await callback();}finally{running=false;arm();}
      },delay);
    }
    function visibility(){
      const current=foreground();
      if(!current)clear();
      else if(!wasForeground&&(task||running)){urgent=true;arm();}
      wasForeground=current;
    }
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('focus',visibility);window.addEventListener('blur',visibility);
    return {
      schedule(callback){if(disposed)return;task=callback;arm();},
      capture:()=>generation,isCurrent:owner=>!disposed&&owner===generation,
      cancel(){generation++;clear();task=null;urgent=false;lastStart=null;},
      dispose(){disposed=true;clear();task=null;urgent=false;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('focus',visibility);window.removeEventListener('blur',visibility);}
    };
  };
  // Local Begin feedback only:
