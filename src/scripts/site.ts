import { submitContact, validateContact, type ContactErrors, type ContactField } from '../lib/contact';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const header = document.querySelector<HTMLElement>('[data-site-header]');
const updateHeader = () => header?.classList.toggle('site-header--scrolled', window.scrollY > 24);
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

const motionPreferenceKey = 'sites-by-leon-motion';
const systemPrefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const motionToggle = document.querySelector<HTMLButtonElement>('[data-motion-toggle]');
const motionToggleLabel = motionToggle?.querySelector<HTMLElement>('[data-motion-toggle-label]');

const getStoredMotionPreference = () => {
  try {
    const preference = window.sessionStorage.getItem(motionPreferenceKey);
    return preference === 'on' || preference === 'off' ? preference : null;
  } catch {
    return null;
  }
};

const setStoredMotionPreference = (preference: 'on' | 'off') => {
  try {
    window.sessionStorage.setItem(motionPreferenceKey, preference);
  } catch {
    // Keep the system preference when storage is unavailable.
  }
};

const storedMotionPreference = getStoredMotionPreference();
const motionIsEnabled =
  storedMotionPreference === 'on' ||
  (storedMotionPreference !== 'off' && !systemPrefersReducedMotion);
const revealItems = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));

const showWithoutMotion = () => {
  revealItems.forEach((item) => item.classList.add('is-visible'));
  gsap.set(revealItems, { clearProps: 'transform,opacity,visibility' });
  gsap.set('[data-motion-depth], .portfolio-story__intro', { clearProps: 'transform,transformOrigin' });
  gsap.set('.concept-browser__progress', { scaleX: 1 });
};

const initializeScrollMotion = () => {
  document.documentElement.dataset.motion = 'gsap-scrolltrigger';
  document.documentElement.dataset.motionScenes = 'hero-depth concept-3d pricing-3d';

  const batchedRevealItems = revealItems.filter(
    (item) => !item.matches('.process-list li, .portfolio-story'),
  );
  gsap.set(batchedRevealItems, { y: 28 });
  ScrollTrigger.batch(batchedRevealItems, {
    start: 'clamp(top 86%)',
    once: true,
    interval: 0.08,
    batchMax: 4,
    onEnter: (batch) => {
      gsap.to(batch, {
        y: 0,
        duration: 0.82,
        stagger: 0.08,
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
        const startY = [7, -7, 10][index] ?? 6;
        const startRotation = [-1.8, 2.2, -2.4][index] ?? 0;
        gsap.fromTo(
          image,
          { yPercent: startY, rotation: startRotation, scale: 0.96 },
          {
            yPercent: -startY,
            rotation: -startRotation * 0.45,
            scale: 1.025,
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
          rotationX: 9,
          rotationY: direction * 10,
          z: -140,
          scale: 0.94,
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
        {
          transformPerspective: 1200,
          rotationY: (index) => [-11, 0, 11][index] ?? 0,
          y: 64,
          z: -90,
        },
        {
          rotationY: 0,
          y: 0,
          z: 0,
          duration: 0.95,
          stagger: 0.12,
          ease: 'power3.out',
          scrollTrigger: { trigger: pricingGrid, start: 'clamp(top 78%)', once: true },
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
        { y: 42, rotation: index % 2 === 0 ? -1.2 : 1.2, scale: 0.975 },
        {
          y: 0,
          rotation: 0,
          scale: 1,
          duration: 0.85,
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

if (motionIsEnabled) {
  initializeScrollMotion();
} else {
  document.documentElement.dataset.motion = 'reduced';
  delete document.documentElement.dataset.motionScenes;
  showWithoutMotion();
}

if (motionToggle) {
  motionToggle.hidden = false;
  motionToggle.setAttribute('aria-pressed', String(motionIsEnabled));
  motionToggle.setAttribute('aria-label', motionIsEnabled ? 'Disable motion' : 'Enable motion');
  if (motionToggleLabel) motionToggleLabel.textContent = motionIsEnabled ? 'Motion on' : 'Motion off';

  motionToggle.addEventListener('click', () => {
    setStoredMotionPreference(motionIsEnabled ? 'off' : 'on');
    window.location.reload();
  });
}

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
