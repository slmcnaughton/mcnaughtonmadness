var Tournament = require("../models/tournament");
var TournamentGroup = require("../models/tournamentGroup");
var UserTournament = require("../models/userTournament");
var User = require("../models/user");
require("dotenv").config();
var async = require("async");
var { Resend } = require("resend");

var resend = new Resend(process.env.RESEND_API_KEY);

var emailObj = {};

emailObj.sendRoundSummary = async function (tournamentGroup, testEmail) {
  // Re-populate with userMatchPredictions so we can count correct/incorrect picks
  TournamentGroup.findById(tournamentGroup._id)
    .populate({
      path: "userTournaments",
      populate: {
        path: "userRounds",
        populate: ["round", "userMatchPredictions"],
      },
    })
    .exec(function (err, populatedGroup) {
      if (err || !populatedGroup) {
        console.log("Error populating group for email:", err);
        return;
      }

      populatedGroup.userTournaments.sort(compareUserTournaments);
      var completedRound = populatedGroup.currentRound - 1;

      function sendIt(emailList) {
        var mail = {
          subject:
            (testEmail ? "[TEST] " : "") +
            populatedGroup.groupName + " — End of Round " + completedRound + " Summary",
          to: emailList,
          body: {
            content: buildGroupScoreTableHtml(populatedGroup, completedRound),
            contentType: "html",
          },
        };
        sendEmail(mail.to, mail.subject, mail.body, function (err) {
          if (err) console.log(err);
        });
      }

      if (testEmail) {
        // Test mode: send only to the specified email
        console.log("[EMAIL TEST] Sending round summary to " + testEmail + " only (skipping full mailing list)");
        sendIt([testEmail]);
      } else {
        async.waterfall(
          [
            async.apply(createMailingList, populatedGroup),
            async function (emailList) {
              sendIt(emailList);
            },
          ],
          function (err) {
            if (err) console.log(err);
          },
        );
      }
    });
};

emailObj.sendPickReminderEmail = function () {
  TournamentGroup.find({ year: new Date().getFullYear() })
    .populate("CurrentRound")
    .exec(function (err, foundTournamentGroups) {
      if (err) {
        console.log(err);
      } else {
        foundTournamentGroups.forEach(sendEmailReminderToEachMemberInGroup);
      }
    });
};

function sendEmailReminderToEachMemberInGroup(tournamentGroup) {
  async.waterfall(
    [
      async.apply(
        createMailingListForThoseWhoStillNeedToMakePicksThisRound,
        tournamentGroup,
      ),
      async function (emailList) {
        if (emailList.length > 0) {
          const mail = {
            subject:
              "Make Your Round " +
              tournamentGroup.currentRound +
              " Picks Now! Tipoff In 3 Hours.",
            to: emailList,
            body: {
              content: buildPickReminderContent(tournamentGroup),
              contentType: "html",
            },
          };
          sendEmail(mail.to, mail.subject, mail.body, function (err) {
            if (err) console.log(err);
          });
        } else {
          console.log(
            `All users from ${tournamentGroup.groupName} have submitted picks.`,
          );
        }
      },
    ],
    function (err) {
      if (err) console.log(err);
    },
  );
}

