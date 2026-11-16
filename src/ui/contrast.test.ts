import { describe, expect, it } from 'vitest';

// Programmatic WCAG 2.2 contrast audit of the design tokens actually used in the UI.
const lum = (hex: string) => {
  const c = hex.replace('#', '').match(/.{2}/g)!.map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const TEXT_PAIRS: [string, string, string][] = [
  ['primary text on surface', '#17212B', '#FFFFFF'],
  ['primary text on background', '#17212B', '#F4F7FA'],
  ['secondary text on surface', '#526171', '#FFFFFF'],
  ['secondary text on background', '#526171', '#F4F7FA'],
  ['meta label on surface', '#617080', '#FFFFFF'],
  ['meta label on #F8FAFC', '#617080', '#F8FAFC'],
  ['ok pill', '#145F41', '#E6F4EC'],
  ['warn pill', '#6E4900', '#FFF4D6'],
  ['crit pill', '#9E1C27', '#FDECEE'],
  ['neutral pill', '#46525F', '#EEF2F6'],
  ['info pill', '#1A548F', '#E8F0FB'],
  ['sim pill', '#4E3699', '#F0ECFF'],
  ['primary button', '#FFFFFF', '#167A52'],
  ['green accent text on surface', '#167A52', '#FFFFFF'],
  ['active nav', '#145F41', '#E6F4EC'],
  ['banner text', '#FFFFFF', '#17212B'],
  ['banner sim text', '#C9B8FF', '#17212B'],
  ['last-known label', '#6E4900', '#FFFFFF'],
  ['stale value', '#5E6B78', '#FFFFFF'],
  ['badge', '#FFFFFF', '#B4232F'],
];
const UI_PAIRS: [string, string, string][] = [
  ['focus ring vs surface', '#17212B', '#FFFFFF'],
  ['selected region vs surface', '#1E9E63', '#FFFFFF'],
  ['selected-region stroke vs selected fill', '#0B2E1F', '#1E9E63'],
  ['live trend line vs surface', '#167A52', '#FFFFFF'],
  ['backfilled trend line vs surface', '#B26B00', '#FFFFFF'],
  ['mapped region vs surface', '#6B8577', '#FFFFFF'],
  ['unmapped region vs surface', '#8A9890', '#FFFFFF'],
  ['hovered region vs surface', '#3F9A6C', '#FFFFFF'],
];

describe('WCAG 2.2 AA contrast audit', () => {
  it.each(TEXT_PAIRS)('text: %s ≥ 4.5:1', (_n, fg, bg) => { expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5); });
  it.each(UI_PAIRS)('non-text UI: %s ≥ 3:1', (_n, fg, bg) => { expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3); });
});
