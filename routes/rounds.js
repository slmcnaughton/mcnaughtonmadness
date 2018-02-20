var express = require("express");
var router = express.Router({mergeParams: true});   //pass {} merges the parameters from the campground.js to this comments.js...allows us to access :id of the campground
var async = require("async");
var Tournament = require("../models/tournament");
var Round = require("../models/round");
var Team = require("../models/team");
var middleware = require("../middleware");


//EDIT - render edit round form
// middleware.checkCommentOwnership, 
router.get("/:numRound/edit", function(req, res){
     Tournament.findOne({year: req.params.year})
        .populate({path: "rounds", populate: { path: "matches",populate:{ path: "topTeam" } }})
        .populate({path: "rounds", populate: { path: "matches", populate: { path: "bottomTeam" } }})
        .exec(function (err, foundTournament){
        if(err || !foundTournament) {
            req.flash("error", "tournament combination not found");
            res.redirect("back");
        } else {
            res.render("rounds/edit.ejs", {tournament: foundTournament, round: foundTournament.rounds[req.params.numRound-1]});
        }
    });
});

//UPDATE - Round of Tournament
// middleware.checkCommentOwnership,
router.put("/:numRound", function(req, res){
    Tournament.findOne({year: req.params.year})
        .populate({path: "rounds", populate: { path: "matches",populate:{ path: "topTeam" } }})
        .populate({path: "rounds", populate: { path: "matches", populate: { path: "bottomTeam" } }})
        .exec(function (err, foundTournament){
        if(err) {
          res.redirect("back");
        }
        else {
        
        var round = foundTournament.rounds[req.params.numRound-1];
        var roundFirstMatch = round.matches[0].matchNumber;
        
        //replace 6 with foundTournament.rounds.length
        if (round.numRound === foundTournament.rounds.length)
        {
            //roundFirstMatch will be match number 63 for a 64 team tournament
            Team.findById(req.body[roundFirstMatch]).exec(function(err, winner) {
                if(err) console.log(err);
                else{
                    round.matches[0].winner = winner;
                    round.matches[0].save();
                    foundTournament.champion = winner;
                    foundTournament.save();
                }
                
            });
        } else{
            
            var nextRound = foundTournament.rounds[req.params.numRound];
            var numMatches = round.matches.length;
            
            async.times(numMatches, function(i, next){
                    //need to look for body[matchNumber]
                    var bodyIndex = roundFirstMatch + i;
                    
                    if(req.body[bodyIndex]) {
                        Team.findById(req.body[bodyIndex]).exec(function(err, winner) {
                            if(err) console.log(err);
                            round.matches[i].winner = winner;
                            round.matches[i].save();
                            
                            var nextMatchIndex = Math.floor(i / 2);
                            var nextRoundMatch = nextRound.matches[nextMatchIndex];
                            
                            if (i % 2 === 0) {
                                nextRoundMatch.topTeam = winner;
                            }
                            else {
                                nextRoundMatch.bottomTeam = winner;
                            }
                            // nextRoundMatch.teams.addToSet(winner);
                            nextRound.matches[nextMatchIndex].save();
                        });
                    }
                    next();
                    
                }, function(err){
                    if(err) console.log(err);
                    else {
                        
                    }
                });
                
                //   res.redirect("/campgrounds/" + req.params.id);
        }
      }
      foundTournament.save();
      res.redirect("back");
   });
});

//order teams correctly by matchNum from lowest to highest
function compareTeams(a,b) {
    // console.log(a.firstMatchNum + " " + b.firstMatchNum);
    if (a.firstMatchNum < b.firstMatchNum)
        return -1;
    else if (a.firstMatchNum > b.firstMatchNum)
        return 1;
    return 0;
}

module.exports = router;