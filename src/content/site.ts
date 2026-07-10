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
      { src: '/images/cinematic/wedding-courthouse.webp', alt: 'Newlyweds leaving a stone courthouse at dusk' },
      { src: '/images/cinematic/wedding-window.webp', alt: 'Bride in a veil standing beside a hotel window' },
      { src: '/images/cinematic/wedding-dance.webp', alt: 'Newlyweds turning on a warmly lit dance floor' },
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
      { src: '/images/cinematic/portrait-oxblood.webp', alt: 'Editorial profile portrait against an oxblood background' },
      { src: '/images/cinematic/portrait-ceramicist.webp', alt: 'Ceramic artist photographed in his workshop' },
      { src: '/images/cinematic/portrait-musician.webp', alt: 'Musician in a long black coat photographed with direct flash' },
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
      { src: '/images/cinematic/commercial-fragrance.webp', alt: 'Clear fragrance bottle in warm directional light' },
      { src: '/images/cinematic/commercial-audio.webp', alt: 'Silver headphones and an analog recorder on steel' },
      { src: '/images/cinematic/commercial-jewelry.webp', alt: 'Hands styling sculptural silver jewelry over black wool' },
    ],
  },
] as const;

export const plans: readonly Plan[] = [
  {
    name: 'Essential',
    monthlyPrice: 30,
    buildFee: 0,
    description: 'A polished home for a photographer ready to look established online.',
    features: ['Focused one-page site', 'Mobile-ready portfolio', 'Hosting and routine care', 'Personal email support'],
  },
  {
    name: 'Studio',
    monthlyPrice: 65,
    buildFee: 0,
    description: 'A fuller portfolio and inquiry journey for a growing photography business.',
    features: ['Multi-page experience', 'Expanded project galleries', 'Inquiry form setup', 'Content updates and support'],
    featured: true,
  },
  {
    name: 'Signature',
    monthlyPrice: 100,
    buildFee: 0,
    description: 'A more tailored digital presence with room for ambitious ideas.',
    features: ['Custom page direction', 'Priority update support', 'Advanced inquiry flows', 'Payment-ready planning'],
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
