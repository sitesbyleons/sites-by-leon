// Demo interactions never send or store visitor input.
const form = document.querySelector('[data-demo-inquiry]');
if(form){
  const selected = new URLSearchParams(location.search).get('package');
  const select = form.querySelector('select');
  if([...select.options].some(o=>o.value===selected)) select.value=selected;
  form.addEventListener('submit', event=>{
    event.preventDefault();
    if(!form.reportValidity())return;
    const result=form.querySelector('.form-result');
    result.hidden=false;
    form.reset();
    result.focus();
  });
  form.querySelector('button[type="submit"]').disabled=false;
}
const shots=[...document.querySelectorAll('[data-lightbox]')];
const viewer=document.querySelector('.lightbox');
let active=0,opener;
function showPhoto(index){
  active=(index+shots.length)%shots.length;
  const img=shots[active].querySelector('img');
  viewer.querySelector('img').src=img.currentSrc||img.src;
  viewer.querySelector('img').alt=img.alt;
  viewer.querySelector('[data-lightbox-caption]').textContent=img.alt;
  viewer.querySelector('[data-lightbox-counter]').textContent=`${String(active+1).padStart(2,'0')} / ${String(shots.length).padStart(2,'0')}`;
}
shots.forEach((shot,index)=>shot.addEventListener('click',()=>{opener=shot;showPhoto(index);viewer.showModal();}));
viewer?.querySelector('[data-lightbox-close]').addEventListener('click',()=>viewer.close());
viewer?.querySelector('[data-lightbox-prev]').addEventListener('click',()=>showPhoto(active-1));
viewer?.querySelector('[data-lightbox-next]').addEventListener('click',()=>showPhoto(active+1));
viewer?.addEventListener('keydown',event=>{
  if(event.key==='ArrowLeft'){event.preventDefault();showPhoto(active-1);}
  if(event.key==='ArrowRight'){event.preventDefault();showPhoto(active+1);}
});
viewer?.addEventListener('close',()=>opener?.focus());

// Scroll changes the photographs, never the browser's scroll position.
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const desktopMotion=matchMedia('(min-width: 900px)');
const root=document.documentElement;
const hero=document.querySelector('.field-hero,.album-hero');
const showcase=document.querySelector('.selected');
const stage=showcase?.querySelector('.project-grid,.album-spread');
const cards=stage?[...stage.children].filter(el=>el.matches('.project,figure')).slice(0,3):[];
const settling=[...document.querySelectorAll('.gallery-photo,.service-heading>img')];
const toggle=document.createElement('button');
toggle.type='button';toggle.className='motion-toggle';
document.querySelector('.demo-footer')?.append(toggle);
let paused=false, frame=0;
const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>value*value*(3-2*value);
function update(){
 frame=0;if(paused||reducedMotion.matches||document.hidden)return;
 const vh=innerHeight;
 if(hero){
  const rect=hero.getBoundingClientRect();
  const progress=clamp(-rect.top/Math.max(1,rect.height));
  const strength=desktopMotion.matches?1:.35;
  hero.style.setProperty('--hero-y',`${-progress*45*strength}px`);
  hero.style.setProperty('--hero-x',`${progress*7*strength}deg`);
  hero.style.setProperty('--hero-turn',`${(progress-.15)*-8*strength}deg`);
 }
 if(showcase&&stage&&desktopMotion.matches){
  const rect=showcase.getBoundingClientRect();
  const progress=smooth(clamp((vh*.36-rect.top)/Math.max(1,rect.height-vh*.72)));
  const wedding=root.classList.contains('demo-wedding');
  cards.forEach((card,index)=>{
   const side=index-1;
   card.style.setProperty('--card-x',`${side*(28+progress*78)}%`);
   card.style.setProperty('--card-y',`${Math.abs(side)*(32*(1-progress))-Math.sin(progress*Math.PI)*30}px`);
   card.style.setProperty('--card-z',`${(1-Math.abs(side))*80*(1-progress)}px`);
   card.style.setProperty('--card-rx',`${(1-progress)*(wedding?12:18)}deg`);
   card.style.setProperty('--card-ry',`${side*(1-progress)*(wedding?-17:16)}deg`);
   card.style.setProperty('--card-rz',`${side*((wedding?12:7)*(1-progress)+1.5)}deg`);
   card.style.zIndex=String(3-Math.abs(side));
  });
 }
 const targets=desktopMotion.matches?settling:[...settling,...cards];
 targets.forEach(el=>{
  const rect=el.getBoundingClientRect();
  if(rect.bottom<0||rect.top>vh*1.3)return;
  const remaining=1-smooth(clamp((vh-rect.top)/(vh*.65)));
  el.style.setProperty('--settle-x',`${remaining*(desktopMotion.matches?7:4)}deg`);
  el.style.setProperty('--settle-y',`${remaining*14}px`);
 });
}
function schedule(){if(!frame&&!paused&&!reducedMotion.matches&&!document.hidden)frame=requestAnimationFrame(update);}
function configure(){
 cancelAnimationFrame(frame);frame=0;
 const enabled=!paused&&!reducedMotion.matches;
 root.classList.toggle('depth-enabled',enabled);
 showcase?.classList.toggle('motion-showcase',enabled&&desktopMotion.matches&&cards.length===3);
 stage?.classList.toggle('motion-stage',enabled&&desktopMotion.matches&&cards.length===3);
 toggle.textContent=reducedMotion.matches?'Reduced motion enabled':paused?'Enable animations':'Pause animations';
 toggle.disabled=reducedMotion.matches;
 toggle.setAttribute('aria-pressed',String(enabled));
 if(!enabled){[hero,...cards,...settling].filter(Boolean).forEach(el=>el.removeAttribute('style'));}
 schedule();
}
toggle.addEventListener('click',()=>{paused=!paused;configure();});
addEventListener('scroll',schedule,{passive:true});
addEventListener('resize',configure,{passive:true});
addEventListener('pageshow',schedule);
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else schedule();});
reducedMotion.addEventListener('change',configure);
desktopMotion.addEventListener('change',configure);
document.fonts.ready.then(schedule);
configure();
