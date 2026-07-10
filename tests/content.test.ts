import { describe, expect, it } from 'vitest';

import { concepts, contactEmail, plans } from '../src/content/site';

describe('launch content', () => {
  it('keeps every portfolio example honest', () => {
    expect(concepts).toHaveLength(3);
    expect(concepts.every((concept) => concept.label === 'Concept Project')).toBe(true);
  });

  it('publishes the approved monthly range without a build fee', () => {
    expect(plans.map((plan) => plan.monthlyPrice)).toEqual([30, 65, 100]);
    expect(plans.every((plan) => plan.buildFee === 0)).toBe(true);
  });

  it('uses the approved contact address', () => {
    expect(contactEmail).toBe('sites.by.leon@gmail.com');
  });
});
