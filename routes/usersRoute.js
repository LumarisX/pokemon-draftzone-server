const express = require('express');
const router = express.Router();
const UserModel = require("../models/userModel");
const RoleModel = require("../models/roleModel")
const DraftModel = require("../models/draftModel");
const Opponent = require("../classes/opponent")
const Draft = require("../classes/draft")


router
  .route('/')
  .get(async (req, res) => {
    try {
      const users = await UserModel.find()
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })
  .post(async (req, res) => {
    try {
      if (req.body && req.body !== '') {
        const newUser = new UserModel(req.body)
        console.log(req.body)
        await newUser.save()
        return res.status(201).json({ message: "User created" })
      } else {
        return res.status(400).json({ message: error.message })
      }

    } catch (error) {
      res.status(400).json({ message: error.message })
    }
  })

router
  .route('/test')
  .get(async (req, res) => {
    try {
      const users = await UserModel.find()
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })
  .post(async (req, res) => {
    try {
      if (req.body.role && req.body.role !== '') {
        console.log(req.body, "here")
        const newRole = new RoleModel(req.body);
        await newRole.save()
        return res.send({ message: "Role Created!" })
      } else {
        return res.status(400).send({ message: "Bad request" })
      }
    } catch (error) {
      res.status(400).json({ message: error.message })
    }
  })

router
  .route('/:user_id')
  .get((req, res) => {
    try {
      res.json(res.user);
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })
  .patch(async (req, res) => {
    try {
      await UserModel.findByIdAndUpdate(req.params.user_id, req.body)
      res.send(`Update user with ID ${req.params.user_id}`)
    } catch (error) {
      res.status(400).json({ message: error.message })
    }
  })
  .delete(async (req, res) => {
    try {
      await UserModel.findByIdAndDelete(req.params.user_id)
      res.json({ message: 'Deleted User' })
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  });

router.route("/:user_id/teams")
  .get(async (req, res) => {
    try {
      res.json(await DraftModel.find({ owner: res.user.id }));
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })
  .post(async (req, res) => {
    try {
      let draft = new Draft(req.body, res.user._id)
      if (draft.valid) {
        await draft.model.save()
        res.status(201).json({ message: "Draft Added" })
      } else {
        return res.status(400).json({ message: draft.errors })
      }
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })

router.route("/:user_id/:team_id")
  .get(async (req, res) => {
    try {
      res.json(res.team)
    } catch (error) {
      req.status(500).json({ message: error.message })
    }
  })
  .post(async (req, res) => {
    try {
      let opponent = new Opponent(req.body)
      if (opponent.valid) {
        console.log(opponent.data)
        res.team.opponents.push(opponent.data)
        await res.team.save()
        res.status(201).json({ message: "Opponent Added" })
      } else {
        return res.status(400).json({ message: opponent.errors })
      }
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })

router.get("/:user_id/:team_id/:opponent_id", async (req, res) => {
  try {
    res.json(res.team.get("opponents")[req.params.opponent_id])
  } catch (error) {
    req.status(500).json({ message: error.message })
  }
})

router.param("user_id", async (req, res, next, user_id) => {
  let user;
  try {
    user = await UserModel.find({ username: user_id });
    if (user.length === 0) {
      return res.status(400).json({ message: 'User id not found' })
    }
    res.user = user[0];
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
  next();
});

router.param("team_id", async (req, res, next, team_id) => {
  let team;
  try {
    let user_id = await res.user.id;
    team = await DraftModel.find({ owner: user_id, leagueId: team_id });
    if (team == null) {
      return res.status(400).json({ message: 'Team id not found' })
    }
    res.team = team[0];
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
  next();
});


module.exports = router;