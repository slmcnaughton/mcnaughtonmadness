
var TournamentGroup = require("../models/tournamentGroup");
var UserTournament = require("../models/userTournament");
var User = require("../models/user");

var emailObj = {};


emailObj.sendRoundSummary = function(tournamentGroup) {
    console.log("tg1");
    console.log(tournamentGroup);
    console.log("tg2");
    
    UserTournament.find( {"tournamentGroup.id" : tournamentGroup._id}).populate({path: "user.id"}).exec(function(err, foundUsers) {
        if(err) console.log(err);
        else {
            var mailingList = createMailingList(foundUsers); 


        }
    });
    
    
    
    
    // if(req.isAuthenticated()){
    //     TournamentGroup.findOne({groupName: req.params.groupName}).exec(function(err,foundTournamentGroup) {
    //         if(err || !foundTournamentGroup) {
    //             req.flash("error", "Tournament Group not found");
    //             res.redirect("back");
    //         } else {
    //             //does user own the tournament group?
    //             if(foundTournamentGroup.commissioner.id.equals(req.user.id)){
    //                 next();
    //             } else {
    //                 req.flash("error", "You don't have permission to do that");
    //                 res.redirect("back");
    //             }
    //         }
    //     });
    // } else {
    //     req.flash("error", "You need to be logged in to do that");
    //     res.redirect("back");
    // }
};

function createMailingList(userObjects) {
    var mailingList = [];
    for (var i = 0; i < userObjects.length; i++)
    {
        // console.log(userObjects[i].user.id.email);
        mailingList.push(userObjects[i].user.id.email);
    }
    return mailingList;
}


module.exports = emailObj;