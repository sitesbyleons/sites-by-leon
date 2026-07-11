export type NavigationItem = {
  label: string;
  href: `#${string}`;
};

export type Concept = {
  slug: string;
  name: string;
  focus: string;
  label: 'Concept Project';
  domain: string;
  description: string;
  images: readonly {
    src: string;
    alt: string;
  }[];
};

export type Plan = {
  name: string;
  monthlyPrice: number;
  buildFee: 0;
  description: string;
  features: readonly string[];
  featured?: boolean;
};

export type Service = {
  index: string;
  title: string;
  description: string;
};

export type ProcessStep = {
  index: string;
  title: string;
  description: string;
};

export const contactEmail = 'sites.by.leon@gmail.com';

export const navigation: readonly NavigationItem[] = [
  { label: 'Work', href: '#work' },
  { label: 'Services', href: '#services' },
  { label: 'Pricing', href: '#pricing' },
] as const;

export const concepts: readonly Concept[] = [
  {
    slug: 'vow-and-light',
    name: 'Vow & Light',
    focus: 'Editorial wedding photography',
    label: 'Concept Project',
    domain: 'vowandlight.photo',
    description: 'Editorial stories with room to breathe.',
    images: [
      { src: '/images/cinematic/wedding-courthouse.webp', alt: 'Bride and groom holding hands during an outdoor ceremony' },
      { src: '/images/cinematic/wedding-window.webp', alt: 'Newlyweds kissing as flower petals fall around their wedding party' },
      { src: '/images/cinematic/wedding-dance.webp', alt: 'Black-and-white portrait of newlyweds beneath a windblown veil' },
    ],
  },
  {
    slug: 'northline-portraits',
    name: 'Northline Portraits',
    focus: 'Bold portrait studio',
    label: 'Concept Project',
    domain: 'northlineportraits.com',
    description: 'Bold portraits. Clear booking.',
    images: [
      { src: '/images/cinematic/portrait-oxblood.webp', alt: 'Low-key studio portrait of a woman against a black background' },
      { src: '/images/cinematic/portrait-ceramicist.webp', alt: 'Red-haired creative seated at a studio table in colored light' },
      { src: '/images/cinematic/portrait-musician.webp', alt: 'Editorial portrait of a woman in a dark top' },
    ],
  },
  {
    slug: 'fieldwork-commercial',
    name: 'Fieldwork Commercial',
    focus: 'Minimal commercial photography',
    label: 'Concept Project',
    domain: 'fieldwork.studio',
    description: 'Projects, briefs, and client payments.',
    images: [
      { src: '/images/cinematic/commercial-fragrance.webp', alt: 'Pink glass fragrance bottle in warm directional light' },
      { src: '/images/cinematic/commercial-audio.webp', alt: 'Black wireless headphones photographed on a white background' },
      { src: '/images/cinematic/commercial-jewelry.webp', alt: 'Blue gemstone earrings arranged on a green leaf' },
    ],
  },
] as const;

export const plans: readonly Plan[] = [
  {
    name: 'Essential',
    monthlyPrice: 25,
    buildFee: 0,
    description: 'A sharp one-page start for a new photography business.',
    features: ['Template one-page site', 'Custom domain', 'Payment system', 'Hosting and care'],
  },
  {
    name: 'Studio',
    monthlyPrice: 30,
    buildFee: 0,
    description: 'More pages and galleries for a growing body of work.',
    features: ['Template multi-page site', 'Custom domain', 'Payment system', 'Galleries and inquiries'],
    featured: true,
  },
  {
    name: 'Signature',
    monthlyPrice: 40,
    buildFee: 0,
    description: 'A custom direction shaped around your photography and brand.',
    features: ['Custom-made site', 'Custom domain', 'Payment system', 'Hosting and priority care'],
  },
] as const;

export const services: readonly Service[] = [
  {
    index: '01',
    title: 'Designed around your work',
    description: 'Every layout is shaped around your images, voice, audience, and photography focus.',
  },
  {
    index: '02',
    title: 'Hosted and maintained',
    description: 'Launch, routine technical care, and dependable hosting stay off your plate.',
  },
  {
    index: '03',
    title: 'A real person to contact',
    description: 'When you want an update or have a question, you talk directly with Leon.',
  },
] as const;

export const processSteps: readonly ProcessStep[] = [
  {
    index: '01',
    title: 'Start with a conversation',
    description: 'Tell me what you photograph, what you need, and where your current site falls short.',
  },
  {
    index: '02',
    title: 'Shape the direction',
    description: 'We align on the pages, personality, and images that will make the site feel like yours.',
  },
  {
    index: '03',
    title: 'Review the build',
    description: 'You see the site before launch and we refine the details together.',
  },
  {
    index: '04',
    title: 'Launch without the headache',
    description: 'I publish the site, handle the hosting, and stay available for ongoing care.',
  },
] as const;
