import type { Types } from "mongoose";
import { getFormat } from "../data/formats";
import {
  LeagueAdData,
  LeagueAdDocument,
  LeagueAdModel,
} from "../models/league-ad.model";

export class LeagueAd {
  _id?: string;
  leagueName: string;
  owner: string;
  description: string;
  leagueDoc?: string;
  serverLink?: string;
  skillLevelRange: {
    from: string;
    to: string;
  };
  skillLevels: number[];
  prizeValue: number;
  platforms: string[];
  formats: string[];
  rulesets: string[];
  status?: "Approved" | "Pending" | "Denied";
  signupLink: string;
  closesAt: Date;
  seasonStart?: Date;
  seasonEnd?: Date;
  createdAt: Date;
  updatedAt?: Date;
  tags: string[];

  constructor(data: {
    _id?: Types.ObjectId;
    leagueName: string;
    owner: string;
    description: string;
    leagueDoc?: string;
    serverLink?: string;
    skillLevelRange: {
      from: string;
      to: string;
    };
    prizeValue?: string | number;
    platforms: string[];
    formats: string[];
    rulesets: string[];
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
    this.leagueDoc = data.leagueDoc;
    this.serverLink = data.serverLink;
    this.skillLevelRange = data.skillLevelRange;

    const skillLevels = [];
    const from =
      +data.skillLevelRange.from <= +data.skillLevelRange.to
        ? +data.skillLevelRange.from
        : +data.skillLevelRange.to;
    const to =
      +data.skillLevelRange.from <= +data.skillLevelRange.to
        ? +data.skillLevelRange.to
        : +data.skillLevelRange.from;
    for (let i = from; i <= to; i++) skillLevels.push(i);

    this.skillLevels = skillLevels;
    this.prizeValue = data.prizeValue ? +data.prizeValue : 0;
    this.platforms = data.platforms;
    this.formats = data.formats;
    this.rulesets = data.rulesets;
    this.status = data.status;
    this.signupLink = data.signupLink;
    this.closesAt = data.closesAt;
    this.seasonStart = data.seasonStart;
    this.seasonEnd = data.seasonEnd;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;

    // Set tags
    const tags: { [tag: string]: boolean } = {};
    const skillMin = Math.min(...this.skillLevels);
    const skillMax = Math.max(...this.skillLevels);

    tags.prize = this.prizeValue > 0;

    // Check all formats for singles/doubles
    for (const format of this.formats) {
      const layout = getFormat(format).layout;
      if (layout === "1") tags.singles = true;
      if (layout === "2") tags.doubles = true;
    }

    // Check all platforms for PS/game tags
    const hasPS = this.platforms.some((p) =>
      ["Pokémon Showdown", "Pokemon Showdown"].includes(p)
    );
    const hasGame = this.platforms.some(
      (p) => !["Pokémon Showdown", "Pokemon Showdown"].includes(p)
    );
    tags.ps = hasPS;
    tags.game = hasGame;

    if (skillMin <= 0 && skillMax >= 0) tags.poke = true;
    if (skillMin <= 1 && skillMax >= 1) tags.great = true;
    if (skillMin <= 2 && skillMax >= 2) tags.ultra = true;
    if (skillMin <= 3 && skillMax >= 3) tags.master = true;

    this.tags = Object.entries(tags)
      .filter((e) => e[1])
      .map((e) => e[0]);
  }

  isValid(): boolean {
    if (
      typeof this.leagueName !== "string" ||
      typeof this.owner !== "string" ||
      typeof this.description !== "string" ||
      typeof this.signupLink !== "string" ||
      !this.closesAt ||
      (this.serverLink && typeof this.serverLink !== "string") ||
      (this.leagueDoc && typeof this.leagueDoc !== "string") ||
      !Array.isArray(this.rulesets) ||
      this.rulesets.length < 1 ||
      !Array.isArray(this.skillLevels) ||
      this.skillLevels.some((level) => typeof level !== "number") ||
      !Array.isArray(this.platforms) ||
      this.platforms.length < 1 ||
      !Array.isArray(this.formats) ||
      this.formats.length < 1 ||
      typeof this.prizeValue !== "number"
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
      leagueDoc: this.leagueDoc,
      serverLink: this.serverLink,
      skillLevelRange: this.skillLevelRange,
      prizeValue: this.prizeValue.toString() as "0" | "1" | "2" | "3" | "4",
      platforms: this.platforms,
      formats: this.formats,
      rulesets: this.rulesets,
      signupLink: this.signupLink,
      closesAt: this.closesAt,
      seasonStart: this.seasonStart,
      seasonEnd: this.seasonEnd,
      status: this.status ?? "Pending",
      createdAt: this.createdAt ?? new Date(),
      updatedAt: this.updatedAt ?? new Date(),
    };
    return new LeagueAdModel(doc);
  }

  static fromDocument(document: LeagueAdDocument): LeagueAd {
    return new LeagueAd({
      _id: document._id,
      leagueName: document.leagueName,
      owner: document.owner.toString(),
      description: document.description,
      leagueDoc: document.leagueDoc,
      serverLink: document.serverLink,
      skillLevelRange: document.skillLevelRange,
      prizeValue: document.prizeValue,
      platforms: document.platforms,
      formats: document.formats,
      rulesets: document.rulesets,
      signupLink: document.signupLink,
      closesAt: document.closesAt,
      status: document.status,
      seasonStart: document.seasonStart,
      seasonEnd: document.seasonEnd,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    });
  }

  static fromForm(formData: any, owner: string) {
    const cleanString = (str: string) =>
      str.replace(/[^a-zA-Z0-9\s.,!?()\-_+'/\\\[\]:@#&=%~]/g, "");
    const cleanMarkdown = (str: string) =>
      str
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/on\w+\s*=/gi, "")
        .replace(/javascript:/gi, "");

    return new LeagueAd({
      leagueName: cleanString(formData.leagueName),
      description: cleanMarkdown(formData.description),
      leagueDoc: formData.leagueDoc
        ? cleanString(formData.leagueDoc)
        : undefined,
      serverLink: formData.serverLink || undefined,
      owner: owner,
      skillLevelRange: formData.skillLevelRange,
      prizeValue: formData.prizeValue,
      platforms: formData.platforms,
      formats: (formData.formats as string[]).map(cleanString),
      rulesets: (formData.rulesets as string[]).map(cleanString),
      signupLink: cleanString(formData.signupLink),
      closesAt: new Date(formData.closesAt),
      seasonStart: formData.seasonStart
        ? new Date(formData.seasonStart)
        : undefined,
      seasonEnd: formData.seasonEnd ? new Date(formData.seasonEnd) : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
