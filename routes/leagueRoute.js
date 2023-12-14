const express = require('express');
const router = express.Router();
const League = require("../models/draftModel.js");


router.get('/', async (req, res) => {
  try {
    const teams = await League.find()
    res.json(teams);
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
});

router.post('/', async (req, res) => {
  const team = new League({
    username: req.body.username
  })
  try {
    const newUser = await team.save()
    res.status(201).json(newUser)
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

router
  .route('/:id')
  .get((req, res) => {
    try {
      res.json(res.user);
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })
  .patch((req, res) => {
    res.send(`Update user with ID ${req.params.id}`)
  })
  .delete(async (req, res) => {
    try {
      await res.user.deleteOne()
      res.json({ message: 'Deleted User' })
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  });

router.param("id", async (req, res, next, id) => {
  let team;
  try {
    team = await League.findById(req.params.id);
    if (team == null) {
      return res.status(400).json({ message: 'User id not found' })
    }
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
  res.user = team;
  next();
});


module.exports = router;