function buildGroupScoreTableHtml(tournamentGroup, completedRound) {
  var groupName = tournamentGroup.groupName;
  var groupLink = "https://www.mcnaughtonmadness.com/tournamentGroups/" + groupName;
  var participants = tournamentGroup.userTournaments;

  // ── Compute stats per participant ──────────────────────────────────────────
  var stats = [];
  for (var i = 0; i < participants.length; i++) {
    var p = participants[i];
    var thisRoundScore = 0;
    var correctPicks = 0;
    var totalPicks = 0;
    var prevRoundTotal = 0; // score before this round (for rank change)

    for (var k = 0; k < p.userRounds.length; k++) {
      var ur = p.userRounds[k];
      if (ur.round.numRound === completedRound) {
        thisRoundScore = ur.roundScore || 0;
        // Count correct/incorrect from predictions
        if (ur.userMatchPredictions) {
          for (var m = 0; m < ur.userMatchPredictions.length; m++) {
            var pred = ur.userMatchPredictions[m];
            if (pred.score !== undefined && pred.score !== null) {
              totalPicks++;
              if (pred.score > 0) correctPicks++;
            }
          }
        }
      }
    }

    prevRoundTotal = (p.score || 0) - thisRoundScore;

    stats.push({
      firstName: p.user.firstName,
      totalScore: p.score || 0,
      thisRoundScore: thisRoundScore,
      correctPicks: correctPicks,
      totalPicks: totalPicks,
      prevRoundTotal: prevRoundTotal,
      userRounds: p.userRounds,
    });
  }

  // ── Compute current rank and previous rank ─────────────────────────────────
  // Current rank (already sorted by total score descending)
  var tieCount = 0;
  var rank = 0;
  for (var i = 0; i < stats.length; i++) {
    if (i > 0 && stats[i].totalScore === stats[i - 1].totalScore) {
      tieCount++;
    } else {
      rank += 1 + tieCount;
      tieCount = 0;
    }
    stats[i].currentRank = rank;
  }

  // Previous rank (by prevRoundTotal)
  if (completedRound > 1) {
    var prevSorted = stats.slice().sort(function (a, b) {
      return b.prevRoundTotal - a.prevRoundTotal;
    });
    tieCount = 0;
    rank = 0;
    for (var i = 0; i < prevSorted.length; i++) {
      if (i > 0 && prevSorted[i].prevRoundTotal === prevSorted[i - 1].prevRoundTotal) {
        tieCount++;
      } else {
        rank += 1 + tieCount;
        tieCount = 0;
      }
      prevSorted[i].prevRank = rank;
    }
    // Map prevRank back to stats by firstName
    var prevRankMap = {};
    for (var i = 0; i < prevSorted.length; i++) {
      prevRankMap[prevSorted[i].firstName] = prevSorted[i].prevRank;
    }
    for (var i = 0; i < stats.length; i++) {
      stats[i].prevRank = prevRankMap[stats[i].firstName];
    }
  }

  // ── Find highlights (tie-aware) ─────────────────────────────────────────────
  var bestRoundScore = stats[0].thisRoundScore;
  var worstRoundScore = stats[0].thisRoundScore;
  var mostCorrectPicks = stats[0].correctPicks;
  var bestMovement = 0;

  // First pass: find the best/worst values
  for (var i = 0; i < stats.length; i++) {
    if (stats[i].thisRoundScore > bestRoundScore) bestRoundScore = stats[i].thisRoundScore;
    if (stats[i].thisRoundScore < worstRoundScore) worstRoundScore = stats[i].thisRoundScore;
    if (stats[i].correctPicks > mostCorrectPicks) mostCorrectPicks = stats[i].correctPicks;
    if (completedRound > 1 && stats[i].prevRank) {
      var movement = stats[i].prevRank - stats[i].currentRank;
      if (movement > bestMovement) bestMovement = movement;
    }
  }

  // Second pass: collect all tied winners
  var bestRoundPeople = [];
  var worstRoundPeople = [];
  var sharpShooters = [];
  var biggestMovers = [];
  var leaders = [];
  for (var i = 0; i < stats.length; i++) {
    if (stats[i].currentRank === 1) leaders.push(stats[i]);
    if (stats[i].thisRoundScore === bestRoundScore) bestRoundPeople.push(stats[i]);
    if (stats[i].thisRoundScore === worstRoundScore) worstRoundPeople.push(stats[i]);
    if (stats[i].correctPicks === mostCorrectPicks) sharpShooters.push(stats[i]);
    if (completedRound > 1 && stats[i].prevRank && bestMovement > 0) {
      if (stats[i].prevRank - stats[i].currentRank === bestMovement) biggestMovers.push(stats[i]);
    }
  }

  // Helper: join names with commas + "and"
  function joinNames(arr) {
    var names = arr.map(function (s) { return s.firstName; });
    if (names.length === 1) return names[0];
    if (names.length === 2) return names[0] + ' &amp; ' + names[1];
    return names.slice(0, -1).join(', ') + ', &amp; ' + names[names.length - 1];
  }

  // ── Shared inline styles (email clients ignore <style> blocks) ─────────────
  var headerCellStyle = 'style="padding: 8px 6px; text-align: center; background: #1B3A5C; color: #fff; font-size: 13px; font-weight: bold;"';

  // Podium row backgrounds (subtle accents)
  var podiumBg = { 1: '#FFF9E6', 2: '#F4F4F4', 3: '#FDF3EB' }; // gold, silver, bronze
  function cellStyleForRank(rank, altRow) {
    var bg = podiumBg[rank] || (altRow ? '#f9f9f9' : '#ffffff');
    var bold = rank <= 3 ? ' font-weight: bold;' : '';
    return 'style="padding: 8px 6px; text-align: center; border-bottom: 1px solid #eee; font-size: 14px; background: ' + bg + ';' + bold + '"';
  }

  // ── Build HTML ─────────────────────────────────────────────────────────────
  var html = "";
  html += '<html><head></head><body style="margin: 0; padding: 0; font-family: Helvetica, Arial, sans-serif; background: #f4f4f4;">';
  html += '<div style="max-width: 700px; margin: 0 auto; background: #ffffff; padding: 0;">';

  // Header banner
  html += '<div style="background: #1B3A5C; color: #ffffff; padding: 20px 24px; text-align: center;">';
  html += '<h1 style="margin: 0; font-size: 22px; font-weight: bold;">&#127936; ' + groupName + '</h1>';
  html += '<p style="margin: 6px 0 0; font-size: 16px; color: #FFA705;">Round ' + completedRound + ' Complete</p>';
  html += '</div>';

  // Highlights section
  html += '<div style="padding: 16px 24px; background: #FFF9E6; border-bottom: 2px solid #FFA705;">';

  // Leader (tie-aware)
  html += '<div style="margin-bottom: 8px;">';
  html += '<strong>&#127942; Leader:</strong> ' + joinNames(leaders);
  html += ' (' + roundNum(leaders[0].totalScore) + ' pts)';
  html += '</div>';

  // Best round score (tie-aware)
  if (bestRoundScore > 0) {
    html += '<div style="margin-bottom: 8px;">';
    html += '<strong>&#128293; Best Round ' + completedRound + ':</strong> ' + joinNames(bestRoundPeople);
    html += ' (+' + roundNum(bestRoundScore) + ' pts)';
    html += '</div>';
  }

  // Biggest mover (round 2+, tie-aware)
  if (biggestMovers.length > 0) {
    html += '<div style="margin-bottom: 8px;">';
    html += '<strong>&#128640; Biggest Mover:</strong> ' + joinNames(biggestMovers);
    if (biggestMovers.length === 1) {
      html += ' (' + ordinalSuffix(biggestMovers[0].prevRank) + ' &#8594; ' + ordinalSuffix(biggestMovers[0].currentRank) + ')';
    } else {
      html += ' (up ' + bestMovement + ')';
    }
    html += '</div>';
  }

  // Sharp Shooter — most correct picks (skip if same group as best round people)
  var sharpShooterNames = joinNames(sharpShooters);
  var bestRoundNames = joinNames(bestRoundPeople);
  if (mostCorrectPicks > 0 && sharpShooterNames !== bestRoundNames) {
    html += '<div style="margin-bottom: 8px;">';
    html += '<strong>&#127919; Sharp Shooter:</strong> ' + sharpShooterNames;
    html += ' (' + mostCorrectPicks + '/' + sharpShooters[0].totalPicks + ' correct)';
    html += '</div>';
  }

  // Rough round — worst round score (only show if someone actually went negative)
  if (worstRoundScore < 0) {
    html += '<div style="margin-bottom: 8px;">';
    html += '<strong>&#128556; Rough Round:</strong> ' + joinNames(worstRoundPeople);
    html += ' (' + roundNum(worstRoundScore) + ' pts)';
    html += '</div>';
  }

  html += '</div>';

  // Standings table
  html += '<div style="padding: 16px 24px;">';
  html += '<table style="width: 100%; border-collapse: collapse; font-family: Helvetica, Arial, sans-serif;">';

  // Table header — only show columns through the completed round
  html += '<thead><tr>';
  html += '<th ' + headerCellStyle + '>#</th>';
  if (completedRound > 1) {
    html += '<th ' + headerCellStyle + '>+/-</th>';
  }
  html += '<th ' + headerCellStyle + '>Name</th>';
  html += '<th ' + headerCellStyle + '>Total</th>';

  var roundLabels = ["R1", "R2", "R3", "R4", "R5", "R6", "FF", "Champ"];
  var roundNums = [1, 2, 3, 4, 5, 6, 7, 8];
  for (var j = 0; j < roundNums.length; j++) {
    // R1-R6: show when that round is completed
    // FF (R7): show after R4 completes (FF picks overlap with R4)
    // Champ (R8): show after R6 completes (Champ picks overlap with R6)
    var showCol = roundNums[j] <= 6 ? roundNums[j] <= completedRound
      : roundNums[j] === 7 ? completedRound >= 4
      : completedRound >= 6;
    if (showCol) {
      html += '<th ' + headerCellStyle + '>' + roundLabels[j] + '</th>';
    }
  }

  html += '<th ' + headerCellStyle + '>R' + completedRound + ' Picks</th>';
  html += '</tr></thead>';

  // Table body
  html += '<tbody>';
  for (var i = 0; i < stats.length; i++) {
    var s = stats[i];
    var cs = cellStyleForRank(s.currentRank, i % 2 !== 0);

    html += '<tr>';

    // Rank
    html += '<td ' + cs + '>' + s.currentRank + '</td>';

    // Rank change (round 2+)
    if (completedRound > 1) {
      var change = (s.prevRank || s.currentRank) - s.currentRank;
      var changeStr = '';
      if (change > 0) {
        changeStr = '<span style="color: #27ae60;">&#9650;' + change + '</span>';
      } else if (change < 0) {
        changeStr = '<span style="color: #e74c3c;">&#9660;' + Math.abs(change) + '</span>';
      } else {
        changeStr = '<span style="color: #999;">&mdash;</span>';
      }
      html += '<td ' + cs + '>' + changeStr + '</td>';
    }

    // Name
    html += '<td ' + cs + '><strong>' + s.firstName + '</strong></td>';

    // Total
    html += '<td ' + cs + '>' + roundNum(s.totalScore) + '</td>';

    // Per-round scores (same visibility logic as header)
    for (var j = 0; j < roundNums.length; j++) {
      var showCol = roundNums[j] <= 6 ? roundNums[j] <= completedRound
        : roundNums[j] === 7 ? completedRound >= 4
        : completedRound >= 6;
      if (showCol) {
        var found = false;
        for (var k = 0; k < s.userRounds.length; k++) {
          if (s.userRounds[k].round.numRound === roundNums[j]) {
            html += '<td ' + cs + '>' + roundNum(s.userRounds[k].roundScore || 0) + '</td>';
            found = true;
            break;
          }
        }
        if (!found) {
          html += '<td ' + cs + '>0</td>';
        }
      }
    }

    // Correct picks this round
    if (s.totalPicks > 0) {
      html += '<td ' + cs + '>' + s.correctPicks + '/' + s.totalPicks + '</td>';
    } else {
      html += '<td ' + cs + '>&mdash;</td>';
    }

    html += '</tr>';
  }
  html += '</tbody></table>';
  html += '</div>';

  // CTA link
  html += '<div style="padding: 16px 24px; text-align: center; border-top: 1px solid #eee;">';
  html += '<a href="' + groupLink + '" style="display: inline-block; padding: 12px 28px; background: #FFA705; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">View Full Standings & Bracket</a>';
  html += '</div>';

  // Next round info — only show for rounds 1-5 (picks can't be made after R6;
  // FF and Championship bonus picks are made during R4 and R6 respectively)
  var nextRound = completedRound + 1;
  if (nextRound <= 6) {
    html += '<div style="padding: 12px 24px; text-align: center; color: #666; font-size: 14px;">';
    html += '&#128227; <strong>Round ' + nextRound + '</strong> is up next &mdash; make sure your picks are in!';
    html += '</div>';
  } else if (completedRound >= 6) {
    html += '<div style="padding: 12px 24px; text-align: center; color: #666; font-size: 14px;">';
    html += '&#127942; That\'s a wrap! Thanks for playing this year.';
    html += '</div>';
  }

  // Footer
  html += '<div style="padding: 12px 24px; text-align: center; color: #999; font-size: 12px; border-top: 1px solid #eee;">';
  html += '<a href="https://www.mcnaughtonmadness.com" style="color: #999;">McNaughton Madness</a>';
  html += '</div>';

  html += '</div></body></html>';

  return html;
}

