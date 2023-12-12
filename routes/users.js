const express = require('express');
const router = express.Router();
const User = require("../models/usersModel");
const League = require("../models/teamModel");


router.get('/', async (req, res) => {
  try {
    const users = await User.find()
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
});

router.post('/', async (req, res) => {
  const user = new User({
    username: req.body.username
  })
  try {
    const newUser = await user.save()
    res.status(201).json(newUser)
  } catch (error) {
    res.status(400).json({message: error.message})
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
      res.json({message: 'Deleted User'})
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  });
  
router.get("/:user_id/teams", async (req,res)=>{
  try {
    const teams = await League.find({owner:res.user.id})
    res.json(teams);
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.get("/:user_id/:team_id", async (req, res) => {
  try {
    res.json(res.team)
  } catch (error) {
    req.status(500).json({message: error.message})
  }
})

router.get("/:user_id/:team_id/:opponent_id", async (req, res) => {
  try {
    res.json(res.team.get("opponents")[req.params.opponent_id])
  } catch (error) {
    req.status(500).json({message: error.message})
  }
})

router.param("user_id", async (req,res, next, user_id) => {
  let user;
  try {
    user = await User.find({ username: user_id});
    if (user == null){
      return res.status(400).json({ message: 'User id not found'})
    }
  } catch (error) {
    return res.status(500).json({message: error.message});
  }
  res.user = user[0];
  next();
});

router.param("team_id", async (req,res, next, team_id) => {
  let team;
  try {
    user = await User.find({ owner: res.user.id, leagueId: team_id});
    if (user == null){
      return res.status(400).json({ message: 'Team id not found'})
    }
  } catch (error) {
    return res.status(500).json({message: error.message});
  }
  res.team = team[0];
  next();
});


module.exports = router;