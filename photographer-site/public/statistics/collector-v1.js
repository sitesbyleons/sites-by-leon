(()=>{
  const banner=document.getElementById('traffic-consent'),preferences=document.getElementById('traffic-preferences');
  if(!banner||!preferences)return;
  const choiceKey='leon-statistics-choice-v1',sessionKey='leon-statistics-session-v1';
  const blocked=()=>navigator.globalPrivacyControl===true||navigator.doNotTrack==='1';
  const random=()=>[...crypto.getRandomValues(new Uint8Array(16))].map(v=>v.toString(16).padStart(2,'0')).join('');
  const newSession=()=>({id:random(),expires:Date.now()+1800000,day:new Date().toISOString().slice(0,10)});
  let timer,session,view=random(),sent=false,choice;
  try{const saved=JSON.parse(localStorage.getItem(choiceKey)||'null');choice=saved&&saved.expires>Date.now()?saved.value:null;}catch{}
  const stop=()=>{clearInterval(timer);timer=undefined;session=null;try{sessionStorage.removeItem(sessionKey);}catch{}};
  const referrer=()=>{try{return document.referrer?new URL(document.referrer).origin:'';}catch{return '';}};
  function send(kind){
    if(choice!=='accepted'||blocked()||document.visibilityState!=='visible'||!session)return;
    if(session.expires<=Date.now()||session.day!==new Date().toISOString().slice(0,10)){session=newSession();view=random();sent=false;try{sessionStorage.setItem(sessionKey,JSON.stringify(session));}catch{}}
    const heartbeat=kind==='heartbeat'&&sent;
    fetch('/api/statistics/event',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:'accepted',session:session.id,view,path:location.pathname,referrer:referrer(),kind:heartbeat?'heartbeat':'view'}),keepalive:false}).then(r=>{if(r.ok)sent=true;}).catch(()=>{});
  }
  function start(){
    if(blocked()||choice!=='accepted')return;
    view=random();sent=false;
    try{session=JSON.parse(sessionStorage.getItem(sessionKey)||'null');}catch{}
    if(!session||typeof session.id!=='string'||!/^[a-f0-9]{32}$/.test(session.id)||!Number.isFinite(session.expires)||session.expires<=Date.now())session=newSession();
    try{sessionStorage.setItem(sessionKey,JSON.stringify(session));}catch{}
    send('view');clearInterval(timer);timer=setInterval(()=>send('heartbeat'),30000);
  }
  function choose(value){choice=value;stop();try{localStorage.setItem(choiceKey,JSON.stringify({value,expires:Date.now()+15552000000}));}catch{}banner.hidden=true;if(value==='accepted')start();preferences.focus();}
  banner.querySelectorAll('[data-traffic-choice]').forEach(button=>button.addEventListener('click',()=>choose(button.dataset.trafficChoice)));
  preferences.addEventListener('click',()=>{banner.hidden=false;banner.querySelector('button').focus();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')send('heartbeat');});
  window.addEventListener('storage',e=>{if(e.key===choiceKey){stop();try{choice=JSON.parse(e.newValue||'null')?.value;}catch{choice=null;}if(choice==='accepted')start();}});
  if(blocked()){choice='declined';stop();banner.hidden=true;preferences.textContent='Privacy signal respected';}
  else if(!choice)banner.hidden=false;else if(choice==='accepted')start();
})();
