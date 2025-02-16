export type RGB = [number, number, number];
export type HSL = [number, number, number];

export function rgbToHsl(rgb: RGB): HSL {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = l < 0.5 ? delta / (max + min) : delta / (2 - max - min);
    switch (max) {
      case r:
        h = (g - b) / delta + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      case b:
        h = (r - g) / delta + 4;
        break;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

export function hslToRgb(hsl: HSL): RGB {
  const h = hsl[0] % 360;
  const s = hsl[1] / 100;
  const l = hsl[2] / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - chroma / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (h < 60) {
    r = chroma;
    g = x;
  } else if (h < 120) {
    r = x;
    g = chroma;
  } else if (h < 180) {
    g = chroma;
    b = x;
  } else if (h < 240) {
    g = x;
    b = chroma;
  } else if (h < 300) {
    r = x;
    b = chroma;
  } else {
    r = chroma;
    b = x;
  }
  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);
  return [r, g, b];
}

function numberToRgb(hexNumber: number): RGB {
  hexNumber = hexNumber & 0xffffff;
  const r = (hexNumber >> 16) & 0xff;
  const g = (hexNumber >> 8) & 0xff;
  const b = hexNumber & 0xff;
  return [r, g, b];
}

export function rgbToHexString(rgb: RGB): string {
  const [r, g, b] = rgb;
  const red = r.toString(16).padStart(2, "0");
  const green = g.toString(16).padStart(2, "0");
  const blue = b.toString(16).padStart(2, "0");
  return `#${red}${green}${blue}`.toUpperCase();
}

export function generateColorScale(
  hexNumber: number,
  values: [number, number][],
  saturation: number = 100
) {
  const hsl = rgbToHsl(numberToRgb(hexNumber));
  hsl[1] = saturation;
  values.forEach(([key, value]) => {
    hsl[2] = value;
    console.log(`${key}: ${rgbToHexString(hslToRgb(hsl))},`);
  });
}

export function generateDarkColorScale(
  hexNumber: number,
  count: number
): RGB[] {
  let hsl = rgbToHsl(numberToRgb(hexNumber));
  const scale = [];
  for (let i = 0; i < count + 20; i++) {
    hsl[2] = (100 / (count + 20 - 1)) * i;
    scale.push(hslToRgb(hsl));
  }
  return scale.slice(0, count);
}
