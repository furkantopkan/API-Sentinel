import { describe, expect, it } from 'vitest';
import {
  ACTION_WINDOW_MS,
  createActionTracker,
  reportedTime,
  userActionScript,
} from '../../src/services/recorder/userActions';

describe('createActionTracker', () => {
  it('counts nothing as the user before the first click', () => {
    expect(createActionTracker().triggerOf(1000)).toBe('page');
  });

  it('gives a request to the user when it starts shortly after a click', () => {
    const tracker = createActionTracker();
    tracker.userActed(1000);
    expect(tracker.triggerOf(1000)).toBe('user');
    expect(tracker.triggerOf(1000 + ACTION_WINDOW_MS)).toBe('user');
    expect(tracker.triggerOf(1001 + ACTION_WINDOW_MS)).toBe('page');
    expect(tracker.triggerOf(999)).toBe('page');
  });

  // Seen on a real shop: a product page loads "recently viewed" by itself after the click on the product.
  it('gives what a new page loads by itself back to the page', () => {
    const tracker = createActionTracker();
    tracker.userActed(1000);
    tracker.navigationStarted(1200);
    expect(tracker.triggerOf(1100)).toBe('user');
    expect(tracker.triggerOf(1500)).toBe('page');
    tracker.userActed(5000);
    expect(tracker.triggerOf(5100)).toBe('user');
  });
});

describe('reportedTime', () => {
  it('uses the time of the click when it is recent, and "now" for anything else', () => {
    expect(reportedTime(9_000, 10_000)).toBe(9_000);
    expect(reportedTime(10_000 - 61_000, 10_000)).toBe(10_000);
    expect(reportedTime('9000', 10_000)).toBe(10_000);
    expect(reportedTime(Number.NaN, 10_000)).toBe(10_000);
  });
});

describe('userActionScript', () => {
  it('reports to the binding by its exact name, quoted safely', () => {
    const script = userActionScript('a"b');
    expect(script).toContain('window["a\\"b"]');
    expect(script).toContain("addEventListener('click', report, true)");
    // Helpers added by the TypeScript runner do not exist in the page.
    expect(script).not.toContain('__name');
  });
});

// Seen on a shop: after "add to cart" was answered, a box loaded payment options and offers.
describe('createActionTracker after a change was answered', () => {
  it('gives what the page loads to show the result back to the page', () => {
    const tracker = createActionTracker();
    tracker.userActed(1000);
    tracker.changeAnswered(1010, 1300);
    expect(tracker.triggerOf(1010)).toBe('user');
    expect(tracker.triggerOf(1200)).toBe('user');
    expect(tracker.triggerOf(1350)).toBe('page');
  });

  it('does not let a change answered before the click end the next click', () => {
    const tracker = createActionTracker();
    tracker.changeAnswered(500, 900);
    tracker.userActed(1000);
    expect(tracker.triggerOf(1100)).toBe('user');
  });
});
