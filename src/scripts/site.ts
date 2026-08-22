import { submitContact, validateContact, type ContactErrors, type ContactField } from '../lib/contact';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const header = document.querySelector<HTMLElement>('[data-site-header]');
const updateHeader = () => header?.classList.toggle('site-header--scrolled', window.scrollY > 24);
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });


const nav = document.querySelector<HTMLElement>('[data-site-nav]');
const toggle = document.querySelector<HTMLButtonElement>('[data-nav-toggle]');
const setNavOpen = (open: boolean) => {
  nav?.classList.toggle('is-open', open);
  toggle?.setAttribute('aria-expanded', String(open));
};
toggle?.addEventListener('click', () => {
  setNavOpen(toggle.getAttribute('aria-expanded') !== 'true');
});
nav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => setNavOpen(false));
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setNavOpen(false);
});
window.addEventListener('resize', () => {
  if (window.matchMedia('(min-width: 60.01rem)').matches) setNavOpen(false);
});


const revealItems = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));

const initializeScrollMotion = () => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reducedMotion) {
    document.documentElement.dataset.motion = 'reduced';
    document.documentElement.dataset.motionScenes = 'opacity-feedback';
    gsap.set(revealItems, { autoAlpha: 1, clearProps: 'transform' });
    return;
  }

  document.documentElement.dataset.motion = 'gsap-scrolltrigger';
  document.documentElement.dataset.motionScenes = 'hero-depth concept-3d pricing-stagger';

  const batchedRevealItems = revealItems.filter(
    (item) => !item.matches('.process-list li, .portfolio-story'),
  );
  gsap.set(batchedRevealItems, { y: 20 });
  ScrollTrigger.batch(batchedRevealItems, {
    start: 'clamp(top 86%)',
    once: true,
    interval: 0.08,
    batchMax: 4,
    onEnter: (batch) => {
      gsap.to(batch, {
        y: 0,
        duration: 0.56,
        stagger: 0.055,
        ease: 'power3.out',
        overwrite: true,
      });
    },
  });

  document.querySelectorAll<HTMLElement>('.portfolio-story').forEach((story) => {
    const browser = story.querySelector<HTMLElement>('.concept-browser');
    if (!browser) return;

    const progress = browser.querySelector<HTMLElement>('.concept-browser__progress');
    const leadImage = browser.querySelector<HTMLImageElement>('.concept-canvas img');

    if (progress) {
      gsap.fromTo(
        progress,
        { scaleX: 0 },
        {
          scaleX: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: browser,
            start: 'clamp(top 82%)',
            end: 'clamp(bottom 24%)',
            scrub: 0.5,
          },
        },
      );
    }

    if (leadImage && window.innerWidth > 768) {
      gsap.fromTo(
        leadImage,
        { yPercent: -1.5, scale: 1.025 },
        {
          yPercent: 1.5,
          scale: 1.025,
          ease: 'none',
          scrollTrigger: {
            trigger: browser,
            start: 'clamp(top bottom)',
            end: 'clamp(bottom top)',
            scrub: 0.8,
          },
        },
      );
    }
  });

  const motionMedia = gsap.matchMedia();

  motionMedia.add('(min-width: 769px)', () => {
    const hero = document.querySelector<HTMLElement>('.hero');
    const heroImages = Array.from(document.querySelectorAll<HTMLElement>('.hero-gallery__image'));

    if (hero && heroImages.length) {
      heroImages.forEach((image, index) => {
        const startY = [4, -4, 5][index] ?? 3;
        const startRotation = [-1, 1.2, -1.2][index] ?? 0;
        gsap.fromTo(
          image,
          { yPercent: startY, rotation: startRotation, scale: 0.96 },
          {
            yPercent: -startY,
            rotation: -startRotation * 0.45,
            scale: 1.015,
            ease: 'none',
            scrollTrigger: {
              trigger: hero,
              start: 'top top',
              end: 'bottom top',
              scrub: 0.8,
              invalidateOnRefresh: true,
            },
          },
        );
      });
    }

    document.querySelectorAll<HTMLElement>('.portfolio-story').forEach((story, index) => {
      const intro = story.querySelector<HTMLElement>('.portfolio-story__intro');
      const browser = story.querySelector<HTMLElement>('.concept-browser');
      if (!intro || !browser) return;
      const direction = index % 2 === 0 ? -1 : 1;

      gsap.fromTo(
        browser,
        {
          transformPerspective: 1600,
          rotationX: 5,
          rotationY: direction * 6,
          z: -80,
          scale: 0.97,
          transformOrigin: '50% 45%',
        },
        {
          rotationX: 0,
          rotationY: 0,
          z: 0,
          scale: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: story,
            start: 'clamp(top 94%)',
            end: 'clamp(top 32%)',
            scrub: 0.8,
            invalidateOnRefresh: true,
          },
        },
      );

      gsap.fromTo(
        intro,
        { xPercent: direction * 7 },
        {
          xPercent: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: story,
            start: 'clamp(top 96%)',
            end: 'clamp(top 48%)',
            scrub: 0.7,
          },
        },
      );
    });

    const pricingGrid = document.querySelector<HTMLElement>('.pricing-grid');
    const pricingCards = Array.from(document.querySelectorAll<HTMLElement>('.pricing-card'));
    if (pricingGrid && pricingCards.length) {
      gsap.fromTo(
        pricingCards,
        { y: 24, autoAlpha: 0.88 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.42,
          stagger: 0.055,
          ease: 'power3.out',
          scrollTrigger: { trigger: pricingGrid, start: 'clamp(top 82%)', once: true },
        },
      );
    }
  });

  motionMedia.add('(max-width: 768px)', () => {
    document.querySelectorAll<HTMLElement>('.portfolio-story').forEach((story, index) => {
      const browser = story.querySelector<HTMLElement>('.concept-browser');
      if (!browser) return;
      gsap.fromTo(
        browser,
        { y: 24, rotation: index % 2 === 0 ? -0.6 : 0.6, scale: 0.985 },
        {
          y: 0,
          rotation: 0,
          scale: 1,
          duration: 0.56,
          ease: 'power3.out',
          scrollTrigger: { trigger: story, start: 'clamp(top 86%)', once: true },
        },
      );
    });

    const pricingCards = Array.from(document.querySelectorAll<HTMLElement>('.pricing-card'));
    ScrollTrigger.batch(pricingCards, {
      start: 'clamp(top 88%)',
      once: true,
      interval: 0.08,
      onEnter: (batch) => gsap.fromTo(batch, { y: 34 }, { y: 0, duration: 0.7, stagger: 0.08, ease: 'power2.out' }),
    });
  });

  const processList = document.querySelector<HTMLElement>('.process-list');
  const processItems = Array.from(document.querySelectorAll<HTMLElement>('.process-list li'));
  if (processList && processItems.length) {
    gsap.fromTo(
      processItems,
      { y: 24 },
      {
        y: 0,
        duration: 0.72,
        stagger: 0.1,
        ease: 'power2.out',
        scrollTrigger: { trigger: processList, start: 'clamp(top 82%)', once: true },
      },
    );
  }

  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
};

