export type FormatId = keyof typeof Formats & string;
const Formats: {
  [key: string]: {
    level: number;
    choose: number;
    layout: "1" | "2" | "3";
  };
} = {
  Singles: { level: 100, choose: 6, layout: "1" },
  "Singles 50": { level: 50, choose: 6, layout: "1" },
  VGC: { level: 50, choose: 4, layout: "2" },
  Doubles: { level: 100, choose: 6, layout: "2" },
  LC: { level: 5, choose: 6, layout: "1" },
  "LC VGC": { level: 5, choose: 4, layout: "2" },
};

export function getFormat(formatId: string) {
  if (formatId in Formats) return Formats[formatId];
  else return Formats["Singles"];
}

export function getFormats() {
  return Object.keys(Formats);
}
