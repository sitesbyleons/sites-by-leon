import { submitContact, validateContact, type ContactErrors, type ContactField } from '../lib/contact';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const header = document.querySelector<HTMLElement>('[data-site-header]');
const updateHeader = () => header?.classList.toggle('site-header--scrolled', window.scrollY > 24);
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealItems = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));

const showWithoutMotion = () => {
  revealItems.forEach((item) => item.classList.add('is-visible'));
  gsap.set(revealItems, { clearProps: 'transform,opacity,visibility' });
  gsap.set('.concept-browser__progress', { scaleX: 1 });
};

const initializeScrollMotion = () => {
  document.documentElement.dataset.motion = 'gsap-scrolltrigger';

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
    const intro = story.querySelector<HTMLElement>('.portfolio-story__intro');
    const browser = story.querySelector<HTMLElement>('.concept-browser');
    if (!intro || !browser) return;

    gsap.fromTo(
      [intro, browser],
      { y: 36 },
      {
        y: 0,
        duration: 0.92,
        stagger: 0.12,
        ease: 'power3.out',
        scrollTrigger: { trigger: story, start: 'clamp(top 84%)', once: true },
      },
    );

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

if (prefersReducedMotion) {
  document.documentElement.dataset.motion = 'reduced';
  showWithoutMotion();
} else {
  initializeScrollMotion();
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
