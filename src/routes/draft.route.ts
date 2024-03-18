import express, { Request, Response, NextFunction } from "express";
import { DraftModel } from "../models/draft.model";
import { Draft } from "../classes/draft";

export const router = express.Router();

router
  .route("/teams")
  .get(async (req: Request, res: Response) => {
    try {
      res.json(
        await DraftModel.find({ owner: req.sub }).sort({ createdAt: -1 })
      );
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
  .post(async (req: Request, res: Response) => {
    try {
      new Draft(req.body, req.sub)
        .then((draft) => {
          DraftModel.find({ owner: req.sub, leagueId: draft.leagueId }).then(
            (foundDrafts) => {
              if (foundDrafts.length > 0) {
                res.status(400).json({ message: "Draft ID already exists" });
              } else {
                draft
                  .save()
                  .then(() => {
                    res.status(201).json({ message: "Draft Added" });
                  })
                  .catch((error) => {
                    console.error("Error saving draft:", error);
                    res.status(500).json({ message: "Internal Server Error" });
                  });
              }
            }
          );
        })
        .catch((error) => {
          res.status(400).json({ message: error.message });
        });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

router
  .route("/:team_id")
  .get(async (req: Request, res: Response) => {
    try {
      res.draft.score = await DraftService.getScore(res.draft._id);
      res.json(res.draft);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
  .patch(async (req: Request, res: Response) => {
    try {
      let team_id = req.params.team_id;
      new Draft(req.body, req.sub)
        .then((draft) => {
          DraftModel.findOneAndUpdate(
            { owner: req.sub, leagueId: team_id },
            {
              teamName: draft.teamName,
              leagueName: draft.leagueName,
              team: draft.team,
              format: draft.format,
              ruleset: draft.ruleset,
            },
            { new: true, upsert: true }
          )
            .then((updatedDraft) => {
              if (updatedDraft) {
                res
                  .status(200)
                  .json({ message: "Draft Updated", draft: updatedDraft });
              } else {
                res.status(404).json({ message: "Draft not found" });
              }
            })
            .catch((error) => {
              console.error("Error updating draft:", error);
              res.status(500).json({ message: "Internal Server Error" });
            });
        })
        .catch((error) => {
          res.status(400).json({ message: error.message });
        });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
  .delete((req: Request, res: Response) => {
    try {
      res.rawDraft
        .deleteOne()
        .then(() => {
          res.status(201).json({ message: "Archive added" });
        })
        .catch((error) => {
          console.error("Error deleteing draft:", error);
          res.status(500).json({ message: error.message });
        });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

router
  .route("/:team_id/matchups")
  .get(async (req: Request, res: Response) => {
    try {
      res.json(
        await MatchupModel.find({ "aTeam._id": res.draft._id }).sort({
          createdAt: -1,
        })
      );
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
  .post(async (req: Request, res: Response) => {
    try {
      new Matchup(req.body, res.draft._id)
        .then((matchup) => {
          matchup
            .save()
            .then(() => {
              res.status(201).json({ message: "Matchup Added" });
            })
            .catch((error) => {
              console.error("Error saving draft:", error);
              res.status(500).json({ message: "Internal Server Error" });
            });
        })
        .catch((error) => {
          res.status(400).json({ message: error.message });
        });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

router.route("/:team_id/stats").get(async (req: Request, res: Response) => {
  try {
    res.json(await DraftService.getStats(res.draft._id));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router
  .route("/:team_id/archive")
  .delete(async (req: Request, res: Response) => {
    try {
      new Archive(res.draft)
        .then((archive) => {
          archive
            .save()
            .then(() => {
              res.rawDraft
                .deleteOne()
                .then(() => {
                  res.status(201).json({ message: "Archive added" });
                })
                .catch((error) => {
                  console.error("Error saving archive:", error);
                  res.status(500).json({ message: error.message });
                });
            })
            .catch((error) => {
              console.error("Error saving archive:", error);
              res.status(500).json({ message: error.message });
            });
        })
        .catch((error) => {
          console.log(error);

          res.status(400).json({ message: error.message });
        });
    } catch (error) {
      console.log(error);

      res.status(500).json({ message: error.message });
    }
  });

router
  .route("/:team_id/:matchup_id")
  .get(async (req: Request, res: Response) => {
    try {
      res.json(res.matchup);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
  .patch((req: Request, res: Response) => {
    try {
      new Matchup(req.body, res.draft._id)
        .then((matchup) => {
          MatchupModel.findByIdAndUpdate(
            req.params.matchup_id,
            {
              teamName: matchup.teamName,
              stage: matchup.stage,
              "bTeam.team": matchup.bTeam.team,
            },
            { new: true, upsert: true }
          )
            .then((updatedMatchup) => {
              if (updatedMatchup) {
                res
                  .status(200)
                  .json({ message: "Matchup Updated", draft: updatedMatchup });
              } else {
                res.status(404).json({ message: "Matchup not found" });
              }
            })
            .catch((error) => {
              console.error("Error updating matchup:", error);
              res.status(500).json({ message: "Internal Server Error" });
            });
        })
        .catch((error) => {
          res.status(400).json({ message: error.message });
        });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

router
  .route("/:team_id/:matchup_id/score")
  .patch((req: Request, res: Response) => {
    try {
      new Score(req.body)
        .then((score) => {
          MatchupModel.findByIdAndUpdate(
            req.params.matchup_id,
            {
              "aTeam.stats": score.aTeam.stats,
              "bTeam.stats": score.bTeam.stats,
              "aTeam.paste": score.aTeam.paste,
              "bTeam.paste": score.bTeam.paste,
              "aTeam.score": score.aTeam.score,
              "bTeam.score": score.bTeam.score,
              replay: score.replay,
            },
            { new: true, upsert: true }
          )
            .then((updatedMatchup) => {
              if (updatedMatchup) {
                res
                  .status(200)
                  .json({ message: "Matchup Updated", draft: updatedMatchup });
              } else {
                res.status(404).json({ message: "Matchup not found" });
              }
            })
            .catch((error) => {
              console.error("Error updating matchup:", error);
              res.status(500).json({ message: "Internal Server Error" });
            });
        })
        .catch((error) => {
          res.status(400).json({ message: error.message });
        });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

router.param("team_id", async (req: Request, res, next, team_id) => {
  try {
    let user_id = await req.sub;
    if (ObjectId.isValid(team_id)) {
      res.rawDraft = await DraftModel.findById(team_id);
    } else {
      let drafts = await DraftModel.find({ owner: user_id, leagueId: team_id });
      res.rawDraft = drafts[0];
    }
    if (res.rawDraft == null) {
      return res.status(400).json({ message: "Team id not found" });
    }
    res.draft = res.rawDraft.toObject();
    for (let pokemon of res.draft.team) {
      pokemon.name = PokedexService.getName(pokemon.pid);
    }
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
  next();
});

router.param("matchup_id", async (req: Request, res, next, matchup_id) => {
  let matchup;
  try {
    if (matchup_id == null) {
      return res.status(400).json({ message: "Team id not found" });
    }
    matchup = await MatchupModel.findById(matchup_id).lean();
    data = await DraftModel.findById(matchup.aTeam._id);
    matchup.aTeam.teamName = data.teamName;
    matchup.aTeam.team = data.team;
    res.matchup = matchup;
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
  next();
});
