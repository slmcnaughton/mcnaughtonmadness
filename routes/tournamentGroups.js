var express = require("express");
var router = express.Router();
var async = require("async");
var middleware = require("../middleware");
var Tournament = require("../models/tournament");
var TournamentGroup = require("../models/tournamentGroup");


//INDEX - show all Tournament Groups
router.get("/", function(req, res) {
    //get all tournaments from db
    TournamentGroup.find({}, function(err, allTournamentGroups) {
        if(err) {
            console.log(err);
        } else {
            res.render("tournamentGroups/index", {tournamentGroups: allTournamentGroups, page: "tournamentGroups"});        //rename the page when I do the navbar
        }
    });
});

// middleware.isLoggedIn, 
//NEW - show form to create new tournament Group
router.get("/new", function(req, res) {
    Tournament.find({}, function(err, allTournaments) {
        if(err) {
            console.log(err);
        } else {
            allTournaments.sort(compare);
            res.render("tournamentGroups/new", {tournaments: allTournaments, page: "tournamentGroups"});        //rename the page when I do the navbar
        }
    });
});


//CREATE -
// middleware.isLoggedIn, 
router.post("/", function(req, res) {
    Tournament.findOne({year: req.body.tournamentYear}).exec(function (err, foundTournament){
        if(err) {
            console.log(err);
            res.redirect("back");
        }
        else {
            var newTournamentGroup = {
                groupName: req.body.groupName,
                commissioner: {
                    name: "Seth"
                },
                // commissioner: {
                //     id: req.user._id,
                //     name: req.user.firstName //+ " " + req.user.lastName.substring(0,1) + "."
                // },
                tournamentReference: {
                    id: foundTournament.id,
                    year: foundTournament.year
                },
                userMatchAggregates: [],
                currentRound: 1
            };
            TournamentGroup.create(newTournamentGroup, function(err, newlyCreated) {
                if(err) console.log(err);
                else {
                    console.log(newlyCreated);
                    // console.log(newlyCreated.groupName);
                    res.redirect("/tournamentGroups/");
                    // res.redirect("/tournamentGroups/" + newlyCreated.groupName);
                }
            });
        }
  });
});



//Note: this must be below the /tournaments/new route
//SHOW - shows more information about a particular tournament
router.get("/:groupName", function(req, res){
    var groupName = req.params.groupName;
    
    // TournamentGroup.findOne({groupName: groupName}).exec(function(err, foundGroup) {
    TournamentGroup.findOne({groupName: groupName})
        .populate({path: "tournamentReference.id", populate: {path: "rounds", populate: { path: "matches",populate:{ path: "topTeam" } }}})
        .populate({path: "tournamentReference.id", populate: {path: "rounds", populate: { path: "matches", populate: { path: "bottomTeam" } }}})
        .populate({path: "tournamentReference.id", populate: "champion"})
        // .populate({path: "userTournaments", populate: "user"})
        // .populate()  userMatchAggregates & userRounds -> userMatchPredictions
        .exec(function(err, foundTournamentGroup){
        if (err || !foundTournamentGroup){
            req.flash("error", "Tournament Group not found");
            return res.redirect("/tournamentGroups");
        } else {
            // res.send(req.params.groupName);
            res.render("tournamentGroups/show", {tournamentGroup: foundTournamentGroup});
        }

    });
    
});


function compare(a,b) {
    if (a.year > b.year)
        return -1;
    else if (a.year < b.year)
        return 1;
    return 0;
}

module.exports = router;
