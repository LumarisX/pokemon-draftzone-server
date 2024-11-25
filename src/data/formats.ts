export type FormatId = keyof typeof Formats & string;
export type Format = {
  name: string;
  level: number;
  choose: number;
  layout: "1" | "2" | "3";
};
const Formats: {
  [key: string]: Format;
} = {
  Singles: { name: "Singles", level: 100, choose: 6, layout: "1" },
  "Singles 50": { name: "Singles 50", level: 50, choose: 6, layout: "1" },
  VGC: { name: "VGC", level: 50, choose: 4, layout: "2" },
  Doubles: { name: "Doubles", level: 100, choose: 6, layout: "2" },
  LC: { name: "LC", level: 5, choose: 6, layout: "1" },
  "LC VGC": { name: "LC VGC", level: 5, choose: 4, layout: "2" },
};

export function getFormat(formatId: string) {
  if (formatId in Formats) return Formats[formatId];
  else return Formats["Singles"];
}

export function getFormats() {
  return Object.keys(Formats);
}
