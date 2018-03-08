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
            res.render("tournamentGroups/index", {tournamentGroups: allTournamentGroups, page: "tournamentGroups"});
        }
    });
});

//NEW - show form to create new tournament Group
router.get("/new", middleware.isLoggedIn, function(req, res) {
    Tournament.find({}, function(err, allTournaments) {
        if(err) {
            console.log(err);
        } else {
            allTournaments.sort(compare);
            res.render("tournamentGroups/new", {tournaments: allTournaments, page: "tournamentGroups"});
        }
    });
});


//CREATE -
router.post("/", middleware.isLoggedIn, function(req, res) {
    Tournament.findOne({year: req.body.tournamentYear}).exec(function (err, foundTournament){
        if(err) {
            console.log(err);
            res.redirect("back");
        }
        else {
            var newTournamentGroup = {
                groupName: req.body.groupName,
                // commissioner: {
                //     name: "Seth"
                // },
                commissioner: {
                    id: req.user._id,
                    name: req.user.firstName //+ " " + req.user.lastName.substring(0,1) + "."
                },
                tournamentReference: {
                    id: foundTournament.id,
                    year: foundTournament.year
                },
                userMatchAggregates: [],
                currentRound: 1
            };
            TournamentGroup.create(newTournamentGroup, function(err, newlyCreated) {
                if(err) {
                    if (err.code === 11000) {
                        req.flash("error", "Group name already exists!");
                        return res.redirect("back");
                      }
                    else {
                        req.flash("error", "Error creating tournament group.");
                        return res.redirect("back");
                    }
                }
                else {
                    res.redirect("/tournamentGroups/" + newlyCreated.groupName);
                }
            });
        }
  });
});



//Note: this must be below the /tournaments/new route
//SHOW - shows more information about a particular tournament Group
router.get("/:groupName", function(req, res){
    var groupName = req.params.groupName;
    TournamentGroup.findOne({groupName: groupName})
        .populate({path: "userTournaments", populate: "user"})
        .exec(function(err, foundTournamentGroup){
        if (err || !foundTournamentGroup){
            req.flash("error", "Tournament Group not found");
            return res.redirect("/tournamentGroups");
        } else {
            res.render("tournamentGroups/show", {tournamentGroup: foundTournamentGroup, page: "tournamentGroups"});
        }
    });
});

//Note: this must be below the /tournaments/new route
//SHOW - shows more information about a particular tournament roup
router.get("/:groupName/bracket", function(req, res){
    var groupName = req.params.groupName;
    TournamentGroup.findOne({groupName: groupName})
        .populate({path: "tournamentReference.id", populate: {path: "champion"}})
        .populate({path: "tournamentReference.id", populate: {path: "rounds", populate: {path: "matches", populate: { path: "topTeam"} } }})
        .populate({path: "tournamentReference.id", populate: {path: "rounds", populate: {path: "matches", populate: { path: "bottomTeam"} } }})
        .populate({path: "userMatchAggregates", populate: "topTeamPickers"})
        .populate({path: "userTournaments", populate: "user"})
        .exec(function(err, foundTournamentGroup){
        if (err || !foundTournamentGroup){
            req.flash("error", "Tournament Group not found");
            return res.redirect("/tournamentGroups");
        } else {
            res.render("tournamentGroups/showBracket", {tournamentGroup: foundTournamentGroup, page: "tournamentGroups"});
        }
    });
});


//Note: this must be below the /tournaments/new route
//SHOW - shows more information about a particular tournament
router.get("/:year", function(req, res){
    var year = req.params.year;
    Tournament.findOne({year: year})
        .populate({path: "rounds", populate: { path: "matches",populate:{ path: "topTeam" } }})
        .populate({path: "rounds", populate: { path: "matches", populate: { path: "bottomTeam" } }})
        .populate("champion")
        .exec(function(err, foundTournament){
         if (err || !foundTournament){
            req.flash("error", "Tournament not found");
            return res.redirect("/tournaments");
        } else {
            res.render("tournaments/show", {tournament: foundTournament});
        }
    });
});

//EDIT Tournament Route
router.get("/:id/edit", middleware.checkTournamentGroupOwnership, function(req, res){
    Campground.findById(req.params.id, function(err, foundCampground){
        res.render("campgrounds/edit", {campground: foundCampground});
    });
});

// UPDATE Tournament Route
router.put("/:id", middleware.checkTournamentGroupOwnership, function(req, res) {
   //find and update the correct campground
   // Campground.findByIdAndUpdate(id, newData, callback)
   Campground.findByIdAndUpdate(req.params.id, req.body.campground, function(err, updatedCampground){
       if(err){
           res.redirect("/campgrounds");
       } else {
            res.redirect("/campgrounds/" + req.params.id);     
       }
   });
});

//DESTROY Tournament Route
router.delete("/:id", middleware.checkTournamentGroupOwnership, function(req, res){
   Campground.findByIdAndRemove(req.params.id, function(err){
      if(err){
          res.redirect("/campgrounds");
      } else {
          req.flash("success", "Campground deleted");
          res.redirect("/campgrounds");
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
