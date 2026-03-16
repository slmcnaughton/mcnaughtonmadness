var express = require("express");
var router = express.Router();
var middleware = require("../middleware");
var Feedback = require("../models/feedback");

// GET /feedback — show form + user's past submissions
router.get("/", middleware.isLoggedIn, function (req, res) {
  Feedback.find({ "author.id": req.user._id })
    .sort({ createdAt: -1 })
    .exec(function (err, submissions) {
      if (err) {
        console.log(err);
        req.flash("error", "Error loading feedback.");
        return res.redirect("/");
      }
      res.render("feedback/index", {
        page: "feedback",
        submissions: submissions,
      });
    });
});

// POST /feedback — create new feedback
router.post("/", middleware.isLoggedIn, function (req, res) {
  var message = (req.body.message || "").trim();
  var category = req.body.category || "general";
  var pageContext = req.body.pageContext || "";

  if (!message) {
    req.flash("error", "Please enter a message.");
    return res.redirect("/feedback");
  }

  // Validate category
  if (["bug", "feature", "general"].indexOf(category) === -1) {
    category = "general";
  }

  var newFeedback = {
    category: category,
    message: message,
    pageContext: pageContext,
    author: {
      id: req.user._id,
      username: req.user.username,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
    },
  };

  Feedback.create(newFeedback, function (err) {
    if (err) {
      console.log(err);
      req.flash("error", "Error submitting feedback.");
      return res.redirect("/feedback");
    }
    req.flash("success", "Thanks for the feedback! We'll take a look.");
    res.redirect("/feedback");
  });
});

module.exports = router;
