export type FormatId = keyof typeof Formats;

type Formats = {
  [key: string]: {
    level: number;
    choose: number;
  };
};

export const Formats = {
  Singles: { level: 100, choose: 6 },
  "Singles 50": { level: 50, choose: 6 },
  VGC: { level: 50, choose: 4 },
  Doubles: { level: 100, choose: 6 },
  LC: { level: 5, choose: 6 },
  "LC VGC": { level: 5, choose: 4 },
};
