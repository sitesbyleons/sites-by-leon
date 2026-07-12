import type { Portfolio } from './types';

const sportsImage = (
  id: string,
  file: string,
  alt: string,
) => ({
  id,
  src: `/images/sports/${file}.webp`,
  alt,
  caption: null,
  width: 1600,
  height: 1200,
});

export const demoPortfolio = {
  studioName: 'Northline Sports',
  location: 'Indianapolis / available nationwide',
  email: 'hello@northlinesports.example',
  conceptNotice: '',
  home: {
    eyebrow: 'Sports photography',
    headline: 'Northline Sports',
    introduction: 'Sports photography for teams and athletes.',
    biography: 'Football, basketball, and track photography.',
    announcement: 'Available for games, tournaments, and athlete sessions.',
    contactLabel: 'Contact Northline',
    featuredGallerySlugs: ['friday-night', 'above-the-rim', 'lane-eight'],
  },
  galleries: [
    {
      id: 'gallery-football',
      slug: 'friday-night',
      title: 'Football',
      category: 'Game coverage',
      description: 'High school and club football coverage.',
      cover: sportsImage(
        'football-cover',
        'football-huddle',
        'Two football teams set at the line of scrimmage under stadium lights',
      ),
      images: [
        sportsImage(
          'football-01',
          'football-huddle',
          'Two football teams set at the line of scrimmage under stadium lights',
        ),
        sportsImage(
          'football-02',
          'football-player',
          'Quarterback preparing to pass during a late-afternoon football game',
        ),
        sportsImage(
          'football-03',
          'football-field',
          'Football player carrying the ball while a defender closes in',
        ),
      ],
      publishedAt: '2026-08-22T14:00:00.000Z',
    },
    {
      id: 'gallery-basketball',
      slug: 'above-the-rim',
      title: 'Basketball',
      category: 'Game coverage',
      description: 'Basketball games, tournaments, and practices.',
      cover: sportsImage(
        'basketball-cover',
        'basketball-action',
        'Basketball players driving down the court with motion blur',
      ),
      images: [
        sportsImage(
          'basketball-01',
          'basketball-action',
          'Basketball players driving down the court with motion blur',
        ),
        sportsImage(
          'basketball-02',
          'basketball-grayscale',
          'Black-and-white basketball game with players contesting a shot',
        ),
        sportsImage(
          'basketball-03',
          'basketball-court',
          'Basketball players practicing beneath arena lights on an orange court',
        ),
      ],
      publishedAt: '2026-02-14T14:00:00.000Z',
    },
    {
      id: 'gallery-track',
      slug: 'lane-eight',
      title: 'Track & Field',
      category: 'Meet coverage',
      description: 'Track meets, training, and athlete sessions.',
      cover: sportsImage(
        'track-cover',
        'track-runner',
        'Sprinter launching from the starting blocks on a red track',
      ),
      images: [
        sportsImage(
          'track-01',
          'track-runner',
          'Sprinter launching from the starting blocks on a red track',
        ),
        sportsImage(
          'track-02',
          'track-start',
          'Runner accelerating away from the blocks on a red track',
        ),
        sportsImage(
          'track-03',
          'track-night',
          'Woman sprinting alone on an illuminated running track at night',
        ),
      ],
      publishedAt: '2026-05-30T14:00:00.000Z',
    },
  ],
  posts: [
    {
      id: 'post-sideline',
      slug: 'working-the-sideline',
      title: 'Photographing Football',
      excerpt: 'Notes on position, timing, and following a play.',
      body: [
        'Choose a position before the play, follow the action, and leave enough room in the frame for the players to move.',
      ],
      cover: sportsImage(
        'post-sideline-cover',
        'football-player',
        'Quarterback preparing to pass during a late-afternoon football game',
      ),
      relatedGallerySlug: 'friday-night',
      publishedAt: '2026-08-30T14:00:00.000Z',
    },
    {
      id: 'post-arena',
      slug: 'arena-light',
      title: 'Photographing Basketball Indoors',
      excerpt: 'Notes on exposure and color in indoor gyms.',
      body: [
        'Set the exposure for the players and adjust white balance for the lighting in the gym.',
      ],
      cover: sportsImage(
        'post-arena-cover',
        'basketball-court',
        'Basketball players practicing beneath arena lights on an orange court',
      ),
      relatedGallerySlug: 'above-the-rim',
      publishedAt: '2026-03-02T14:00:00.000Z',
    },
    {
      id: 'post-finish',
      slug: 'through-the-finish',
      title: 'Photographing Track',
      excerpt: 'Notes on starts, finishes, and reactions after a race.',
      body: [
        'Photograph the start, the finish, and the athletes immediately after the race.',
      ],
      cover: sportsImage(
        'post-finish-cover',
        'track-night',
        'Woman sprinting alone on an illuminated running track at night',
      ),
      relatedGallerySlug: 'lane-eight',
      publishedAt: '2026-06-08T14:00:00.000Z',
    },
  ],
  packages: [
    {
      id: 'package-game',
      name: 'Game Coverage',
      startingPrice: 'From $450',
      description: 'Photography coverage for one game.',
      features: ['Full-game coverage', '40 edited images', '48-hour delivery'],
      ctaLabel: 'Ask about this package',
    },
    {
      id: 'package-season',
      name: 'Season Coverage',
      startingPrice: 'Custom',
      description: 'Photography coverage for multiple games during a season.',
      features: ['Multi-game plan', 'Team image library', 'Priority delivery'],
      ctaLabel: 'Ask about this package',
    },
    {
      id: 'package-athlete',
      name: 'Athlete Session',
      startingPrice: 'From $600',
      description: 'Action photography and athlete portraits.',
      features: ['Training coverage', 'Portrait session', 'Recruiting-ready selects'],
      ctaLabel: 'Ask about this package',
    },
  ],
} satisfies Portfolio;
