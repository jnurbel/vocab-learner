const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG contrast ratio of two #rrggbb colours, from 1 to 21. */
export function contrast(first: string, second: string): number {
  if (!HEX_COLOR.test(first) || !HEX_COLOR.test(second)) {
    throw new Error(`Expected two #rrggbb colours, got "${first}" and "${second}"`);
  }
  const [lighter = 0, darker = 0] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface ThemeTokens {
  light: ReadonlyMap<string, string>;
  dark: ReadonlyMap<string, string>;
}

/** The light and dark colour tokens of a stylesheet; the dark theme inherits what it leaves out. */
export function themeTokens(css: string): ThemeTokens {
  const [lightCss = '', darkCss = ''] = css.split('@media (prefers-color-scheme: dark)');
  const tokensOf = (part: string) =>
    [...part.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(
      ([, name = '', color = '']) => [name, color.toLowerCase()] as const,
    );
  const light = new Map(tokensOf(lightCss));
  return { light, dark: new Map([...light, ...tokensOf(darkCss)]) };
}
