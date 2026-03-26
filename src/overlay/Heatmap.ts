function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function getHeatColor(
  renderRate: number,
  coldColor: string,
  hotColor: string,
  maxRate = 20
): string {
  const t = Math.min(renderRate / maxRate, 1);
  const [r1, g1, b1] = hexToRgb(coldColor);
  const [r2, g2, b2] = hexToRgb(hotColor);

  return rgbToHex(
    r1 + (r2 - r1) * t,
    g1 + (g2 - g1) * t,
    b1 + (b2 - b1) * t
  );
}
