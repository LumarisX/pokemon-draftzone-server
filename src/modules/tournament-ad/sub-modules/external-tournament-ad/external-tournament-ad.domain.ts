import { getFormat } from "@core/data/formats/formats";

export class ExternalTournamentAd {
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
  createdAt?: Date;
  tags: string[];

  constructor(props: {
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
    prizeValue?: string | number;
    platforms: string[];
    formats: string[];
    rulesets: string[];
    status?: "Approved" | "Pending" | "Denied";
    signupLink: string;
    closesAt: Date;
    seasonStart?: Date;
    seasonEnd?: Date;
    createdAt?: Date;
  }) {
    this._id = props._id;
    this.leagueName = props.leagueName;
    this.owner = props.owner;
    this.description = props.description;
    this.leagueDoc = props.leagueDoc;
    this.serverLink = props.serverLink;
    this.skillLevelRange = props.skillLevelRange;

    const skillLevels = [];
    const from =
      +props.skillLevelRange.from <= +props.skillLevelRange.to
        ? +props.skillLevelRange.from
        : +props.skillLevelRange.to;
    const to =
      +props.skillLevelRange.from <= +props.skillLevelRange.to
        ? +props.skillLevelRange.to
        : +props.skillLevelRange.from;
    for (let i = from; i <= to; i++) skillLevels.push(i);

    this.skillLevels = skillLevels;
    this.prizeValue = props.prizeValue ? +props.prizeValue : 0;
    this.platforms = props.platforms;
    this.formats = props.formats;
    this.rulesets = props.rulesets;
    this.status = props.status;
    this.signupLink = props.signupLink;
    this.closesAt = props.closesAt;
    this.seasonStart = props.seasonStart;
    this.seasonEnd = props.seasonEnd;
    this.createdAt = props.createdAt;

    const tags: { [tag: string]: boolean } = {};
    const skillMin = Math.min(...this.skillLevels);
    const skillMax = Math.max(...this.skillLevels);

    tags.prize = this.prizeValue > 0;

    for (const format of this.formats) {
      const layout = getFormat(format).layout;
      if (layout === "1") tags.singles = true;
      if (layout === "2") tags.doubles = true;
    }

    const hasPS = this.platforms.some((p) =>
      ["Pokémon Showdown", "Pokemon Showdown"].includes(p),
    );
    const hasGame = this.platforms.some(
      (p) => !["Pokémon Showdown", "Pokemon Showdown"].includes(p),
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
}
