var express = require('express');
var router = express.Router();

/* GET users listing. */
router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});

router.post('/', (req, res) => {
  res.send("Create User");
})

router
  .route('/:id')
  .get((req, res) => {
    res.send(`Get user with ID ${req.params.id}`)
  })
  .put((req, res) => {
    res.send(`Update user with ID ${req.params.id}`)
  })
  .delete((req, res) => {
    res.send(`Delete user with ID ${req.params.id}`)
  });
  
router.param("id", (req,res,next, id) => {
  console.log(id);
  next();
});


module.exports = router;