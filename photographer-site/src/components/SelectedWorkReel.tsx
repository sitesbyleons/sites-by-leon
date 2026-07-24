import { animated, to, useSpring as useReactSpring } from '@react-spring/web';
import {
  motion,
  useScroll,
  useSpring as useMotionSpring,
  useTransform,
} from 'motion/react';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';

import type { Gallery, GalleryImage } from '../lib/content/types';
import './selected-work-reel.css';

type Props = {
  galleries: Gallery[];
  tone: 'editorial' | 'athletic' | 'modern';
};

type SkiperLinkProps = {
  children: ReactNode;
  href: string;
  label: string;
};

const uniqueFrames = (gallery: Gallery) => {
  const frames = [gallery.cover, ...gallery.images];
  return frames
    .filter((frame, index) => frames.findIndex((candidate) => candidate.src === frame.src) === index)
    .slice(0, 3);
};

const useLiveReducedMotion = () => {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => setReducedMotion(preference.matches);
    syncPreference();
    preference.addEventListener('change', syncPreference);
    return () => preference.removeEventListener('change', syncPreference);
  }, []);

  return reducedMotion;
};

/**
 * Adapted for Astro from Skiper UI's free Skiper 40 animated-link pattern.
 * Original: https://skiper-ui.com/docs/quick-start (Skiper 40 by gxuri).
 */
function SkiperLink({ children, href, label }: SkiperLinkProps) {
  return (
    <a className="skiper-link" href={href} aria-label={label}>
      <span>{children}</span>
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d="M1.5 10.5 10.5 1.5m0 0v8m0-8h-8" />
      </svg>
    </a>
  );
}

function ReelFrame({
  frame,
  index,
  projectProgress,
  reducedMotion,
}: {
  frame: GalleryImage;
  index: number;
  projectProgress: ReturnType<typeof useScroll>['scrollYProgress'];
  reducedMotion: boolean;
}) {
  const distances = index === 0 ? [42, -42] : index === 1 ? [-28, 28] : [22, -22];
  const y = useTransform(
    projectProgress,
    [0, 1],
    reducedMotion ? [0, 0] : distances,
  );
  const imageTransform = useTransform(y, (value) => `translate3d(0, ${value}px, 0)`);

  return (
    <motion.figure
      className={`work-project__frame work-project__frame--${index + 1}`}
      initial={false}
      whileInView={reducedMotion
        ? { opacity: [0.88, 1] }
        : { clipPath: ['inset(9% 7% 9% 7%)', 'inset(0% 0% 0% 0%)'], opacity: [0.72, 1] }}
      viewport={{ amount: 0.28, once: true }}
      transition={{ duration: reducedMotion ? 0.25 : 0.82, ease: [0.16, 1, 0.3, 1] }}
      style={{
        '--crop-x': `${frame.cropX}%`,
        '--crop-y': `${frame.cropY}%`,
        '--crop-zoom': frame.cropZoom,
      } as CSSProperties}
    >
      <motion.div className="work-project__image-drift" style={{ transform: imageTransform }}>
        <img
          src={frame.src}
          alt={frame.alt}
          width={frame.width}
          height={frame.height}
          loading={index === 0 ? 'eager' : 'lazy'}
          decoding="async"
        />
      </motion.div>
    </motion.figure>
  );
}

