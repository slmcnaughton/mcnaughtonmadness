var express        = require("express"),
    app            = express(),
    bodyParser     = require("body-parser"),
    mongoose       = require("mongoose"),
    passport       = require("passport"),
    LocalStrategy  = require("passport-local"),
    methodOverride = require("method-override"),
    flash          = require("connect-flash"),
    Campground     = require("./models/campground"),
    Comment        = require("./models/comment"),
    seedDB         = require("./seeds"),
    scrape         = require("./scrape"),
    Trophy          = require("./models/trophy"),
    TournamentStanding          = require("./models/tournamentStanding"),
    Tournament      = require("./models/tournament"),
    User           = require("./models/user"),
    schedule        = require('node-schedule'),
     moment = require('moment');
    
//requiring routes
var commentRoutes = require("./routes/comments"),
    campgroundRoutes = require("./routes/campgrounds"),
    indexRoutes       = require("./routes/index"),
    tournamentStandingsRoutes = require("./routes/tournamentStandings"),
    tournamentRoutes = require("./routes/tournaments"),
    roundRoutes = require("./routes/rounds"),
    tournamentGroupRoutes = require("./routes/tournamentGroups"),
    userTournamentRoutes = require("./routes/userTournaments"),
    userRoundRoutes = require("./routes/userRounds");
    

mongoose.connect("mongodb://localhost/mcnaughtonmadness");
// mongoose.connect(process.env.DATABASEURL);

app.use(bodyParser.urlencoded({extended: true}));
app.set("view engine", "ejs");
app.use(express.static(__dirname + "/public"));
app.use(methodOverride("_method"));
app.use(flash());
app.locals.moment = require('moment');

seedDB();


// var startTime = new moment();
// var endTime = new moment().add(5, 'h').toDate();
// // let startTime = new Date(Date.now() + 5000);
// // let endTime = new Date(startTime.getTime() + 5000);
// var j = schedule.scheduleJob({ start: startTime, end: endTime, rule: '*/10 * * * * *' }, function(){
// //   console.log('Time for tea!');
//     console.log(new moment.tz('America/New_York').format('MMMM Do YYYY, h:mm:ss a') );
//     scrape();
// });







// PASSPORT CONFIGURATION
app.use(require("express-session")({
    secret: "Rachel is the best wife ever",
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));   //comes with PLC, so we don't have to write it ourself
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use(function(req, res, next){
    res.locals.currentUser = req.user;
    res.locals.error = req.flash("error");
    res.locals.success = req.flash("success");
    res.locals.info = req.flash("info");
    next();
});

app.use("/", indexRoutes);
app.use("/campgrounds", campgroundRoutes);  //all campgroundRoutes should start with "/campgrounds"
app.use("/campgrounds/:id/comments", commentRoutes);
app.use("/tournamentStandings", tournamentStandingsRoutes);
app.use("/tournaments", tournamentRoutes);
app.use("/tournaments/:year/rounds", roundRoutes);
app.use("/tournamentGroups", tournamentGroupRoutes);
app.use("/tournamentGroups/:groupName/userTournaments", userTournamentRoutes);
app.use("/tournamentGroups/:groupName/userTournaments/:username", userRoundRoutes);


app.listen(process.env.PORT, process.env.IP, function(){
   console.log("McNaughton Madness Server has started"); 
   
    Tournament.find({year: new Date().getFullYear()}).populate("scrapes").exec(function(err, foundTournaments) {
        if(err) console.log(err);
        else {
            for (var i = 0; i < foundTournaments.length; i++) {
                // console.log("TournamentFound found: " + foundTournaments[i].year);
                for(var j = 0; j < foundTournaments[i].scrapes.length; j++) {
                    var job = {
                        start: foundTournaments[i].scrapes[j].start, 
                        end: foundTournaments[i].scrapes[j].end, 
                        rule: foundTournaments[i].scrapes[j].rule
                    };
                    // console.log(job);
                    schedule.scheduleJob(job, function() {
                        console.log(scrape());
                        // console.log("hi tea");
                    });
                }
            }
        }
    });
  
});

