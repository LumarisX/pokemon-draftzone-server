const express = require('express');
const router = express.Router();
const User = require("../models/usersModel");
const Draft = require("../models/draftModel");


router
  .route('/')
  .get(async (req, res) => {
    try {
      const users = await User.find()
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })
  .post(async (req, res) => {
    const user = new User({
      username: req.body.username
    })
    try {
      const newUser = await user.save()
      res.status(201).json(newUser)
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
  .patch((req, res) => {
    res.send(`Update user with ID ${req.params.user_id}`)
  })
  .delete(async (req, res) => {
    try {
      await res.user.deleteOne()
      res.json({ message: 'Deleted User' })
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  });

router.route("/:user_id/teams")
.get(async (req, res) => {
  try {
    res.json(await Draft.find({ owner: res.user.id }));
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})
.post(async (req, res) => {
  try {
    let content = req.body;
    console.log(content)
    if(!content){
      return res.status(400).json({ message: error.message })
    }
    res.status(201).json({ message: "Draft Created" })
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
    let content = req.body;
    console.log(content)
    if(!content){
      return res.status(400).json({ message: error.message })
    }
    res.status(201).json({ message: "Opponent Added" })
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
    user = await User.find({ username: user_id });
    if (user == null) {
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
    team = await Draft.find({ owner: user_id, leagueId: team_id });
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