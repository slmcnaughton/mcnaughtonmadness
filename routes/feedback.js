var express = require("express");
var router = express.Router();
var middleware = require("../middleware");
var Feedback = require("../models/feedback");

// GET /feedback — show form + user's past submissions
router.get("/", middleware.isLoggedIn, async function (req, res) {
  try {
    var submissions = await Feedback.find({ "author.id": req.user._id }).sort({
      createdAt: -1,
    });
    res.render("feedback/index", {
      page: "feedback",
      submissions: submissions,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Something went wrong");
    res.redirect("back");
  }
});

// POST /feedback — create new feedback
router.post("/", middleware.isLoggedIn, async function (req, res) {
  try {
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

    await Feedback.create(newFeedback);
    req.flash("success", "Thanks for the feedback! We'll take a look.");
    res.redirect("/feedback");
  } catch (err) {
    console.log(err);
    req.flash("error", "Something went wrong");
    res.redirect("back");
  }
});

module.exports = router;
