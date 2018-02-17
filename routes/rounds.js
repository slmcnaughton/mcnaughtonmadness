var express = require("express");
var router = express.Router({mergeParams: true});   //pass {} merges the parameters from the campground.js to this comments.js...allows us to access :id of the campground
var Tournament = require("../models/tournament");
var Round = require("../models/round");
var middleware = require("../middleware");


//EDIT - comment form
// middleware.checkCommentOwnership, 
router.get("/:numRound/edit", function(req, res){
    Tournament.findOne({year: req.params.year}).populate({
        path: "rounds",
        populate: {
            path: "matches",
            populate: {
                path: "teams",
                }
            }
    }).exec(function (err, foundTournament){
        if(err || !foundTournament) {
            req.flash("error", "tournament combination not found");
            res.redirect("back");
        } else {
            // res.send("hi" + foundTournament.rounds);
            res.render("rounds/edit.ejs", {tournament: foundTournament, round: foundTournament.rounds[req.params.numRound-1]});
        }
    });
});

//UPDATE - comment
// middleware.checkCommentOwnership,
router.put("/:numRound", function(req, res){

    Tournament.findOne({year: req.params.year}).populate({
        path: "rounds",
        populate: {
            path: "matches",
            populate: {
                path: "teams",
                }
            }
    }).exec(function (err, foundTournament){
        if(err) {
          res.redirect("back");
        }
        else {
        
        var round = foundTournament.rounds[req.params.numRound-1];
        var roundFirstMatch = round.matches[0].matchNumber;
        
        //replace 6 with foundTournament.rounds.length
        if (round.numRound === foundTournament.rounds.length)
        {
            console.log(foundTournament.champion);
            console.log(req.body[roundFirstMatch]);
            foundTournament.champion = req.body[roundFirstMatch];
        } else{
            var nextRound = foundTournament.rounds[req.params.numRound];
            // var nextRoundFirstMatch = nextRound.matches[0].matchNumber;
            var numMatches = round.matches.length;
            
            // console.log(round);
            // console.log(nextRound);
            // console.log(nextRoundFirstMatch);
            // console.log(numMatches);
    
            for (var i = 0; i < numMatches; i++){
                //need to look for body[matchNumber]
                var bodyIndex = roundFirstMatch + i;
                // console.log(req.body[roundFirstMatch + i]);   
                if(req.body[bodyIndex]) {  
                    // console.log("match updated");
                    round.matches[i].winner = req.body[bodyIndex];
                    var nextMatchIndex = Math.floor(i / 2);
                    nextRound.matches[nextMatchIndex].teams.addToSet(req.body[bodyIndex]);
                    round.save();
                    nextRound.matches[nextMatchIndex].save();
                    // console.log(round.matches[i]);
                    // console.log(nextRound.matches[nextMatchIndex]);
                    
                }
            }
        }
        
        //   Round.findByIdAndUpdate(req.params.comment_id, req.body.comment, function(err, updatedComment){
        //   res.redirect("/campgrounds/" + req.params.id);
        foundTournament.save();
        res.redirect("back");

        
      }
   });
});


module.exports = router;