import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

declare global {
  interface Window {
    __northlineMotionInitialized?: boolean;
  }
}

function initializeMotion() {
  if (window.__northlineMotionInitialized) return;
  window.__northlineMotionInitialized = true;

  gsap.registerPlugin(ScrollTrigger);
  document.documentElement.dataset.motion = 'gsap-always';
  document.documentElement.dataset.motionScenes =
    'editorial-entrance image-drift scroll-progress';

  const context = gsap.context(() => {
    gsap.set('[data-entrance]', { autoAlpha: 1 });

    const entrance = gsap.timeline({ defaults: { ease: 'power3.out' } });
    entrance
      .fromTo('[data-site-header]', { yPercent: -105 }, { yPercent: 0, duration: 0.48 })
      .fromTo(
        '[data-entrance]',
        { autoAlpha: 0, y: 24 },
        { autoAlpha: 1, y: 0, duration: 0.64, stagger: 0.055 },
        '-=0.18',
      );

    gsap.utils.toArray<HTMLElement>('[data-image-drift]').forEach((element, index) => {
      const direction = index % 2 === 0 ? 1 : -1;
      const strength = element.dataset.imageDrift === 'fast' ? 4 : 2.5;
      const image = element.querySelector<HTMLElement>('[data-image-drift-layer]')
        ?? element.querySelector<HTMLElement>('img')
        ?? element;

      gsap.fromTo(
        image,
        { yPercent: -direction * strength, scale: 1.06 },
        {
          yPercent: direction * strength,
          scale: 1.06,
          ease: 'none',
          scrollTrigger: {
            trigger: element,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.5,
          },
        },
      );
    });

    const progress = document.querySelector<HTMLElement>('[data-scroll-progress]');
    if (progress) {
      gsap.fromTo(
        progress,
        { scaleX: 0 },
        {
          scaleX: 1,
          ease: 'none',
          transformOrigin: 'left center',
          scrollTrigger: {
            trigger: document.documentElement,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 0.2,
          },
        },
      );
    }
  }, document.body);

  const refresh = () => ScrollTrigger.refresh();
  window.addEventListener('load', refresh, { once: true });
  document.fonts.ready.then(refresh);

  const cleanup = () => {
    context.revert();
    ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    window.__northlineMotionInitialized = false;
  };
  document.addEventListener('astro:before-swap', cleanup, { once: true });
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMotion, { once: true });
  } else {
    initializeMotion();
  }
}
