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
export const instagramUrl = 'https://www.instagram.com/sites.by.leon/';

export const navigation: readonly NavigationItem[] = [
  { label: 'Work', href: '#work' },
  { label: 'Services', href: '#services' },
  { label: 'Pricing', href: '#pricing' },
] as const;

export const concepts: readonly Concept[] = [
  {
    slug: 'vow-and-light',
    name: 'Vow & Light',
    focus: 'Wedding photography',
    label: 'Concept Project',
    domain: 'vowandlight.photo',
    description: 'Wedding galleries and inquiry details.',
    images: [
      { src: '/images/cinematic/wedding-courthouse.webp', alt: 'Bride and groom holding hands during an outdoor ceremony' },
      { src: '/images/cinematic/wedding-window.webp', alt: 'Newlyweds kissing as flower petals fall around their wedding party' },
      { src: '/images/cinematic/wedding-dance.webp', alt: 'Black-and-white portrait of newlyweds beneath a windblown veil' },
    ],
  },
  {
    slug: 'northline-portraits',
    name: 'Northline Portraits',
    focus: 'Portrait studio',
    label: 'Concept Project',
    domain: 'northlineportraits.com',
    description: 'Portrait galleries and session booking.',
    images: [
      { src: '/images/cinematic/portrait-oxblood.webp', alt: 'Low-key studio portrait of a woman against a black background' },
      { src: '/images/cinematic/portrait-ceramicist.webp', alt: 'Red-haired creative seated at a studio table in colored light' },
      { src: '/images/cinematic/portrait-musician.webp', alt: 'Editorial portrait of a woman in a dark top' },
    ],
  },
] as const;

export const plans: readonly Plan[] = [
  {
    name: 'Essential',
    monthlyPrice: 25,
    buildFee: 0,
    description: 'The essentials for launching a photography business and getting paid online.',
    features: ['Custom domain', 'Control panel', 'Invoicing', 'Secure client payments', '15 GB photo storage'],
  },
  {
    name: 'Studio',
    monthlyPrice: 35,
    buildFee: 0,
    description: 'Advanced settings and publishing tools for a growing photography studio.',
    features: ['Everything in Essential', 'Early access to new features', 'Advanced settings', '15 GB photo storage', 'Social media post gallery'],
    featured: true,
  },
] as const;

export const services: readonly Service[] = [
  {
    index: '01',
    title: 'Website design',
    description: 'The pages and image layout are based on your photography business.',
  },
  {
    index: '02',
    title: 'Hosting and updates',
    description: 'Leon publishes the site, hosts it, and handles routine updates.',
  },
  {
    index: '03',
    title: 'Direct support',
    description: 'Email Leon when you need a change or have a question.',
  },
] as const;

export const processSteps: readonly ProcessStep[] = [
  {
    index: '01',
    title: 'Tell Leon what you need',
    description: 'Share what you photograph and what the website needs to do.',
  },
  {
    index: '02',
    title: 'Choose the pages and photos',
    description: 'Choose the pages, images, colors, and type for the site.',
  },
  {
    index: '03',
    title: 'Review the site',
    description: 'Review the website and send Leon any changes before launch.',
  },
  {
    index: '04',
    title: 'Publish the site',
    description: 'Leon publishes the site, manages hosting, and handles future updates.',
  },
] as const;
