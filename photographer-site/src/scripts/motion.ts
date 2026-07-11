import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

declare global {
  interface Window {
    __northlineMotionInitialized?: boolean;
  }
}

function setFinalStates() {
  gsap.set('[data-entrance]', { autoAlpha: 1, clearProps: 'transform' });
  gsap.set('[data-contact-sheet-track]', { clearProps: 'transform' });
}

function initializeMotion() {
  if (window.__northlineMotionInitialized) return;
  window.__northlineMotionInitialized = true;

  gsap.registerPlugin(ScrollTrigger);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches) {
    setFinalStates();
    document.documentElement.dataset.motion = 'reduced';
    return;
  }

  document.documentElement.dataset.motion = 'ready';

  const entrance = gsap.timeline({ defaults: { duration: 0.72, ease: 'power3.out' } });
  entrance
    .fromTo('[data-site-header]', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.45 })
    .fromTo(
      '[data-entrance]',
      { autoAlpha: 0, y: 30 },
      { autoAlpha: 1, y: 0, stagger: 0.1 },
      '-=0.18',
    );

  const contactSheet = document.querySelector<HTMLElement>('[data-contact-sheet]');
  const track = document.querySelector<HTMLElement>('[data-contact-sheet-track]');

  if (contactSheet && track) {
    gsap.fromTo(
      track,
      { x: 24 },
      {
        x: -24,
        ease: 'none',
        scrollTrigger: {
          trigger: contactSheet,
          start: 'clamp(top bottom)',
          end: 'clamp(bottom top)',
          scrub: 0.6,
        },
      },
    );
  }

  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMotion, { once: true });
  } else {
    initializeMotion();
  }
}
