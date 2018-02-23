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
    // TournamentGroup.findById(req.params.id, function(err, foundTournamentGroup){
    TournamentGroup.findOne({groupName: groupName}).exec(function(err, foundTournamentGroup){
        if(err){
            console.log(err);
        } else {
             res.render("userTournaments/new", {tournamentGroup: foundTournamentGroup});
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
            var newUserTournament = {
                score: 0,
                user: {
                    id: req.user._id,
                    firstName: req.user.firstName,
                    lastName: req.user.lastName
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
                    // console.log(userTournament);
                    foundTournamentGroup.userTournaments.addToSet(userTournament);
                    foundTournamentGroup.save();
                    req.flash('success', 'Entry started!');
                    res.redirect("/tournamentGroups/" + foundTournamentGroup.groupName + "/userTournaments/" + userTournament._id + "/1/edit");
                }
            });
        }
        
    });
});

//SHOW - shows more information about a particular userTournament
router.get("/:id", function(req, res){
    UserTournament.findById(req.params.id)
            .populate({path: "userRounds", populate: {path: "round.id"}})
            .populate({path: "userRounds", populate: {path: "userMatchPredictions", populate: {path: "winner"}}})
            .populate({path: "userRounds", populate: {path: "userMatchPredictions", populate: {path: "match.id"}}})
        .exec(function(err, foundUserTournament){
         if (err || !foundUserTournament){
            req.flash("error", "User tournament not found");
            return res.redirect("/tournamentGroups");
        } else {
            foundUserTournament.userRounds.sort(compare);
            res.render("userTournaments/show", {userTournament: foundUserTournament});
        }
    });
});

function compare(a,b) {
    if (a.round.numRound < b.round.numRound)
        return -1;
    else if (a.round.numRound > b.round.numRound)
        return 1;
    return 0;
}

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


module.exports = router;