function roundNum(n) {
  return Math.round(n * 1000) / 1000;
}

function ordinalSuffix(n) {
  var s = ["th", "st", "nd", "rd"];
  var v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function buildPickReminderContent(tournamentGroup) {
  var intro =
    "<p>Hello,</p>" +
    "<p>You are receiving this because there are just three hours until March Madness Round " +
    tournamentGroup.currentRound +
    " tips off.</p>";

  var groupLink =
    "https://www.mcnaughtonmadness.com/tournamentGroups/" +
    tournamentGroup.groupName;
  var groupLinkHtml =
    "<a href=" +
    groupLink +
    ">McNaughton Madness: " +
    tournamentGroup.groupName +
    "</a>";
  var linkParagraph =
    "<p>Go to " + groupLinkHtml + " and login to make your picks now!</p>";

  var closing = "<p>Good luck!</p>";

  return intro + linkParagraph + closing;
}

emailObj.sendUsernameRecovery = async function (req, user) {
  var subject = "McNaughton Madness Forgot Username";
  var mailBody = {
    content:
      "Hello " +
      user.firstName +
      ",\n\n" +
      "You are receiving this because you have requested the username for your McNaughton Madness account.\n\n" +
      "Username: " +
      user.username +
      "\n\n" +
      "Please reach out to me if you feel like you have received this email in error or if you still have trouble logging in.",
    contentType: "text",
  };

  sendEmail(user.email, subject, mailBody, function (err) {
    if (err) console.log(err);
  });

  req.flash(
    "info",
    "An e-mail has been sent to " + user.email + " with your username.",
  );
};

emailObj.sendPasswordRecovery = async function (req, token, user) {
  var subject = "McNaughton Madness Password Reset";
  var mailBody = {
    content:
      "Hello " +
      user.firstName +
      ",\n\n" +
      "You are receiving this because you have requested the reset of the password for your McNaughton Madness account with the following username: " +
      user.username +
      "\n\n" +
      "Please click the following link, or paste this into your browser to complete the process:\n\n" +
      "https://" +
      req.headers.host +
      "/reset/" +
      token +
      "\n\n" +
      "If you did not request this, please ignore this email and your password will remain unchanged.\n" +
      "The link above will be active for the next 1 hour.",
    contentType: "text",
  };

  sendEmail(user.email, subject, mailBody, function (err) {
    if (err) console.log(err);
  });

  req.flash(
    "info",
    "An e-mail has been sent to " + user.email + " with further instructions",
  );
};

emailObj.confirmPasswordChange = async function (req, user) {
  var subject = "Password Change Confirmation";
  var mailBody = {
    content:
      "Hello " +
      user.firstName +
      ",\n\n" +
      "This is a confirmation that the password for your McNaughton Madness account has just been changed.\n",
    contentType: "text",
  };

  sendEmail(user.email, subject, mailBody, function (err) {
    if (err) console.log(err);
  });

  req.flash("success", "Success! Your password has been changed.");
};

emailObj.sendNameChangeNotification = async function (user) {
  var adminEmail = "slmcnaughton@yahoo.com";
  var subject = "Name Change Request - " + user.firstName + " " + user.lastName;
  var mailBody = {
    content:
      "A name change request has been submitted.\n\n" +
      "User: " + user.firstName + " " + user.lastName + " (" + user.username + ")\n" +
      "Requested name: " + user.pendingFirstName + " " + user.pendingLastName + "\n\n" +
      "Go to the admin dashboard to approve or reject: https://www.mcnaughtonmadness.com/admin",
    contentType: "text",
  };

  sendEmail(adminEmail, subject, mailBody, function (err) {
    if (err) console.log(err);
  });
};

async function sendEmail(mailingList, subject, mailBody) {
  var recipients = Array.isArray(mailingList) ? mailingList : [mailingList];
  console.log("Sending email to " + recipients.length + " recipient(s): " + recipients.join(", "));

  var mail = {
    from: "McNaughton Madness <seth@mcnaughtonmadness.com>",
    reply_to: "slmcnaughton@yahoo.com",
    to: recipients,
    subject: subject,
  };

  if (mailBody.contentType == "text") {
    mail.text = mailBody.content;
  } else if (mailBody.contentType == "html") {
    mail.html = mailBody.content;
  }

  try {
    var result = await resend.emails.send(mail);
    console.log("Email sent successfully, id:", result.data ? result.data.id : result);
  } catch (err) {
    console.log("Email send failed:", err);
  }
}

function createMailingList(tournamentGroup, done) {
  UserTournament.find({ "tournamentGroup.id": tournamentGroup._id })
    .populate({ path: "user.id" })
    .exec(function (err, foundUsers) {
      if (err) console.log(err);
      else {
        var emailAddressSet = new Set();
        for (var i = 0; i < foundUsers.length; i++) {
          emailAddressSet.add(foundUsers[i].user.id.email);
        }
        var emailAddressList = Array.from(emailAddressSet);
        done(null, emailAddressList);
      }
    });
}

function createMailingListForThoseWhoStillNeedToMakePicksThisRound(
  tournamentGroup,
  done,
) {
  UserTournament.find({
    "tournamentGroup.id": tournamentGroup._id,
  })
    .populate({ path: "user.id" })
    .populate({ path: "userRounds", populate: "round" })
    .exec(function (err, foundUserTournaments) {
      if (err) console.log(err);
      else {
        // Keep tournaments which do not have picks for this round - they need a reminder!
        foundUserTournaments = foundUserTournaments.filter(
          (tournament) =>
            tournament.userRounds.filter(
              (userRound) =>
                userRound.round.numRound === tournamentGroup.currentRound,
            ).length === 0,
        );

        var foundUserEmails = foundUserTournaments.map(
          (tournament) => tournament.user.id.email,
        );
        var emailAddressSet = new Set();
        for (var i = 0; i < foundUserEmails.length; i++) {
          emailAddressSet.add(foundUserEmails[i]);
        }
        var emailAddressList = Array.from(emailAddressSet);
        done(null, emailAddressList);
      }
    });
}

function formatMailingListForGraph(emailAddressList, done) {
  var formattedMailingList = [];
  for (var i = 0; i < emailAddressList.length; i++) {
    var address = {
      emailAddress: {
        address: emailAddressList[i],
      },
    };
    formattedMailingList.push(address);
  }
  done(null, formattedMailingList);
}

function compareUserTournaments(a, b) {
  if (a.score > b.score) return -1;
  else if (a.score < b.score) return 1;
  else return 0;
}

module.exports = emailObj;
