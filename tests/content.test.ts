import { describe, expect, it } from 'vitest';

import { concepts, contactEmail, plans } from '../src/content/site';

describe('launch content', () => {
  it('keeps every portfolio example honest', () => {
    expect(concepts).toHaveLength(3);
    expect(concepts.every((concept) => concept.label === 'Concept Project')).toBe(true);
  });

  it('publishes the approved monthly range without a build fee', () => {
    expect(plans.map((plan) => plan.monthlyPrice)).toEqual([25, 30, 40]);
    expect(plans.every((plan) => plan.buildFee === 0)).toBe(true);
  });

  it('includes domains and payments in every plan while reserving custom design for Signature', () => {
    expect(plans.every((plan) => plan.features.includes('Custom domain'))).toBe(true);
    expect(plans.every((plan) => plan.features.includes('Payment system'))).toBe(true);
    expect(plans.slice(0, 2).every((plan) => plan.features.some((feature) => /template/i.test(feature)))).toBe(true);
    expect(plans[2].features).toContain('Custom-made site');
  });

  it('uses the approved contact address', () => {
    expect(contactEmail).toBe('sites.by.leon@gmail.com');
  });
});
