export type FormatId = keyof typeof Formats & string;
const Formats: {
  [key: string]: {
    level: number;
    choose: number;
  };
} = {
  Singles: { level: 100, choose: 6 },
  "Singles 50": { level: 50, choose: 6 },
  VGC: { level: 50, choose: 4 },
  Doubles: { level: 100, choose: 6 },
  LC: { level: 5, choose: 6 },
  "LC VGC": { level: 5, choose: 4 },
};

export function getFormat(formatId: string) {
  if (formatId in Formats) return Formats[formatId];
  else return Formats["Singles"];
}

export function getFormats() {
  return Object.keys(Formats);
}
