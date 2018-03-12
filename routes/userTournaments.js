var express = require("express");
// var router = express.Router();   //pass {} merges the parameters from the tournamentGroup.js to this userTournament.js...allows us to access :id of the tournamentGroup
var router = express.Router({mergeParams: true});   //pass {} merges the parameters from the tournamentGroup.js to this userTournament.js...allows us to access :id of the tournamentGroup
var async = require("async");
var middleware = require("../middleware");
var UserTournament = require("../models/userTournament");
var TournamentGroup = require("../models/tournamentGroup");
var Round = require("../models/round");
var Match = require("../models/match");
var Team = require("../models/team");

//New - show form to create new userTournament 
router.get("/new", middleware.isLoggedIn, function(req, res){
    var groupName = req.params.groupName;
    TournamentGroup.findOne({groupName: groupName}).exec(function(err, foundTournamentGroup){
        if(err){
            console.log(err);
        } else {
            UserTournament.findOne({"user.id": req.user._id, "tournamentGroup.groupName" : req.params.groupName}).exec(function(err, foundUserTournament){
                if(err) {
                    req.flash("error", "Error creating User Tournament");
                    return res.redirect("/tournamentGroups");
                }
                else if (!foundUserTournament) {
                    res.render("userTournaments/new", {tournamentGroup: foundTournamentGroup, page: "tournamentGroups"});
                }
                else {
                    req.flash("error", "You've already created picks for this tournament!");
                    return res.redirect("/tournamentGroups/" + req.params.groupName);
                }
            });
            
        }
        
    });
    
});


//Create
router.post("/", middleware.isLoggedIn, function(req, res){
    var groupName = req.params.groupName;
    TournamentGroup.findOne({groupName: groupName}).exec(function(err, foundTournamentGroup){
        if(err){
            console.log(err);
            res.redirect("/tournamentGroups");
        } else {
             UserTournament.findOne({"user.id": req.user._id, "tournamentGroup.groupName" : req.params.groupName}).exec(function(err, foundUserTournament){
                if(err) {
                    req.flash("error", "Error creating User Tournament");
                    return res.redirect("/tournamentGroups");
                }
                else if (foundUserTournament) {
                    req.flash("error", "You've already created picks for this tournament!");
                    return res.redirect("/tournamentGroups/" + req.params.groupName);
                }
                else {
                    var newUserTournament = {
                        score: 0,
                        tournamentGroup: {
                            id: foundTournamentGroup.id,
                            groupName: foundTournamentGroup.groupName
                        },
                        user: {
                            id: req.user._id,
                            firstName: req.user.firstName,
                            lastName: req.user.lastName,
                            username: req.user.username
                        },
                        tournamentReference: {
                            id: foundTournamentGroup.tournamentReference.id,
                            year: foundTournamentGroup.tournamentReference.year
                        },
                        userRounds: []
                    };
                    UserTournament.create(newUserTournament, function(err, userTournament){
                        if(err) console.log(err);
                        else {
                            foundTournamentGroup.userTournaments.addToSet(userTournament);
                            foundTournamentGroup.save();
                            req.user.tournamentGroups.push({
                                id: foundTournamentGroup._id, 
                                groupName: foundTournamentGroup.groupName, 
                                year: userTournament.tournamentReference.year
                            });
                            req.user.tournamentGroups.sort(compareUserTournaments);
                            req.user.save();
                            req.flash('success', 'Entry started!');
                            res.redirect("/tournamentGroups/" + foundTournamentGroup.groupName + "/userTournaments/" + userTournament.user.username + "/1/edit");
                        }
                    });
        
                    
                }
            });
        }
        
    });
});

//SHOW - shows more information about a particular userTournament
router.get("/:username", middleware.isLoggedIn, function(req, res){
    UserTournament.findOne({"user.username" : req.params.username, "tournamentGroup.groupName": req.params.groupName})
            .populate({path: "userRounds", populate: {path: "round.id"}})
            .populate({path: "userRounds", populate: {path: "userMatchPredictions", populate: {path: "winner"}}})
            .populate({path: "userRounds", populate: {path: "userMatchPredictions", populate: {path: "match.id"}}})
        .exec(function(err, foundUserTournament){
         if (err || !foundUserTournament){
            req.flash("error", "User Tournament not found");
            return res.redirect("/tournamentGroups");
        } else {
            foundUserTournament.userRounds.sort(compare);
            res.render("userTournaments/show", {userTournament: foundUserTournament, page: "tournamentGroups"});
        }
    });
});



// router.get("/:commentId/edit", middleware.isLoggedIn, function(req, res){
//     // find campground by id
//     Comment.findById(req.params.commentId, function(err, comment){
//         if(err){
//             console.log(err);
//         } else {
//              res.render("comments/edit", {campground_id: req.params.id, comment: comment});
//         }
//     })
// });

// router.put("/:commentId", function(req, res){
//   Comment.findByIdAndUpdate(req.params.commentId, req.body.comment, function(err, comment){
//       if(err){
//           res.render("edit");
//       } else {
//           res.redirect("/campgrounds/" + req.params.id);
//       }
//   }); 
// });

// router.delete("/:commentId",middleware.checkUserComment, function(req, res){
//     Comment.findByIdAndRemove(req.params.commentId, function(err){
//         if(err){
//             console.log("PROBLEM!");
//         } else {
//             res.redirect("/campgrounds/" + req.params.id);
//         }
//     })
// });


function compare(a,b) {
    if (a.round.numRound < b.round.numRound)
        return -1;
    else if (a.round.numRound > b.round.numRound)
        return 1;
    return 0;
}

function compareUserTournaments(a,b) {
    if (a.year < b.year)
        return 1;
    else if (a.year > b.year)
        return -1;
    return 0;
}

module.exports = router;