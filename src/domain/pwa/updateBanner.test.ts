import { describe, expect, it } from 'vitest';
import { updateBannerVisible } from './updateBanner';

describe('updateBannerVisible', () => {
  it('shows the banner once a new version waits', () => {
    expect(updateBannerVisible({ updateReady: true, dismissed: false, studying: false })).toBe(
      true,
    );
  });

  it('shows nothing while no new version waits', () => {
    expect(updateBannerVisible({ updateReady: false, dismissed: false, studying: false })).toBe(
      false,
    );
  });

  it('waits for the end of a study session', () => {
    expect(updateBannerVisible({ updateReady: true, dismissed: false, studying: true })).toBe(
      false,
    );
  });

  it('stays hidden after "Plus tard"', () => {
    expect(updateBannerVisible({ updateReady: true, dismissed: true, studying: false })).toBe(
      false,
    );
  });
});
