export type FormatId =
  | "Singles"
  | "Singles 50"
  | "LC"
  | "VGC"
  | "Doubles"
  | "LC VGC";
export type Format = {
  name: FormatId;
  desc?: string;
  level: number;
  choose: number;
  layout: "1" | "2" | "3";
};

const Formats: { [key: string]: { [key: string]: Format } } = {
  Singles: {
    Standard: {
      name: "Singles",
      level: 100,
      choose: 6,
      layout: "1",
      desc: "1v1; Level 100",
    },
    "Singles 50": {
      name: "Singles 50",
      level: 50,
      choose: 6,
      layout: "1",
      desc: "1v1; Level 50",
    },
    LC: {
      name: "LC",
      level: 5,
      choose: 6,
      layout: "1",
      desc: "1v1; Level 5",
    },
  },
  Doubles: {
    VGC: {
      name: "VGC",
      level: 50,
      choose: 4,
      layout: "2",
      desc: "2v2; Bring 6, choose 4; Level 50",
    },
    Standard: {
      name: "Doubles",
      level: 100,
      choose: 6,
      layout: "2",
      desc: "2v2; Level 100",
    },
    "LC VGC": {
      name: "LC VGC",
      level: 5,
      choose: 4,
      layout: "2",
      desc: "2v2; Bring 6, choose 4; Level 5",
    },
  },
};

export function getFormat(formatId: string): Format {
  for (const groupKey in Formats) {
    for (const rulesetKey in Formats[groupKey]) {
      if (Formats[groupKey][rulesetKey].name === formatId)
        return Formats[groupKey][rulesetKey];
    }
  }
  throw new Error(`Format ID not found: ${formatId}`);
}

export function getFormats() {
  return Object.values(Formats).flatMap((groupData) =>
    Object.values(groupData).flatMap((formatData) => formatData.name)
  );
}

export function _getFormats() {
  return Object.entries(Formats).map(([groupName, groupData]) => [
    groupName,
    Object.entries(groupData).flatMap(([formatKey, formatData]) => ({
      name: formatKey,
      id: formatData.name,
      desc: formatData.desc,
    })),
  ]);
}
