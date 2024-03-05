const createError = require("http-errors");
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const mongoose = require("mongoose");
const cors = require("cors");
const usersRouter = require("./routes/usersRoute");
const dataRouter = require("./routes/dataRoute");
const leagueRouter = require("./routes/leagueRoute");
const authRouter = require("./routes/authRoute");
const matchupRouter = require("./routes/matchupRoute");
const testRouter = require("./routes/testRoute");
const draftRouter = require("./routes/draftRoute");
const plannerRouter = require("./routes/plannerRoute");
const mongoSanitize = require("express-mongo-sanitize");
const { auth } = require("express-oauth2-jwt-bearer");

const options = {
  dbName: "draftzone",
  autoIndex: true,
};

mongoose.connect(
  "mongodb+srv://lumaris:bjbxmb6SuZ5WMlDA@draftzonedatabase.5nc6cbu.mongodb.net/draftzone"
);

//mongoose.connect("mongodb://lumaris:bjbxmb6SuZ5WMlDA@ac-bbyjpl3-shard-00-00.5nc6cbu.mongodb.net:27017,ac-bbyjpl3-shard-00-01.5nc6cbu.mongodb.net:27017,ac-bbyjpl3-shard-00-02.5nc6cbu.mongodb.net:27017/?ssl=true&replicaSet=atlas-b2jrjx-shard-0&authSource=admin&retryWrites=true&w=majority", options)

const db = mongoose.connection;
db.on("error", (error) => console.error(error));
db.once("open", () => console.log("Connected to Database"));

var app = express();

const jwtCheck = auth({
  audience: "https://dev-wspjxi5f6mjqsjea.us.auth0.com/api/v2/",
  issuerBaseURL: "https://dev-wspjxi5f6mjqsjea.us.auth0.com/",
  tokenSigningAlg: "RS256",
});

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

app.use(
  mongoSanitize({
    replaceWith: "_",
    onSanitize: ({ req, key }) => {
      console.warn(`This request[${key}] is sanitized`, req);
    },
  })
);

// app.use(logger("dev"));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
//update with pokemondraftzone.com

app.use(cors());

//app.use('/users', usersRouter);
//app.use('/teams', leagueRouter);
app.use("/data", dataRouter);
//app.use('/auth', authRouter);
app.use("/matchup", logger("common"), matchupRouter);
//app.use('/test', testRouter);
app.use("/planner", logger("common"), plannerRouter);
app.use("/draft", logger("common"), jwtCheck, getSub, draftRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

function getSub(req, res, next) {
  try {
    if (req.headers && req.headers.authorization) {
      let jwt = req.headers.authorization.split(" ")[1];
      req.sub = JSON.parse(atob(jwt.split(".")[1])).sub;
    }
    next();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = app;
