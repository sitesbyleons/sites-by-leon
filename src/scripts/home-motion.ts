import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
const media = gsap.matchMedia();
media.add({ desktop: '(min-width: 761px)', mobile: '(max-width: 760px)', reduce: '(prefers-reduced-motion: reduce)' }, context => {
  const { desktop, reduce } = context.conditions!;
  document.documentElement.dataset.homeMotion = reduce ? 'reduced' : 'spatial';
  if (reduce) return;
  // Phones keep a natural page flow: no pinned screen or overlapping moving text.
  if (!desktop) {
    gsap.fromTo('.spatial-main', { rotationY: -8, rotationZ: 3 }, {
      rotationY: 0, rotationZ: 0, ease: 'none', scrollTrigger: {
        trigger: '.spatial-world', start: 'top 80%', end: 'bottom 25%', scrub: .4,
      },
    });
    return;
  }
  gsap.set('.spatial-print', { x: 0, y: 0 });
  const timeline = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: {
    id: 'home-spatial', trigger: '.spatial-hero', pin: '.spatial-stage', start: 'top top',
    end: () => `+=${innerHeight * (desktop ? 1.15 : .85)}`, scrub: .45, invalidateOnRefresh: true,
  }});
  timeline.fromTo('.spatial-main', { rotationY: -18, rotationZ: 7, z: 0 }, {
    rotationY: 0, rotationZ: 0, xPercent: desktop ? -62 : -32, yPercent: -6, scale: desktop ? 1.5 : 1.55, duration: .75,
  }, 0)
    .to('.spatial-left', { xPercent: -100, rotationY: 55, rotationZ: -20, z: -200, opacity: 0, duration: .5 }, 0)
    .to('.spatial-right', { xPercent: 140, rotationY: -70, z: -150, opacity: 0, duration: .5 }, 0)
    .to('.spatial-heading', { xPercent: -22, opacity: 0, duration: .28 }, .07)
    .fromTo('.spatial-final', { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: .3 }, .43);
  gsap.utils.toArray<HTMLElement>('.lh-project').forEach(project => {
    gsap.fromTo(project.querySelector('.lh-project-preview'), { rotationX: 9, y: 45 }, {
      rotationX: 0, y: 0, ease: 'none', scrollTrigger: { trigger: project, start: 'top 95%', end: 'top 30%', scrub: .5 },
    });
  });
  document.fonts.ready.then(() => ScrollTrigger.refresh());
});
// Keep the timeline intact when the browser restores this document from bfcache.
window.addEventListener('pageshow', event => { if (event.persisted) ScrollTrigger.refresh(); });
