export class LeagueAd {
  leagueName: string;
  owner: string;
  description: string;
  recruitmentStatus: "Open" | "Closed" | "Full" | "Canceled";
  hostLink?: string;
  divisions: {
    divisionName: string;
    ruleset: string;
    skillLevelRange: {
      from: number;
      to: number;
    };
    prizeValue?: number;
    platform: "Pokémon Showdown" | "Scarlet/Violet";
    format: string;
    description?: string;
  }[];
  signupLink: string;
  closesAt: string;
  seasonStart?: string;
  seasonEnd?: string;
  createdAt: string;
  updatedAt: string;

  constructor(data: {
    leagueName: string;
    owner: string;
    description: string;
    recruitmentStatus: "Open" | "Closed" | "Full" | "Canceled";
    hostLink?: string;
    divisions: {
      divisionName: string;
      ruleset: string;
      skillLevelRange: {
        from: number;
        to: number;
      };
      prizeValue?: number;
      platform: "Pokémon Showdown" | "Scarlet/Violet";
      format: string;
      description?: string;
    }[];
    signupLink: string;
    closesAt: string;
    seasonStart?: string;
    seasonEnd?: string;
    createdAt: string;
    updatedAt: string;
  }) {
    this.leagueName = data.leagueName;
    this.owner = data.owner;
    this.description = data.description;
    this.recruitmentStatus = data.recruitmentStatus;
    this.hostLink = data.hostLink;
    this.divisions = data.divisions.map((division: any) => ({
      divisionName: division.divisionName,
      ruleset: division.ruleset,
      skillLevelRange: {
        from: division.skillLevelRange.from,
        to: division.skillLevelRange.to,
      },
      prizeValue: division.prizeValue,
      platform: division.platform,
      format: division.format,
      description: division.description,
    }));
    this.signupLink = data.signupLink;
    this.closesAt = data.closesAt;
    this.seasonStart = data.seasonStart;
    this.seasonEnd = data.seasonEnd;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  toString(): string {
    return JSON.stringify(this);
  }

  toDocument() {}

  static fromDocument(document: any): LeagueAd {
    const league = new LeagueAd(document);
    return league;
  }

  static fromForm() {}
}