function WorkProject({
  gallery,
  index,
  reducedMotion,
}: {
  gallery: Gallery;
  index: number;
  reducedMotion: boolean;
}) {
  const projectRef = useRef<HTMLElement>(null);
  const frames = uniqueFrames(gallery);
  const { scrollYProgress } = useScroll({
    target: projectRef,
    offset: ['start end', 'end start'],
  });
  const [tilt, tiltApi] = useReactSpring(() => ({
    rotateX: 0,
    rotateY: 0,
    scale: 1,
    lightX: 50,
    lightY: 50,
    config: { mass: 0.7, tension: 235, friction: 24 },
  }));

  const resetTilt = () => tiltApi.start({
    rotateX: 0,
    rotateY: 0,
    scale: 1,
    lightX: 50,
    lightY: 50,
  });
  useEffect(() => {
    if (!reducedMotion) return;
    tiltApi.start({
      rotateX: 0,
      rotateY: 0,
      scale: 1,
      lightX: 50,
      lightY: 50,
      immediate: true,
    });
  }, [reducedMotion, tiltApi]);

  const moveTilt = (event: PointerEvent<HTMLAnchorElement>) => {
    if (reducedMotion || event.pointerType === 'touch') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    tiltApi.start({
      rotateX: y * -1.8,
      rotateY: x * 2.4,
      scale: 1.006,
      lightX: (x + 0.5) * 100,
      lightY: (y + 0.5) * 100,
    });
  };

  const number = String(index + 1).padStart(2, '0');
  const href = `/work/${gallery.slug}`;

  return (
    <motion.article
      ref={projectRef}
      className="work-project"
      data-portfolio-item
      initial={false}
      whileInView={reducedMotion
        ? { opacity: [0.9, 1] }
        : { opacity: [0.78, 1], transform: ['translate3d(0, 36px, 0)', 'translate3d(0, 0, 0)'] }}
      viewport={{ amount: 0.08, once: true }}
      transition={{ duration: reducedMotion ? 0.25 : 0.72, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="work-project__heading">
        <div className="work-project__title">
          <span className="work-project__number">{number}</span>
          <h3>{gallery.title}</h3>
          <p>{gallery.category}</p>
        </div>
        <div className="work-project__actions">
          <span>{frames.length} photograph{frames.length === 1 ? '' : 's'}</span>
          <SkiperLink href={href} label={`View ${gallery.title} gallery`}>
            View gallery
          </SkiperLink>
        </div>
      </header>

      <animated.a
        className="work-project__media"
        data-frame-count={frames.length}
        href={href}
        aria-label={`Open ${gallery.title} gallery`}
        onPointerMove={moveTilt}
        onPointerLeave={resetTilt}
        onFocus={() => {
          if (!reducedMotion) tiltApi.start({ scale: 1.006 });
        }}
        onBlur={resetTilt}
        style={{
          transform: to(
            [tilt.rotateX, tilt.rotateY, tilt.scale],
            (rotateX, rotateY, scale) =>
              `perspective(1400px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`,
          ),
        }}
      >
        <animated.span
          className="work-project__light"
          aria-hidden="true"
          style={{
            background: to(
              [tilt.lightX, tilt.lightY],
              (x, y) => `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,.14), transparent 34%)`,
            ),
          }}
        />
        {frames.map((frame, frameIndex) => (
          <ReelFrame
            key={`${gallery.id}-${frame.id}-${frameIndex}`}
            frame={frame}
            index={frameIndex}
            projectProgress={scrollYProgress}
            reducedMotion={reducedMotion}
          />
        ))}
      </animated.a>
    </motion.article>
  );
}

export default function SelectedWorkReel({ galleries, tone }: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const reducedMotion = useLiveReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });
  const smoothProgress = useMotionSpring(scrollYProgress, {
    stiffness: 105,
    damping: 28,
    restDelta: 0.001,
  });
  const headingX = useTransform(
    smoothProgress,
    [0, 1],
    reducedMotion ? ['0%', '0%'] : ['4%', '-4%'],
  );
  const headingTransform = useTransform(
    headingX,
    (value) => `translate3d(${value}, 0, 0)`,
  );

  if (galleries.length === 0) return null;

  return (
    <section
      ref={sectionRef}
      className="work-reel"
      data-tone={tone}
      data-project-count={galleries.length}
      data-motion-libraries="skiper-ui react-spring motion"
      aria-labelledby="selected-work-title"
    >
      <div className="work-reel__intro">
        <span className="work-reel__label">Portfolio</span>
        <motion.h2 id="selected-work-title" style={{ transform: headingTransform }}>
          <span>Selected</span>
          <em>work</em>
        </motion.h2>
        <span className="work-reel__count">
          {String(galleries.length).padStart(2, '0')} project{galleries.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="work-reel__projects">
        {galleries.map((gallery, index) => (
          <WorkProject
            key={gallery.id}
            gallery={gallery}
            index={index}
            reducedMotion={reducedMotion}
          />
        ))}
      </div>
    </section>
  );
}
