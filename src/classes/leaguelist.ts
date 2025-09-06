import type { Types } from "mongoose";
import { getFormat } from "../data/formats";
import {
  LeagueAdData,
  LeagueAdDocument,
  LeagueAdModel,
} from "../models/leaguelist.model";

export class LeagueAd {
  _id?: string;
  leagueName: string;
  owner: string;
  description: string;
  recruitmentStatus: "Open" | "Closed" | "Full" | "Canceled";
  hostLink?: string;
  divisions: {
    divisionName: string;
    ruleset: string;
    skillLevels: number[];
    prizeValue: number;
    platform: "Pokémon Showdown" | "Scarlet/Violet";
    format: string;
    description?: string;
  }[];
  status?: "Approved" | "Pending" | "Denied";
  signupLink: string;
  closesAt: Date;
  seasonStart?: Date;
  seasonEnd?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  tags: string[];

  constructor(data: {
    _id?: Types.ObjectId;
    leagueName: string;
    owner: string;
    description: string;
    recruitmentStatus?: "Open" | "Closed" | "Full" | "Canceled";
    hostLink?: string;
    divisions: {
      divisionName: string;
      ruleset: string;
      skillLevelRange: {
        from: string;
        to: string;
      };
      prizeValue?: string | number;
      platform: "Pokémon Showdown" | "Scarlet/Violet";
      format: string;
      description?: string;
    }[];
    status?: "Approved" | "Pending" | "Denied";
    signupLink: string;
    closesAt: Date;
    seasonStart?: Date;
    seasonEnd?: Date;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this._id = data._id?.toString();
    this.leagueName = data.leagueName;
    this.owner = data.owner;
    this.description = data.description;
    this.recruitmentStatus = data.recruitmentStatus ?? "Open";
    this.hostLink = data.hostLink;
    this.divisions = data.divisions.map((division) => {
      const skillLevels = [];
      const from =
        +division.skillLevelRange.from <= +division.skillLevelRange.to
          ? +division.skillLevelRange.from
          : +division.skillLevelRange.to;
      const to =
        +division.skillLevelRange.from <= +division.skillLevelRange.to
          ? +division.skillLevelRange.to
          : +division.skillLevelRange.from;
      for (let i = from; i <= to; i++) skillLevels.push(i);
      return {
        divisionName: division.divisionName,
        ruleset: division.ruleset,
        skillLevels: skillLevels,
        prizeValue: division.prizeValue ? +division.prizeValue : 0,
        platform: division.platform,
        format: division.format,
        description: division.description,
      };
    });
    this.status = data.status;
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
    // Check if all required fields are present and valid
    if (
      typeof this.leagueName !== "string" ||
      typeof this.owner !== "string" ||
      typeof this.description !== "string" ||
      !["Open", "Closed", "Full", "Canceled"].includes(
        this.recruitmentStatus
      ) ||
      typeof this.signupLink !== "string" ||
      !this.closesAt ||
      (this.hostLink && typeof this.leagueName !== "string") ||
      this.divisions.some(
        (division) =>
          typeof division.divisionName !== "string" ||
          typeof division.ruleset !== "string" ||
          !Array.isArray(division.skillLevels) ||
          division.skillLevels.some((level) => typeof level !== "number") ||
          !["Pokémon Showdown", "Scarlet/Violet"].includes(division.platform) ||
          typeof division.format !== "string"
      )
    ) {
      return false;
    }
    return true;
  }

  toString(): string {
    return JSON.stringify(this, null, 2);
  }

  async toDocument() {
    const doc: LeagueAdData = {
      leagueName: this.leagueName,
      owner: this.owner,
      description: this.description,
      recruitmentStatus: this.recruitmentStatus,
      hostLink: this.hostLink,
      divisions: this.divisions.map((division) => ({
        divisionName: division.divisionName,
        skillLevelRange: {
          from: division.skillLevels[0].toString(),
          to: division.skillLevels[division.skillLevels.length - 1].toString(),
        },
        prizeValue: division.prizeValue,
        platform: division.platform,
        format: division.format,
        ruleset: division.ruleset,
        description: division.description,
      })),
      signupLink: this.signupLink,
      closesAt: this.closesAt,
      seasonStart: this.seasonStart,
      seasonEnd: this.seasonEnd,
      status: this.status ?? "Pending",
      createdAt: this.createdAt ?? new Date(),
      updatedAt: this.updatedAt ?? new Date(),
    };
    console.log(doc.hostLink);
    return new LeagueAdModel(doc);
  }

  static fromDocument(document: LeagueAdDocument): LeagueAd {
    return new LeagueAd({
      _id: document._id,
      leagueName: document.leagueName,
      owner: document.owner,
      description: document.description,
      recruitmentStatus: document.recruitmentStatus,
      hostLink: document.hostLink ? document.hostLink : undefined,
      divisions: document.divisions.map((division) => ({
        divisionName: division.divisionName,
        ruleset: division.ruleset,
        skillLevelRange: division.skillLevelRange,
        prizeValue: division.prizeValue ? division.prizeValue : undefined,
        platform: division.platform,
        format: division.format,
        description: division.description ? division.description : undefined,
      })),
      signupLink: document.signupLink,
      closesAt: document.closesAt,
      status: document.status,
      seasonStart: document.seasonStart ? document.seasonStart : undefined,
      seasonEnd: document.seasonEnd ? document.seasonEnd : undefined,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    });
  }

  static fromForm(formData: any, owner: string) {
    const cleanString = (str: string) =>
      str.replace(/[^a-zA-Z0-9\s.,!?()\-_+'/\\\[\]]/g, "");
    console.log(formData);
    return new LeagueAd({
      leagueName: cleanString(formData.leagueName),
      description: cleanString(formData.description),
      hostLink: formData.hostLink,
      owner: owner,
      divisions: formData.divisions.map((division: any) => {
        return {
          divisionName: cleanString(division.divisionName),
          ruleset: cleanString(division.ruleset),
          skillLevelRange: division.skillLevelRange,
          prizeValue: division.prizeValue,
          platform: division.platform,
          format: cleanString(division.format),
          description: division.description
            ? cleanString(division.description)
            : undefined,
        };
      }),
      signupLink: cleanString(formData.signupLink),
      closesAt: formData.closesAt,
      seasonStart: formData.seasonStart,
      seasonEnd: formData.seasonEnd,
      createdAt: formData.createdAt,
      updatedAt: formData.updatedAt,
    });
  }
}
