import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { CoachRepository } from "@modules/coach/coach.repository";
import { LeagueRepository } from "@modules/league/league.repository";
import { LeagueDocument } from "@modules/league/league.schema";
import { StageRepository } from "@modules/stage/stage.repository";
import { StageDocument } from "@modules/stage/stage.schema";
import { TeamRepository } from "@modules/team/team.repository";
import { StaffRole } from "@modules/tournament/tournament-policy";
import {
  TierListDocument,
  TierListEntity,
} from "@modules/tier-list/tier-list.schema";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { HostedTournament, TournamentRule } from "./hosted-tournament.domain";
import {
  HostedTournamentMapper,
  TournamentTierListMeta,
} from "./hosted-tournament.mapper";
import {
  HostedTournamentDocument,
  HostedTournamentEntity,
} from "./hosted-tournament.schema";

@Injectable()
export class HostedTournamentRepository {
  constructor(
    @InjectModel(HostedTournamentEntity.name)
    private readonly hostedTournamentModel: Model<HostedTournamentDocument>,
    @InjectModel(TierListEntity.name)
    private readonly tierListModel: Model<TierListDocument>,
    private readonly stageRepo: StageRepository,
    private readonly leagueRepo: LeagueRepository,
    private readonly coachRepo: CoachRepository,
    private readonly teamRepo: TeamRepository,
  ) {}

