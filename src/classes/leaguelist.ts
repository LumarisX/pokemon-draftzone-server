import { ObjectId } from "mongoose";
import {
  LeagueAdDoc,
  DivisionDocType,
  LeagueAdModel,
} from "../models/leaguelist.model";
import { getFormat } from "../data/formats";

export class LeagueAd {
  leagueName: string;
  owner: string;
  description: string;
  recruitmentStatus: "Open" | "Closed" | "Full" | "Canceled";
  hostLink?: string;
  divisions: {
    divisionName: string;
    ruleset: string;
    skillLevels: number[];
    prizeValue?: number;
    platform: "Pokémon Showdown" | "Scarlet/Violet";
    format: string;
    description?: string;
  }[];
  signupLink: string;
  closesAt: Date;
  seasonStart?: Date;
  seasonEnd?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  tags: string[];

  constructor(data: {
    leagueName: string;
    owner: string;
    description: string;
    recruitmentStatus: "Open" | "Closed" | "Full" | "Canceled";
    hostLink?: string;
    divisions: {
      divisionName: string;
      ruleset: string;
      skillLevels: number[];
      prizeValue?: string | number;
      platform: "Pokémon Showdown" | "Scarlet/Violet";
      format: string;
      description?: string;
    }[];
    signupLink: string;
    closesAt: Date;
    seasonStart?: Date;
    seasonEnd?: Date;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.leagueName = data.leagueName;
    this.owner = data.owner;
    this.description = data.description;
    this.recruitmentStatus = data.recruitmentStatus;
    this.hostLink = data.hostLink;
    this.divisions = data.divisions.map((division) => ({
      divisionName: division.divisionName,
      ruleset: division.ruleset,
      skillLevels: division.skillLevels,
      prizeValue: division.prizeValue ? +division.prizeValue : 0,
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

    // Set tags
    const tags: { [tag: string]: boolean } = {};
    let skillMin: number | undefined = undefined;
    let skillMax: number | undefined = undefined;
    this.divisions.forEach((division) => {
      skillMin =
        skillMin === undefined
          ? Math.min(...division.skillLevels)
          : Math.min(skillMin, ...division.skillLevels);
      skillMax =
        skillMax === undefined
          ? Math.max(...division.skillLevels)
          : Math.max(skillMax, ...division.skillLevels);

      tags.prize =
        tags.prize ||
        (division.prizeValue !== undefined && division.prizeValue > 0);
      const layout = getFormat(division.format).layout;
      tags.singles = tags.singles || layout === "1";
      tags.doubles = tags.doubles || layout === "2";
      const isPS = ["Pokémon Showdown", "Pokemon Showdown"].includes(
        division.platform
      );
      tags.ps = tags.ps || isPS;
      tags.game = tags.game || !isPS;
    });
    if (skillMin !== undefined && skillMax !== undefined) {
      if (skillMin <= 0 && skillMax >= 0) tags.poke = true;
      if (skillMin <= 1 && skillMax >= 1) tags.great = true;
      if (skillMin <= 2 && skillMax >= 2) tags.ultra = true;
      if (skillMin <= 3 && skillMax >= 3) tags.master = true;
    }
    this.tags = Object.entries(tags)
      .filter((e) => e[1])
      .map((e) => e[0]);
  }

  isValid(): boolean {
    if (
      !this.leagueName ||
      !this.owner ||
      !this.description ||
      !this.recruitmentStatus ||
      !this.signupLink ||
      !this.closesAt
    )
      return false;
    return true;
  }

  toString(): string {
    return JSON.stringify(this);
  }

  async toDocument() {
    return new LeagueAdModel(this);
  }

  static fromDocument(document: LeagueAdDoc): LeagueAd {
    return new LeagueAd({
      leagueName: document.leagueName,

      owner: document.owner,
      description: document.description,
      recruitmentStatus: document.recruitmentStatus,
      hostLink: document.hostLink ? document.hostLink : undefined,
      divisions: document.divisions.map((subDoc) => {
        console.log(subDoc);
        const division = subDoc as unknown as DivisionDocType;
        const skillLevels = [];
        const from =
          division.skillLevelRange.from <= division.skillLevelRange.to
            ? division.skillLevelRange.from
            : division.skillLevelRange.to;
        const to =
          division.skillLevelRange.from <= division.skillLevelRange.to
            ? division.skillLevelRange.to
            : division.skillLevelRange.from;
        for (let i = from; i < to; i++) skillLevels.push(i);
        return {
          divisionName: division.divisionName,
          ruleset: division.ruleset,
          skillLevels: skillLevels,
          prizeValue: division.prizeValue ? division.prizeValue : undefined,
          platform: division.platform,
          format: division.format,
          description: division.description ? division.description : undefined,
        };
      }),
      signupLink: document.signupLink,
      closesAt: document.closesAt,
      seasonStart: document.seasonStart ? document.seasonStart : undefined,
      seasonEnd: document.seasonEnd ? document.seasonEnd : undefined,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    });
  }

  static fromForm(formData: any, owner: ObjectId) {
    return new LeagueAd({
      ...formData,
      recruitmentStatus: "Open",
      owner: owner,
    });
  }
}
