var express = require("express");
var router = express.Router();
var Campground = require("../models/campground");
var middleware = require("../middleware");

//INDEX - show all campgrounds
// router.get("/", function(req, res) {
//     //get all campgrounds from db
//     Campground.find({}, function(err, allCampgrounds) {
//         if(err) {
//             console.log(err)
//         } else {
//             res.render("campgrounds/index", {campgrounds: allCampgrounds, page: "campgrounds"});
//         }
//     });
// });


//NEW - show form to create new campground 
router.get("/new", middleware.isLoggedIn, function(req, res) {
    res.render("campgrounds/new");
});

//CREATE -
router.post("/", middleware.isLoggedIn, function(req, res) {
   //get data from form and add to campgrounds array
   var name = req.body.name;
   var price = req.body.price;
   var image = req.body.image;
   var desc = req.body.description;
   var author = {
       id: req.user._id,
       username: req.user.username
   }
   var newCampground = {name: name, price: price, image: image, author: author, description: desc};
   //create a new campground and save to database
   Campground.create(newCampground, function(err, newlyCreated) {
       if(err){
           console.log(err);
       } else {
            //redirect back to campgrounds page
           res.redirect("/campgrounds");
       }
   })
});

//Note: this must be below the /campgrounds/new route
//SHOW - shows more information about a particular campground
router.get("/:id", function(req, res){
   //find the campground with provided ID, populate the comments array
    Campground.findById(req.params.id).populate("comments").exec(function(err, foundCampground) {
        if(err || !foundCampground) {
            req.flash("error", "Campground not found");
            res.redirect("back");
        } else {
            //render the show template with that campground
            res.render("campgrounds/show", {campground: foundCampground});
        }
    });
});

//EDIT Campground Route
// middleware.checkCampgroundOwnership
router.get("/:id/edit", function(req, res){
    Campground.findById(req.params.id, function(err, foundCampground){
        res.render("campgrounds/edit", {campground: foundCampground});
    });
});

// UPDATE Campground Route
// middleware.checkCampgroundOwnership
router.put("/:id", function(req, res) {
   //find and update the correct campground
   // Campground.findByIdAndUpdate(id, newData, callback)
   Campground.findByIdAndUpdate(req.params.id, req.body.campground, function(err, updatedCampground){
       if(err){
           res.redirect("/campgrounds");
       } else {
            res.redirect("/campgrounds/" + req.params.id);     
       }
   });
});

//DESTROY Campground Route
// middleware.checkCampgroundOwnership,
router.delete("/:id", function(req, res){
   Campground.findByIdAndRemove(req.params.id, function(err){
      if(err){
          res.redirect("/campgrounds");
      } else {
          req.flash("success", "Campground deleted");
          res.redirect("/campgrounds");
      }
   });
});


module.exports = router;