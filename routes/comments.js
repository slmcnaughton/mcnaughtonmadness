var express = require("express");
var router = express.Router({mergeParams: true});   //pass {} merges the parameters from the campground.js to this comments.js...allows us to access :id of the campground
var Comment = require("../models/comment");
var TournamentGroup = require("../models/tournamentGroup");
var middleware = require("../middleware");

// app.use("/tournamentGroups/:groupName/comments", commentRoutes);

//Comments New
router.get("/new", middleware.isLoggedIn, function(req, res){
    //find tournament by group name
    TournamentGroup.findOne({groupName: req.params.groupName}).exec(function(err, foundTournamentGroup){
        if(err){
            console.log(err);
        } else {
            res.render("comments/new", {tournamentGroup: foundTournamentGroup});
        }
    });
});

//Comments Create
router.post("/", middleware.isLoggedIn, function(req, res){
     TournamentGroup.findOne({groupName: req.params.groupName}).exec(function(err, foundTournamentGroup){
        if(err){
            req.flash("error", "Something went wrong creating the comment");
            console.log(err);
            res.redirect("/tournamentGroups");
        } else {
            //create new comment
            Comment.create(req.body.comment, function(err, comment){
               if(err){
                   console.log(err);
               } else{
                   //add username and id to comment
                   comment.author.id = req.user._id;
                   comment.author.username = req.user.username;
                   comment.author.firstName = req.user.firstName;
                   comment.save();
                   //connect new comment to tournament group
                   foundTournamentGroup.comments.push(comment._id);
                   foundTournamentGroup.save();
                   
                   req.flash("success", "Sucessfully posted comment");
                   res.redirect("/tournamentGroups/" + foundTournamentGroup.groupName + "/messageboard");
               }
            });
        }
    });
});

//EDIT - comment form
router.get("/:comment_id/edit", middleware.checkCommentOwnership, function(req, res){
    TournamentGroup.findOne({groupName: req.params.groupName}).exec(function(err, foundTournamentGroup){
        if(err || !foundTournamentGroup) {
            req.flash("error", "Tournament Group not found");
            return res.redirect("back");
        } else {
            Comment.findById(req.params.comment_id, function(err, foundComment){
                if(err || !foundComment){
                    req.flash("error", "Comment not found");
                    res.redirect("back");
                } else {
                    res.render("comments/edit", {groupName: req.params.groupName, comment: foundComment} );
                }
            });
        }
    });
});

//UPDATE - comment
router.put("/:comment_id", middleware.checkCommentOwnership, function(req, res){
   Comment.findByIdAndUpdate(req.params.comment_id, req.body.comment, function(err, updatedComment){
      if(err) {
          res.redirect("back");
      } else {
          res.redirect("/tournamentGroups/" + req.params.groupName + "/messageboard");
      }
   });
});

//DESTROY comment route
router.delete("/:comment_id", middleware.checkCommentOwnership, function(req, res){
   Comment.findByIdAndRemove(req.params.comment_id, function(err){
       if(err) {
           res.redirect("back");
       } else {
           req.flash("success", "Comment deleted");
           res.redirect("/tournamentGroups/" + req.params.groupName + "/messageboard");
       }
   });
});

module.exports = router;