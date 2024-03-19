var express = require("express"),
  app = express(),
  bodyParser = require("body-parser"),
  mongoose = require("mongoose"),
  passport = require("passport"),
  LocalStrategy = require("passport-local"),
  methodOverride = require("method-override"),
  flash = require("connect-flash"),
  Comment = require("./models/comment"),
  seedDB = require("./seeds"),
  emailHelper = require("./middleware/emailHelper"),
  scrape = require("./scrape"),
  scrapeTeams = require("./scrapeTeams"),
  Trophy = require("./models/trophy"),
  TeamImage = require("./models/teamImage"),
  TournamentStanding = require("./models/tournamentStanding"),
  Tournament = require("./models/tournament"),
  TournamentGroup = require("./models/tournamentGroup"),
  Match = require("./models/match"),
  User = require("./models/user"),
  async = require("async"),
  UserMatchPrediction = require("./models/userMatchPrediction"),
  schedule = require("node-schedule"),
  moment = require("moment-timezone");

require("dotenv").config();
mongoose.set("useCreateIndex", true);

//requiring routes
var commentRoutes = require("./routes/comments"),
  indexRoutes = require("./routes/index"),
  tournamentStandingsRoutes = require("./routes/tournamentStandings"),
  tournamentRoutes = require("./routes/tournaments"),
  roundRoutes = require("./routes/rounds"),
  tournamentGroupRoutes = require("./routes/tournamentGroups"),
  userTournamentRoutes = require("./routes/userTournaments"),
  userRoundRoutes = require("./routes/userRounds");

mongoose.connect(process.env.DATABASE_URL_PROD, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.use(express.static(__dirname + "/public"));
app.use(methodOverride("_method"));
app.locals.moment = require("moment-timezone");

// seedDB();
// scrape();

// scrapeTeams();

// PASSPORT CONFIGURATION
app.use(
  require("express-session")({
    secret: "Rachel is the best wife ever",
    resave: false,
    saveUninitialized: false,
  }),
);
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate())); //comes with PLC, so we don't have to write it ourself
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use(flash());
app.use(function (req, res, next) {
  res.locals.currentUser = req.user;
  res.locals.error = req.flash("error");
  res.locals.success = req.flash("success");
  res.locals.info = req.flash("info");
  next();
});

app.use("/", indexRoutes);
app.use("/tournamentGroups/:groupName/comments", commentRoutes);
app.use("/tournamentStandings", tournamentStandingsRoutes);
app.use("/tournaments", tournamentRoutes);
app.use("/tournaments/:year/rounds", roundRoutes);
app.use("/tournamentGroups", tournamentGroupRoutes);
app.use("/tournamentGroups/:groupName/userTournaments", userTournamentRoutes);
app.use(
  "/tournamentGroups/:groupName/userTournaments/:username",
  userRoundRoutes,
);

app.listen(process.env.PORT, process.env.IP, function () {
  console.log(
    "McNaughton Madness Server has started on port " + process.env.PORT,
  );

  Tournament.findOne({ year: new Date().getFullYear() })
    .populate("scrapes")
    .populate("emailPickReminderJobs")
    .exec(function (err, foundTournament) {
      if (err) console.log(err);
      else {
        if (foundTournament) {
          if (foundTournament.scrapes) {
            for (var j = 0; j < foundTournament.scrapes.length; j++) {
              var job = {
                start: foundTournament.scrapes[j].start,
                end: foundTournament.scrapes[j].end,
                rule: foundTournament.scrapes[j].rule,
              };
              schedule.scheduleJob(job, function () {
                scrape();
              });
            }
          }
          if (foundTournament.emailPickReminderJobs) {
            for (
              var i = 0;
              i < foundTournament.emailPickReminderJobs.length;
              i++
            ) {
              var date = foundTournament.emailPickReminderJobs[i].date;
              schedule.scheduleJob(date, function () {
                emailHelper.sendPickReminderEmail();
              });
            }
          }
        } else {
          console.log("No tournament has been created for this year.");
        }
      }
    });
});
