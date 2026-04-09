var express = require("express");
var router = express.Router({ mergeParams: true }); //pass {} merges the parameters from the campground.js to this comments.js...allows us to access :id of the campground
var Comment = require("../models/comment");
var TournamentGroup = require("../models/tournamentGroup");
var middleware = require("../middleware");

// app.use("/tournamentGroups/:groupName/comments", commentRoutes);

//Comments New
router.get("/new", middleware.isLoggedIn, async function (req, res) {
  try {
    //find tournament by group name
    var foundTournamentGroup = await TournamentGroup.findOne({
      groupName: req.params.groupName,
    });
    if (!foundTournamentGroup) {
      req.flash("error", "Something went wrong");
      return res.redirect("back");
    }
    res.render("comments/new", { tournamentGroup: foundTournamentGroup });
  } catch (err) {
    console.log(err);
    req.flash("error", "Something went wrong");
    res.redirect("back");
  }
});

//Comments Create
router.post("/", middleware.isLoggedIn, async function (req, res) {
  try {
    var foundTournamentGroup = await TournamentGroup.findOne({
      groupName: req.params.groupName,
    });
    if (!foundTournamentGroup) {
      req.flash("error", "Something went wrong creating the comment");
      return res.redirect("/tournamentGroups");
    }
    //create new comment
    var comment = await Comment.create(req.body.comment);
    //add username and id to comment
    comment.author.id = req.user._id;
    comment.author.username = req.user.username;
    comment.author.firstName = req.user.firstName;
    await comment.save();
    //connect new comment to tournament group
    foundTournamentGroup.comments.push(comment._id);
    await foundTournamentGroup.save();

    req.flash("success", "Sucessfully posted comment");
    res.redirect(
      "/tournamentGroups/" +
        foundTournamentGroup.groupName +
        "/messageboard",
    );
  } catch (err) {
    console.log(err);
    req.flash("error", "Something went wrong");
    res.redirect("back");
  }
});

//EDIT - comment form
router.get(
  "/:comment_id/edit",
  middleware.checkCommentOwnership,
  async function (req, res) {
    try {
      var foundTournamentGroup = await TournamentGroup.findOne({
        groupName: req.params.groupName,
      });
      if (!foundTournamentGroup) {
        req.flash("error", "Tournament Group not found");
        return res.redirect("back");
      }
      var foundComment = await Comment.findById(req.params.comment_id);
      if (!foundComment) {
        req.flash("error", "Comment not found");
        return res.redirect("back");
      }
      res.render("comments/edit", {
        groupName: req.params.groupName,
        comment: foundComment,
      });
    } catch (err) {
      console.log(err);
      req.flash("error", "Something went wrong");
      res.redirect("back");
    }
  },
);

//UPDATE - comment
router.put(
  "/:comment_id",
  middleware.checkCommentOwnership,
  async function (req, res) {
    try {
      await Comment.findByIdAndUpdate(
        req.params.comment_id,
        req.body.comment,
      );
      res.redirect(
        "/tournamentGroups/" + req.params.groupName + "/messageboard",
      );
    } catch (err) {
      console.log(err);
      req.flash("error", "Something went wrong");
      res.redirect("back");
    }
  },
);

//DESTROY comment route
router.delete(
  "/:comment_id",
  middleware.checkCommentOwnership,
  async function (req, res) {
    try {
      await Comment.findByIdAndDelete(req.params.comment_id);
      req.flash("success", "Comment deleted");
      res.redirect(
        "/tournamentGroups/" + req.params.groupName + "/messageboard",
      );
    } catch (err) {
      console.log(err);
      req.flash("error", "Something went wrong");
      res.redirect("back");
    }
  },
);

module.exports = router;
