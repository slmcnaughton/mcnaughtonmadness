var cheerio = require("cheerio");
var fs = require("fs");
var path = require("path");
var https = require("https");
var http = require("http");
var TeamImage = require("./models/teamImage");

var TEAMS_DIR = path.join(__dirname, "public", "imgs", "teams");

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/&/g, "and")
    .replace(/\./g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function downloadFile(url) {
  return new Promise(function (resolve, reject) {
    var client = url.startsWith("https") ? https : http;
    client.get(url, { timeout: 15000 }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error("HTTP " + res.statusCode));
      }
      var chunks = [];
      res.on("data", function (chunk) { chunks.push(chunk); });
      res.on("end", function () { resolve(Buffer.concat(chunks)); });
      res.on("error", reject);
    }).on("error", reject);
  });
}

function saveImageLocally(imageUrl, teamName) {
  var slug = slugify(teamName);

  return downloadFile(imageUrl).then(function (data) {
    if (!fs.existsSync(TEAMS_DIR)) {
      fs.mkdirSync(TEAMS_DIR, { recursive: true });
    }
    var ext = data.toString("utf8", 0, 5).trim().startsWith("<") ? ".svg" : ".png";
    var filename = slug + ext;
    var filePath = path.join(TEAMS_DIR, filename);
    var localPath = "/imgs/teams/" + filename;
    fs.writeFileSync(filePath, data);
    return localPath;
  });
}

async function scrapeTeams() {
  for (var day = 0; day < 28; day++) {
    var extension = "202602";
    if (day < 10) extension += "0" + day;
    else extension += day;
    var link =
      "https://www.cbssports.com/college-basketball/scoreboard/all/" +
      extension +
      "/";

    try {
      var response = await fetch(link);
      if (!response.ok) continue;

      var html = await response.text();
      var $ = cheerio.load(html);
      var parsedResults = [];

      $("div.live-update").each(function (i, element) {
        var a = $(this);

        var team1 = a
          .find(".in-progress-table")
          .find("td.team")
          .first()
          .find("a")
          .text();
        var image1 = a
          .find(".in-progress-table")
          .find("td.team")
          .first()
          .find("img")
          .attr("src");
        if (image1) {
          image1 = image1.replace(/90/g, "100");
          parsedResults.push({ name: team1, image: image1 });
        }

        var team2 = a
          .find(".in-progress-table")
          .find("td.team")
          .last()
          .find("a")
          .text();
        var image2 = a
          .find(".in-progress-table")
          .find("td.team")
          .last()
          .find("img")
          .attr("src");
        if (image2) {
          image2 = image2.replace(/90/g, "100");
          parsedResults.push({ name: team2, image: image2 });
        }
      });

      for (var result of parsedResults) {
        try {
          // Download and save locally
          var localPath = await saveImageLocally(result.image, result.name);
          result.image = localPath;
        } catch (saveErr) {
          console.log("[SCRAPE TEAMS] Local save failed for " + result.name + ": " + saveErr.message + " — keeping CBS URL");
        }

        var foundTeamImage = await TeamImage.findOne({ name: result.name });
        if (!foundTeamImage) {
          await TeamImage.create(result);
          console.log(result.name + " added");
        } else {
          foundTeamImage.name = result.name;
          foundTeamImage.image = result.image;
          await foundTeamImage.save();
          console.log(foundTeamImage.name + " Updated");
        }
      }
    } catch (err) {
      console.log("[SCRAPE TEAMS] Error on day " + day + ":", err.message);
    }
  }
}

module.exports = scrapeTeams;
