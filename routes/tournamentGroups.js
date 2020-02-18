var express = require("express");
var router = express.Router();
var async = require("async");
var middleware = require("../middleware");
var Tournament = require("../models/tournament");
var TournamentGroup = require("../models/tournamentGroup");
var UserTournament = require("../models/userTournament");
var emailHelper = require("../middleware/emailHelper");

//SendRoundSummaryTest
router.post("/:groupName/testRoundSummary", function(req, res) {
   var groupName = req.params.groupName;
    TournamentGroup.findOne({groupName: groupName})
        .populate({path: "userTournaments", populate: "user"})
        .populate({path: "userTournaments", populate: {path: "userRounds", populate: "round"}})
        .exec(function(err, foundTournamentGroup){
        if(err){
            console.log(err);
            res.redirect("/tournamentGroups");
        } else {
            emailHelper.sendRoundSummary(foundTournamentGroup);
            res.redirect('back');
        }
    });
});

router.post("/:groupName/testPickReminder", function(req, res) {
   var groupName = req.params.groupName;
    TournamentGroup.findOne({groupName: groupName})
        .populate({path: "userTournaments", populate: "user"})
        .populate({path: "userTournaments", populate: {path: "userRounds", populate: "round"}})
        .exec(function(err, foundTournamentGroup){
        if(err){
            console.log(err);
            res.redirect("/tournamentGroups");
        } else {
            emailHelper.sendPickReminderEmail();
            res.redirect('back');
        }
    });
});


