var express = require('express');
var router = express.Router();

const formats = require("../public/data/formats.js")["Formats"]

/* GET users listing. */
router.get('/', (req, res) => {
  let names = [];
  for( let f of formats){
    if("name" in f)
      names.push(f["name"])
  }
  res.send(names);
});

module.exports = router;