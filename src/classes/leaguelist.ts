import { ObjectId } from "mongoose";
import { LeagueAdModel } from "../models/leaguelist.model";

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
      from: string;
      to: string;
    };
    prizeValue?: string;
    platform: "Pokémon Showdown" | "Scarlet/Violet";
    format: string;
    description?: string;
  }[];
  signupLink: string;
  closesAt: string;
  seasonStart?: string;
  seasonEnd?: string;
  createdAt?: string;
  updatedAt?: string;

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
        from: string;
        to: string;
      };
      prizeValue?: string;
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
    this.divisions = data.divisions.map((division) => ({
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

  static fromDocument(document: any): LeagueAd {
    return new LeagueAd(document);
  }

  static fromForm(formData: any, owner: ObjectId) {
    return new LeagueAd({
      ...formData,
      recruitmentStatus: "Open",
      owner: owner,
    });
  }
}
