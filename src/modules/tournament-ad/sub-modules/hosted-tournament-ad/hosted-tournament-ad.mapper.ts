import { getFormat } from "@core/data/formats/formats";
import { LeagueDocument } from "@modules/league/league.schema";
import { HostedTournamentDocument } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.schema";

const SHOWDOWN_PLATFORMS = ["Pokémon Showdown", "Pokemon Showdown"];
const DEFAULT_SKILL_FROM = 0;
const DEFAULT_SKILL_TO = 3;

export class HostedTournamentAdMapper {
  static toClientPayload(
    doc: Omit<HostedTournamentDocument, "league">,
    league: LeagueDocument,
  ) {
    const adSettings = doc.adSettings;
    const rawFrom = Number(
      adSettings?.skillLevelRange?.from ?? DEFAULT_SKILL_FROM,
    );
    const rawTo = Number(adSettings?.skillLevelRange?.to ?? DEFAULT_SKILL_TO);
    const skillMin = Math.min(rawFrom, rawTo);
    const skillMax = Math.max(rawFrom, rawTo);
    const skillLevels: number[] = [];
    for (let i = skillMin; i <= skillMax; i++) skillLevels.push(i);

    const prizeValue = adSettings?.prizeValue ? +adSettings.prizeValue : 0;
    const platforms = adSettings?.platforms?.length
      ? [...adSettings.platforms]
      : [SHOWDOWN_PLATFORMS[0]];
    const formats = [doc.format];
    const rulesets = [doc.ruleset];

    const tags: { [tag: string]: boolean } = { hosted: true };
    tags.prize = prizeValue > 0;

    for (const format of formats) {
      const layout = getFormat(format).layout;
      if (layout === "1") tags.singles = true;
      if (layout === "2") tags.doubles = true;
    }

    tags.ps = platforms.some((p) => SHOWDOWN_PLATFORMS.includes(p));
    tags.game = platforms.some((p) => !SHOWDOWN_PLATFORMS.includes(p));

    if (skillMin <= 0 && skillMax >= 0) tags.poke = true;
    if (skillMin <= 1 && skillMax >= 1) tags.great = true;
    if (skillMin <= 2 && skillMax >= 2) tags.ultra = true;
    if (skillMin <= 3 && skillMax >= 3) tags.master = true;

    return {
      _id: doc._id.toString(),
      leagueName: doc.name,
      description: doc.description ?? "",
      serverLink: doc.discord ?? "",
      skillLevelRange: { from: String(skillMin), to: String(skillMax) },
      skillLevels,
      prizeValue,
      platforms,
      formats,
      rulesets,
      tags: Object.entries(tags)
        .filter((entry) => entry[1])
        .map((entry) => entry[0]),
      status: "Approved" as const,
      signupLink: `/leagues/${league.leagueKey}/tournaments/${doc.tournamentKey}/sign-up`,
      closesAt: doc.signUpDeadline,
      seasonStart: doc.seasonStart,
      seasonEnd: doc.seasonEnd,
      createdAt: doc.createdAt,
      hosted: true,
    };
  }
}
