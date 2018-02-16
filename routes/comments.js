var express = require("express");
var router = express.Router({mergeParams: true});   //pass {} merges the parameters from the campground.js to this comments.js...allows us to access :id of the campground
var Campground = require("../models/campground");
var Comment = require("../models/comment");
var middleware = require("../middleware");

//Comments New
router.get("/new", middleware.isLoggedIn, function(req, res){
    //find campground by id
    Campground.findById(req.params.id, function(err, campground){
        if(err){
           
            console.log(err);
        } else {
            res.render("comments/new", {campground: campground});
        }
    });
});

//Comments Create
router.post("/", middleware.isLoggedIn, function(req, res){
    //lookup campground using ID
    Campground.findById(req.params.id, function(err, campground){
        if(err){
             req.flash("error", "Something went wrong creating the comment");
            console.log(err);
            res.redirect("/campgrounds");
        } else {
            //create new comment
            Comment.create(req.body.comment, function(err, comment){
               if(err){
                   console.log(err);
               } else{
                   //add username and id to comment
                   comment.author.id = req.user._id;
                   comment.author.username = req.user.username;
                   //save the comment
                   comment.save();
                   //connect new comment to campground
                   campground.comments.push(comment._id);
                   campground.save();
                   //redirect campground show page
                   req.flash("success", "Sucessfully added comment");
                   res.redirect("/campgrounds/" + campground._id);
               }
            });
        }
    });
});

//EDIT - comment form
router.get("/:comment_id/edit", middleware.checkCommentOwnership, function(req, res){
    Campground.findById(req.params.id, function(err, foundCampground){
        if(err || !foundCampground) {
            req.flash("error", "Campground not found");
            return res.redirect("back");
        } else {
            Comment.findById(req.params.comment_id, function(err, foundComment){
                if(err || !foundComment){
                    req.flash("error", "Comment not found");
                    res.redirect("back");
                } else {
                    res.render("comments/edit", {campground_id: req.params.id, comment: foundComment} );
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
          res.redirect("/campgrounds/" + req.params.id);
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
           res.redirect("/campgrounds/" + req.params.id);
       }
   }) 
});

module.exports = router;