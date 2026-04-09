var cheerio = require("cheerio");
var TeamImage = require("./models/teamImage");

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
