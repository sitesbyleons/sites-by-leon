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
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let observer;
function configureMotion(){
  observer?.disconnect();
  document.documentElement.classList.remove('motion-ready');
  document.querySelectorAll('.reveal').forEach(el=>el.classList.remove('reveal','visible'));
  document.documentElement.style.removeProperty('--drift');
  if(reduced.matches||innerWidth<900)return;
  observer=new IntersectionObserver(entries=>entries.forEach(({target,isIntersecting})=>{
    if(isIntersecting){target.classList.add('visible');observer.unobserve(target);}
  }),{threshold:.08});
  document.querySelectorAll('.project,.approach-copy,.process-grid article').forEach(el=>{el.classList.add('reveal');observer.observe(el);});
  document.documentElement.classList.add('motion-ready');
}
configureMotion();reduced.addEventListener('change',configureMotion);
let scheduled=false;
addEventListener('scroll',()=>{
  if(scheduled||reduced.matches||innerWidth<900)return;
  scheduled=true;requestAnimationFrame(()=>{
    document.documentElement.style.setProperty('--drift',`${Math.min(scrollY*.025,16)}px`);scheduled=false;
  });
},{passive:true});