//INDEX - show all current Tournament Groups 
router.get("/", function(req, res) {
    //get all tournaments from db
    TournamentGroup.find({year: new Date().getFullYear()}, function(err, allTournamentGroups) {
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
    Tournament.findOne({year: new Date().getFullYear()})
        .exec(function (err, foundTournament){
        if(err) {
            console.log(err);
            res.redirect("back");
        }
        else {
            var newTournamentGroup = {
                year: new Date().getFullYear(),
                groupName: req.body.groupName,
                commissioner: {
                    id: req.user._id,
                    name: req.user.firstName
                },
                groupMotto: req.body.groupMotto,
                secretCode: req.body.secretCode,
                publicGroup: req.body.groupType,
                tournamentReference: {
                    id: foundTournament.id,
                    year: foundTournament.year
                },
                userMatchAggregates: [],
                bonusAggregates: [],
                currentRound: 1,
                comments: [],
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
        .populate({path: "userTournaments", populate: {path: "userRounds", populate: "round"}})
        .populate("comments")
        .populate({path: "tournamentReference.id", populate: {path: "rounds"}})
        .exec(function(err, foundTournamentGroup){
        if (err || !foundTournamentGroup){
            req.flash("error", "Tournament Group not found");
            return res.redirect("/tournamentGroups");
        } else {
            var isInGroup = false;
            // var whichIndexMatches = -1;
            var picksNeeded = true;
            async.series([
                
                function(callback) {
                    if(res.locals.currentUser) {
                        async.forEachSeries(res.locals.currentUser.tournamentGroups, function(tournamentGroup, next) {
                            if(tournamentGroup.id.equals(foundTournamentGroup._id)){
                                isInGroup = true;
                                UserTournament.findOne({"user.id" : res.locals.currentUser._id, "tournamentGroup.groupName": foundTournamentGroup.groupName})
                                    .populate({path: "userRounds", populate: {path: "round.id"}})
                                    .exec(function(err, foundUserTournament) {
                                        if(err) console.log(err);
                                        else if(!foundUserTournament) {
                                            next();
                                        } else {
                                            async.forEachSeries(foundUserTournament.userRounds, function(userRound, next) {
                                                if (userRound.round.numRound === foundTournamentGroup.currentRound ) {
                                                    picksNeeded = false;
                                                    next();
                                                } else {
                                                    next();
                                                }
                                            }, function(err) {
                                                if(err) console.log(err);
                                                else callback();
                                            });
                                        }
                                    });
                                
                            } else {
                                next();
                            }
                            
                        }, function(err) {
                            if(err) console.log(err);
                            callback();
                        });
                       
                    } else {
                        callback();
                    }
                }
            ], function(err) {
                if (err) console.log(err);
                else {
                    foundTournamentGroup.userTournaments.sort(compareUserTournaments);
                    res.render("tournamentGroups/show", {tournamentGroup: foundTournamentGroup, isInGroup: isInGroup, picksNeeded : picksNeeded, page: "tournamentGroups"});
                }
            });
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
        .populate({path: "bonusAggregates", populate: "teamPickers"})
        .populate({path: "bonusAggregates", populate: {path: "team.id", populate: "seed"} })
        .populate({path: "userTournaments", populate: "user"})
        .exec(function(err, foundTournamentGroup){
        if (err || !foundTournamentGroup){
            req.flash("error", "Tournament Group not found");
            return res.redirect("/tournamentGroups");
        } else {
            foundTournamentGroup.bonusAggregates.sort(compareBonusAggregates);
            
            if(foundTournamentGroup.bonusAggregates.length > 0) {
 
                var bonusAggregates = [ [], [], [], [], [] ];
                
                for (var i = 0; i < foundTournamentGroup.bonusAggregates.length; i++) {
                    var agg = foundTournamentGroup.bonusAggregates[i];
                    if (agg.matchNumber !== 63 )
                        bonusAggregates[agg.matchNumber - 57].push(agg);
                    else
                        bonusAggregates[4].push(agg);
                }
            }

            res.render("tournamentGroups/showBracket", {
                tournamentGroup: foundTournamentGroup, 
                bonAgg : bonusAggregates,
                page: "tournamentGroups"});
        }
    });
});

//Note: this must be below the /tournaments/new route
//SHOW - shows more information about a particular tournament Group
router.get("/:groupName/messageboard", function(req, res){
    var groupName = req.params.groupName;
    TournamentGroup.findOne({groupName: groupName})
        .populate({path: "userTournaments", populate: "user"})
        .populate({path: "userTournaments", populate: {path: "userRounds", populate: "round"}})
        .populate("comments")
        .populate({path: "tournamentReference.id", populate: {path: "rounds"}})
        .exec(function(err, foundTournamentGroup){
        if (err || !foundTournamentGroup){
            req.flash("error", "Tournament Group not found");
            return res.redirect("/tournamentGroups");
        } else {
            foundTournamentGroup.userTournaments.sort(compareUserTournaments);
            res.render("tournamentGroups/messageboard", {tournamentGroup: foundTournamentGroup, page: "tournamentGroups"});
        }
    });
});


router.get("/:groupName/emailaddresslist", function(req, res){
    var groupName = req.params.groupName;
    TournamentGroup.findOne({groupName: groupName})
        .populate({path: "userTournaments", populate: {path: "user.id"}})
        .exec(function(err, foundTournamentGroup){
        if (err || !foundTournamentGroup){
            req.flash("error", "Tournament Group not found");
            return res.redirect("/tournamentGroups");
        } else {
            foundTournamentGroup.userTournaments.forEach(function(userTournament){
                console.log(userTournament.user.id.email);
            });
            req.flash("error", "Page Not Found");
            return res.redirect("back");
        }
    }
    )}
);


// //Note: this must be below the /tournaments/new route
// //SHOW - shows more information about a particular tournament
// router.get("/:year", function(req, res){
//     var year = req.params.year;
//     Tournament.findOne({year: year})
//         .populate({path: "rounds", populate: { path: "matches",populate:{ path: "topTeam" } }})
//         .populate({path: "rounds", populate: { path: "matches", populate: { path: "bottomTeam" } }})
//         .populate("champion")
//         .exec(function(err, foundTournament){
//          if (err || !foundTournament){
//             req.flash("error", "Tournament not found");
//             return res.redirect("/tournaments");
//         } else {
//             res.render("tournaments/show", {tournament: foundTournament});
//         }
//     });
// });

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

function compareUserTournaments(a,b) {
    if (a.score > b.score)
        return -1;
    else if (a.score < b.score)
        return 1;
    else 
        return 0;
}


function compareBonusAggregates(a,b) {
    if (a.matchNumber < b.matchNumber)
        return -1;
    else if (a.matchNumber > b.matchNumber)
        return 1;
    else {
        if(a.team.id.seed < b.team.id.seed)
            return -1;
        else if (a.team.id.seed > b.team.id.seed)
            return 1;
    }
    return 0;
}


function compare(a,b) {
    if (a.year > b.year)
        return -1;
    else if (a.year < b.year)
        return 1;
    return 0;
}


module.exports = router;
