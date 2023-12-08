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
      res.json({message: 'Deleted User'})
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  });
  
router.get("/:id/teams", async (req,res)=>{
  try {
    const teams = await League.find({owner:req.params.id})
    res.json(teams);
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.param("id", async (req,res, next, id) => {
  let user;
  try {
    user = await User.findById(req.params.id);
    if (user == null){
      return res.status(400).json({ message: 'User id not found'})
    }
  } catch (error) {
    return res.status(500).json({message: error.message});
  }
  res.user = user;
  next();
});


module.exports = router;