initializeScrollMotion();

const form = document.querySelector<HTMLFormElement>('[data-contact-form]');

if (form) {
  const status = form.querySelector<HTMLElement>('[data-form-status]');
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');

  const clearErrors = () => {
    form.querySelectorAll<HTMLElement>('[data-error-for]').forEach((node) => {
      node.textContent = '';
    });
    form.querySelectorAll<HTMLElement>('[aria-invalid="true"]').forEach((node) => {
      node.removeAttribute('aria-invalid');
    });
  };

  const showErrors = (errors: ContactErrors = {}) => {
    (Object.entries(errors) as Array<[ContactField, string]>).forEach(([field, message]) => {
      const input = form.elements.namedItem(field) as HTMLElement | null;
      const error = form.querySelector<HTMLElement>(`[data-error-for="${field}"]`);
      input?.setAttribute('aria-invalid', 'true');
      if (error) error.textContent = message;
    });
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();
    if (status) {
      status.textContent = '';
      status.className = 'form-status';
    }

    const values = Object.fromEntries(new FormData(form).entries());
    const validation = validateContact(values);
    if (!validation.ok) {
      showErrors(validation.errors);
      if (status) status.textContent = 'Please check the highlighted fields.';
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = 'Sending…';
    }

    const result = await submitContact(validation.payload, form.dataset.endpoint);

    if (result.ok) {
      form.reset();
      if (status) {
        status.textContent = 'Thank you—your message reached Leon. You should hear back directly.';
        status.classList.add('form-status--success');
      }
    } else {
      showErrors(result.errors);
      if (status) {
        status.textContent = result.message;
        status.classList.add('form-status--error');
      }
    }

    if (button) {
      button.disabled = false;
      button.textContent = 'Send inquiry';
    }
  });
}