  async findBySlug(
    leagueSlug: string,
    tournamentSlug: string,
  ): Promise<HostedTournament> {
    const league = await this.leagueRepo.findBySlug(leagueSlug);

    const doc = await this.hostedTournamentModel
      .findOne({ slug: { $eq: tournamentSlug }, league: league._id })
      .exec();
    if (!doc)
      throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, { tournamentSlug });
    const [stages, tierListMeta] = await Promise.all([
      this.resolveStages(doc.stages),
      this.resolveTierListMeta(doc.tierList),
    ]);
    return HostedTournamentMapper.fromDatabase(
      doc,
      league,
      stages,
      tierListMeta,
    );
  }

  async findRulesBySlug(
    leagueSlug: string,
    tournamentSlug: string,
  ): Promise<TournamentRule[]> {
    const league = await this.leagueRepo.findBySlug(leagueSlug);
    const doc = await this.hostedTournamentModel
      .findOne(
        { slug: { $eq: tournamentSlug }, league: league._id },
        { rules: 1 },
      )
      .lean()
      .exec();
    if (!doc)
      throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, { tournamentSlug });
    return (doc.rules ?? []).map(
      (rule) => new TournamentRule({ title: rule.title, body: rule.body }),
    );
  }

  async isArchived(
    leagueSlug: string,
    tournamentSlug: string,
  ): Promise<boolean> {
    const league = await this.leagueRepo
      .findBySlug(leagueSlug)
      .catch(() => null);
    if (!league) return false;
    const doc = await this.hostedTournamentModel
      .findOne(
        { slug: { $eq: tournamentSlug }, league: league._id },
        { archived: 1 },
      )
      .lean()
      .exec();
    return doc?.archived === true;
  }

  async findById(
    tournamentId: Types.ObjectId | string,
  ): Promise<HostedTournament> {
    const doc = await this.hostedTournamentModel.findById(tournamentId).exec();
    if (!doc)
      throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, {
        tournamentId: tournamentId.toString(),
      });
    const league = await this.leagueRepo.findById(doc.league);
    const [stages, tierListMeta] = await Promise.all([
      this.resolveStages(doc.stages),
      this.resolveTierListMeta(doc.tierList),
    ]);
    return HostedTournamentMapper.fromDatabase(
      doc,
      league,
      stages,
      tierListMeta,
    );
  }

  async findAllByLeague(league: LeagueDocument): Promise<HostedTournament[]> {
    const docs = await this.hostedTournamentModel
      .find({ league: league._id })
      .exec();
    const [metas, stagesByDoc] = await Promise.all([
      this.resolveTierListMetas(docs.map((doc) => doc.tierList)),
      this.resolveStagesFor(docs.map((doc) => doc.stages)),
    ]);
    return docs.map((doc, index) =>
      HostedTournamentMapper.fromDatabase(
        doc,
        league,
        stagesByDoc[index],
        doc.tierList ? (metas.get(doc.tierList.toString()) ?? null) : null,
      ),
    );
  }

  async findByParticipant(sub: string): Promise<HostedTournament[]> {
    const coaches = await this.coachRepo.findByAuth0Id(sub);
    if (coaches.length === 0) return [];

    const teams = await this.teamRepo.findManyByIds(
      coaches.map((coach) => coach.teamId),
    );
    const tournamentIds = [
      ...new Set(teams.map((team) => team.tournamentId.toString())),
    ];
    if (tournamentIds.length === 0) return [];

    const docs = await this.hostedTournamentModel
      .find({ _id: { $in: tournamentIds }, archived: { $ne: true } })
      .sort({ createdAt: -1 })
      .exec();

    const leagueIds = [...new Set(docs.map((doc) => doc.league.toString()))];
    const [leagues, metas, stagesByDoc] = await Promise.all([
      this.leagueRepo.findManyByIds(leagueIds),
      this.resolveTierListMetas(docs.map((doc) => doc.tierList)),
      this.resolveStagesFor(docs.map((doc) => doc.stages)),
    ]);
    const leaguesById = new Map(
      leagues.map((league) => [league._id.toString(), league]),
    );

    return docs.flatMap((doc, index) => {
      const league = leaguesById.get(doc.league.toString());
      if (!league) return [];
      return [
        HostedTournamentMapper.fromDatabase(
          doc,
          league,
          stagesByDoc[index],
          doc.tierList ? (metas.get(doc.tierList.toString()) ?? null) : null,
        ),
      ];
    });
  }

  private async resolveTierListMeta(
    tierListId: Types.ObjectId | undefined,
  ): Promise<TournamentTierListMeta> {
    if (!tierListId) return null;
    const doc = await this.tierListModel
      .findById(tierListId)
      .select("format ruleset")
      .lean()
      .exec();
    if (!doc) return null;
    return { format: doc.format, ruleset: doc.ruleset };
  }

  private async resolveTierListMetas(
    tierListIds: (Types.ObjectId | undefined)[],
  ): Promise<Map<string, TournamentTierListMeta>> {
    const ids = [
      ...new Set(
        tierListIds.flatMap((id) => (id ? [id.toString()] : [])),
      ),
    ];
    if (ids.length === 0) return new Map();
    const docs = await this.tierListModel
      .find({ _id: { $in: ids } })
      .select("format ruleset")
      .lean()
      .exec();
    return new Map(
      docs.map((doc) => [
        doc._id.toString(),
        { format: doc.format, ruleset: doc.ruleset },
      ]),
    );
  }

  private async resolveStages(stageIds: Types.ObjectId[]) {
    const [stages] = await this.resolveStagesFor([stageIds]);
    return stages;
  }

  private async resolveStagesFor(
    stageIdLists: Types.ObjectId[][],
  ): Promise<StageDocument[][]> {
    const ids = [
      ...new Set(stageIdLists.flat().map((id) => id.toString())),
    ];
    if (ids.length === 0) return stageIdLists.map(() => []);
    const stages = await this.stageRepo.findManyByIds(ids);
    const byId = new Map(stages.map((stage) => [stage._id.toString(), stage]));
    return stageIdLists.map((list) =>
      list.flatMap((id) => byId.get(id.toString()) ?? []),
    );
  }

  async updateRules(tournamentSlug: string, rules: TournamentRule[]) {
    const result = await this.hostedTournamentModel
      .findOneAndUpdate(
        { slug: tournamentSlug },
        {
          $set: {
            rules: rules.map((rule) => ({
              title: rule.title,
              body: rule.body,
            })),
          },
        },
      )
      .exec();
    if (!result)
      throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, { tournamentSlug });
  }

  async addStaff(
    tournamentId: Types.ObjectId | string,
    member: { sub: string; name: string; role: StaffRole },
  ) {
    await this.hostedTournamentModel
      .updateOne(
        { _id: tournamentId, "staff.sub": { $ne: member.sub } },
        { $push: { staff: member } },
      )
      .exec();
  }

  async setStaffName(
    tournamentId: Types.ObjectId | string,
    sub: string,
    name: string,
  ) {
    await this.hostedTournamentModel
      .updateOne(
        { _id: tournamentId, "staff.sub": sub },
        { $set: { "staff.$.name": name } },
      )
      .exec();
  }

  async setOwnerName(
    tournamentId: Types.ObjectId | string,
    sub: string,
    name: string,
  ) {
    await this.hostedTournamentModel
      .updateOne({ _id: tournamentId }, { $set: { ownerName: { sub, name } } })
      .exec();
  }

  async removeStaff(tournamentId: Types.ObjectId | string, sub: string) {
    await this.hostedTournamentModel
      .updateOne({ _id: tournamentId }, { $pull: { staff: { sub } } })
      .exec();
  }

  async updateSettings(
    tournamentId: Types.ObjectId | string,
    update: Partial<{
      tierList: Types.ObjectId;
      draftCount: { min: number; max: number };
      pointTotal: number | null;
      tierRequirements: { tierId: string; required: number }[];
      logo: string | null;
      signUpToken: string;
      signUpTokenRotatedAt: Date;
    }>,
  ): Promise<void> {
    const setFields: Record<string, unknown> = {};
    const unsetFields: Record<string, ""> = {};
    for (const [key, value] of Object.entries(update)) {
      if (value === null) unsetFields[key] = "";
      else if (value !== undefined) setFields[key] = value;
    }

    const mongoUpdate: Record<string, unknown> = {};
    if (Object.keys(setFields).length) mongoUpdate["$set"] = setFields;
    if (Object.keys(unsetFields).length) mongoUpdate["$unset"] = unsetFields;

    const result = await this.hostedTournamentModel
      .findByIdAndUpdate(tournamentId, mongoUpdate)
      .exec();
    if (!result)
      throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, {
        tournamentId: tournamentId.toString(),
      });
  }

  async setSchedule(
    tournamentId: Types.ObjectId | string,
    schedule: {
      rounds: {
        _id: Types.ObjectId;
        name: string;
        matchDeadline?: Date;
        tradeDeadline?: Date;
      }[];
      stages: Types.ObjectId[];
      currentRoundIndex: number;
      tradesVersion?: number;
    },
  ): Promise<void> {
    const guarded = schedule.tradesVersion !== undefined;
    const result = await this.hostedTournamentModel
      .findOneAndUpdate(
        guarded
          ? this.atTradesVersion(tournamentId, schedule.tradesVersion!)
          : { _id: new Types.ObjectId(tournamentId.toString()) },
        {
          $set: {
            rounds: schedule.rounds,
            stages: schedule.stages,
            currentRoundIndex: schedule.currentRoundIndex,
          },
          ...(guarded ? { $inc: { tradesVersion: 1 } } : {}),
        },
      )
      .exec();
    if (!result)
      throw guarded
        ? new PDZError(ErrorCodes.STAGE.TRADES_CHANGED)
        : new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, {
            tournamentId: tournamentId.toString(),
          });
  }

  async setDiscordLinkCode(
    tournamentId: Types.ObjectId | string,
    code: { hash: string; expiresAt: Date; createdBy: string },
  ): Promise<void> {
    await this.hostedTournamentModel
      .updateOne({ _id: tournamentId }, { $set: { discordLinkCode: code } })
      .exec();
  }

  async consumeDiscordLinkCode(
    hash: string,
    link: { guildId: string; guildName: string; linkedBy: string },
  ): Promise<{
    tournamentId: string;
    tournamentName: string;
    previousGuildId?: string;
  } | null> {
    const now = new Date();
    const previous = await this.hostedTournamentModel
      .findOneAndUpdate(
        {
          "discordLinkCode.hash": { $eq: hash },
          "discordLinkCode.expiresAt": { $gt: now },
        },
        {
          $set: {
            "discordSettings.guildId": link.guildId,
            "discordSettings.guildName": link.guildName,
            "discordSettings.linkedBy": link.linkedBy,
            "discordSettings.linkedAt": now,
          },
          $unset: { discordLinkCode: "" },
        },
      )
      .select("name discordSettings.guildId")
      .lean()
      .exec();
    if (!previous) return null;
    return {
      tournamentId: previous._id.toString(),
      tournamentName: previous.name,
      previousGuildId: previous.discordSettings?.guildId,
    };
  }

  async clearDiscordTargets(tournamentId: Types.ObjectId | string) {
    await this.hostedTournamentModel
      .updateOne(
        { _id: tournamentId },
        {
          $unset: {
            "discordSettings.coachRoleId": "",
            "discordSettings.signUpChannelId": "",
          },
        },
      )
      .exec();
  }

  async unlinkDiscord(tournamentId: Types.ObjectId | string) {
    await this.hostedTournamentModel
      .updateOne(
        { _id: tournamentId },
        {
          $unset: {
            "discordSettings.guildId": "",
            "discordSettings.guildName": "",
            "discordSettings.linkedAt": "",
            "discordSettings.linkedBy": "",
            "discordSettings.coachRoleId": "",
            "discordSettings.signUpChannelId": "",
            discordLinkCode: "",
          },
        },
      )
      .exec();
  }

  async pushTrade(
    tournamentId: Types.ObjectId | string,
    tradesVersion: number,
    trade: object,
  ): Promise<boolean> {
    const result = await this.hostedTournamentModel
      .updateOne(this.atTradesVersion(tournamentId, tradesVersion), {
        $push: { trades: trade },
        $inc: { tradesVersion: 1 },
      })
      .exec();
    return result.modifiedCount === 1;
  }

  async resolvePendingTrade(
    tournamentId: Types.ObjectId | string,
    tradesVersion: number,
    tradeId: Types.ObjectId,
    patch: {
      status: "PENDING" | "APPROVED" | "REJECTED";
      activeRoundId: Types.ObjectId;
      resolvedBy?: string;
    },
  ): Promise<boolean> {
    const set: Record<string, unknown> = {
      "trades.$.status": patch.status,
      "trades.$.activeRoundId": patch.activeRoundId,
    };
    if (patch.resolvedBy !== undefined)
      set["trades.$.resolvedBy"] = patch.resolvedBy;

    const result = await this.hostedTournamentModel
      .updateOne(
        {
          ...this.atTradesVersion(tournamentId, tradesVersion),
          trades: { $elemMatch: { _id: tradeId, status: "PENDING" } },
        },
        {
          $set: set,
          $unset: { "trades.$.activeRound": "" },
          $inc: { tradesVersion: 1 },
        },
      )
      .exec();
    return result.modifiedCount === 1;
  }

  async pullPendingTrade(
    tournamentId: Types.ObjectId | string,
    tradesVersion: number,
    tradeId: Types.ObjectId,
  ): Promise<boolean> {
    const result = await this.hostedTournamentModel
      .updateOne(
        {
          ...this.atTradesVersion(tournamentId, tradesVersion),
          trades: { $elemMatch: { _id: tradeId, status: "PENDING" } },
        },
        {
          $pull: { trades: { _id: tradeId } },
          $inc: { tradesVersion: 1 },
        },
      )
      .exec();
    return result.modifiedCount === 1;
  }

  async bumpRosterVersion(tournamentId: Types.ObjectId | string): Promise<void> {
    await this.hostedTournamentModel
      .updateOne(
        { _id: new Types.ObjectId(tournamentId.toString()) },
        { $inc: { rosterVersion: 1 } },
      )
      .exec();
  }

  private atTradesVersion(
    tournamentId: Types.ObjectId | string,
    tradesVersion: number,
  ) {
    return {
      _id: new Types.ObjectId(tournamentId.toString()),
      tradesVersion: tradesVersion === 0 ? { $in: [0, null] } : tradesVersion,
    };
  }
}
