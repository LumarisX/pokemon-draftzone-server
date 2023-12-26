const express = require('express');
const router = express.Router();
const User = require("../models/userModel");

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


module.exports = router;