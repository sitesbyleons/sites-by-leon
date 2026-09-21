import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
const media = gsap.matchMedia();
media.add('(prefers-reduced-motion: no-preference)', () => {
  gsap.utils.toArray<HTMLElement>('.work-feature-photo').forEach(photo => {
    gsap.fromTo(photo, { rotationX: 7, y: 35 }, {
      rotationX: 0, y: 0, ease: 'none',
      scrollTrigger: { trigger: photo, start: 'top 95%', end: 'top 25%', scrub: .5 },
    });
  });
  document.fonts.ready.then(() => ScrollTrigger.refresh());
});
window.addEventListener('pageshow', event => { if (event.persisted) ScrollTrigger.refresh(); });
