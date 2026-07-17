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

  const context = gsap.context(() => {
    gsap.set('[data-entrance]', { autoAlpha: 1 });

    const driftScenes = gsap.utils.toArray<HTMLElement>('[data-image-drift]').map((element) => ({
      element,
      target: element.querySelector<HTMLElement>('[data-image-drift-layer]')
        ?? element.querySelector<HTMLElement>('img')
        ?? element,
    }));
    const motionMedia = gsap.matchMedia();

    motionMedia.add('(prefers-reduced-motion: no-preference)', () => {
      document.documentElement.dataset.motion = 'gsap-always';
      document.documentElement.dataset.motionScenes =
        'editorial-entrance image-drift scroll-progress';

      const entrance = gsap.timeline({ defaults: { ease: 'power3.out' } });
      entrance
        .fromTo('[data-site-header]', { yPercent: -105 }, { yPercent: 0, duration: 0.48 })
        .fromTo(
          '[data-entrance]',
          { autoAlpha: 0, y: 24 },
          { autoAlpha: 1, y: 0, duration: 0.64, stagger: 0.055 },
          '-=0.18',
        );

      driftScenes.forEach(({ element, target }, index) => {
        const direction = index % 2 === 0 ? 1 : -1;
        const strength = element.dataset.imageDrift === 'fast' ? 4 : 2.5;

        gsap.fromTo(
          target,
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
    });

    motionMedia.add('(prefers-reduced-motion: reduce)', () => {
      document.documentElement.dataset.motion = 'reduced';
      document.documentElement.dataset.motionScenes = 'editorial-fade';
      gsap.set('[data-site-header]', { clearProps: 'transform' });
      gsap.set('[data-entrance]', { clearProps: 'transform' });
      gsap.set(driftScenes.map(({ target }) => target), { clearProps: 'transform' });
      gsap.fromTo(
        '[data-entrance]',
        { autoAlpha: 0.88 },
        { autoAlpha: 1, duration: 0.2, stagger: 0.03, ease: 'power3.out' },
      );
      gsap.set('[data-scroll-progress]', { scaleX: 1, transformOrigin: 'left center' });
    });

    return () => motionMedia.revert();
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
