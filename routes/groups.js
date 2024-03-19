var express = require("express");
var router = express.Router();
var async = require("async");
var middleware = require("../middleware");
var Tournament = require("../models/tournament");
var Round = require("../models/round");
var Match = require("../models/match");
var Team = require("../models/team");

module.exports = router;
