import { describe, expect, it } from 'vitest';
import { daysLeft, founderOfferOpen, isProActive, merchFeeLabel, type SubjectPlan } from './planRules';

const base: SubjectPlan = {
  subjectId: 's1',
  plan: 'pro',
  status: 'active',
  source: 'store',
  founder: false,
  trialEndsAt: null,
  currentPeriodEnd: null,
};
const now = Date.parse('2026-12-01T12:00:00Z');

describe('isProActive', () => {
  it('no row or free plan is not Pro', () => {
    expect(isProActive(null, now)).toBe(false);
    expect(isProActive({ ...base, plan: 'free' }, now)).toBe(false);
  });
  it('active or trialing with a future or open period is Pro', () => {
    expect(isProActive(base, now)).toBe(true);
    expect(isProActive({ ...base, status: 'trialing', currentPeriodEnd: '2027-06-30T21:59:59Z' }, now)).toBe(true);
  });
  it('past periods and other statuses are not Pro', () => {
    expect(isProActive({ ...base, currentPeriodEnd: '2026-11-30T00:00:00Z' }, now)).toBe(false);
    expect(isProActive({ ...base, status: 'past_due' }, now)).toBe(false);
    expect(isProActive({ ...base, status: 'cancelled' }, now)).toBe(false);
  });
});

describe('daysLeft', () => {
  it('counts whole days to the end of the period', () => {
    expect(daysLeft({ ...base, currentPeriodEnd: '2026-12-11T12:00:00Z' }, now)).toBe(10);
    expect(daysLeft({ ...base, currentPeriodEnd: '2026-12-01T13:00:00Z' }, now)).toBe(1);
  });
  it('is null without an end or when not Pro', () => {
    expect(daysLeft(base, now)).toBeNull();
    expect(daysLeft(null, now)).toBeNull();
  });
});

describe('founders and fee', () => {
  it('the founders offer closes on 1 Apr 2027', () => {
    expect(founderOfferOpen(now)).toBe(true);
    expect(founderOfferOpen(Date.parse('2027-04-01T00:00:00+02:00'))).toBe(false);
  });
  it('formats the merch fee', () => {
    expect(merchFeeLabel()).toBe('5 %');
    expect(merchFeeLabel(750)).toBe('7,5 %');
  });
});
