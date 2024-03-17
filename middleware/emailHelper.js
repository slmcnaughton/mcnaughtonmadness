var Tournament = require("../models/tournament");
var TournamentGroup = require("../models/tournamentGroup");
var UserTournament = require("../models/userTournament");
var User = require("../models/user");
require('dotenv').config();
// var authHelper = require('../helpers/auth');
// var graph = require('@microsoft/microsoft-graph-client');
var async = require("async");
var sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

var emailObj = {};

emailObj.sendRoundSummary = async function(tournamentGroup) {
    tournamentGroup.userTournaments.sort(compareUserTournaments);
    async.waterfall([
        async.apply(createMailingList, tournamentGroup),
        async function(emailList) {
            const mail = {
                subject: "End of Round " + (tournamentGroup.currentRound - 1) + " Summary",
                to: emailList,
                body: {
                    content: buildGroupScoreTableHtml(tournamentGroup),
                    contentType: "html"
                }
            };
            sendEmail(mail.to, mail.subject, mail.body, function(err) {
                if (err) console.log(err);
            });
        }
    ],
    function(err) {
        if (err) console.log(err);
    });
};

emailObj.sendPickReminderEmail = function() {
    TournamentGroup.find({year: new Date().getFullYear()})
        .populate("CurrentRound")
        .exec(function (err, foundTournamentGroups){
        if(err) {
            console.log(err);
        }
        else {
            foundTournamentGroups.forEach(sendEmailReminderToEachMemberInGroup);
        }
    });
};

function sendEmailReminderToEachMemberInGroup(tournamentGroup){
    async.waterfall([
        async.apply(createMailingListForThoseWhoStillNeedToMakePicksThisRound, tournamentGroup),
        async function(emailList) {
            if(emailList.length > 0) {
                const mail = {
                    subject: "Make Your Round " + (tournamentGroup.currentRound) + " Picks Now! Tipoff In 3 Hours.",
                    to: emailList,
                    body: { 
                        content: buildPickReminderContent(tournamentGroup),
                        contentType: "html"
                    }
                };
                sendEmail(mail.to, mail.subject, mail.body, function(err) {
                    if (err) console.log(err);
                });
            }
            else {
                console.log(`All users from ${tournamentGroup.groupName} have submitted picks.`);
            }
        }
    ],
    function(err){
        if (err) console.log(err);
    });
}

function buildGroupScoreTableHtml(tournamentGroup){
    var intro = "<div><p>Round complete! Below is the end of round summary.</p> </div>";
    
    var tableHead = 
    '<html>' +
        '<head>' +
            '<style>' +
                'table {  ' +
                    'color: #333;' +
                    'background: #FAFAFA;' +
                    'font-family: Helvetica, Arial, sans-serif;' +
                    'width: 800px; ' +
                    'border-collapse:  collapse; ' +
                    'border-spacing: 0; ' +
                '}' +
                '' +
                'td, th { ' +
                    'height: 30px; ' +
                    'text-align: center;' +
                    'width="9%"; ' +
                '}' +
                'th {  ' +
                    'background: #F3F3F3;' +
                    'font-weight: bold;' +
                '}' +
            '</style>' +
        '</head>'+
        '<body>' +
            '<div class="table-responsive">' +
                '<table class="table table-striped table-bordered table-hover table-condensed" id="tournamentStandings" style="color: #333;background: #FAFAFA;font-family: Helvetica, Arial, sans-serif;width: 800px;border-collapse: collapse;border-spacing: 0;">' +
                    '<thead>' +
                        '<tr>' +
                            '<th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center; width="9%";">Rank</th>' +
                            '<th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center; width="9%";">Total</th>' +
                            '<th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center; width="9%";">Name</th>' +
                            '<th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center; width="9%";">Round 1</th>' +
                            '<th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center; width="9%";">Round 2</th>' +
                            '<th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center; width="9%";">Round 3</th>' +
                            '<th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center; width="9%";">Round 4</th>' +
                            '<th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center; width="9%";">Round 5</th>' +
                            '<th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center; width="9%";">Round 6</th>' +
                            '<th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center; width="9%";">Final Four Bonus</th>' +
                            '<th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center; width="9%";">Champion Bonus</th>' +
                        '</tr>' +
                    '</thead>';
    var tableBody = '<tbody>';
                    var tieCount = 0;
                    var rank = 0;
                    for(var i = 0; i < tournamentGroup.userTournaments.length; i++) {
                        var participant = tournamentGroup.userTournaments[i];
                        if (i > 0 && participant.score === tournamentGroup.userTournaments[i-1].score) {
                            tieCount++;
                        } else {
                            rank += (1 + tieCount);
                            tieCount = 0;
                        }
                        tableBody += '<tr>';
                            tableBody += '<td style="height: 30px; text-align: center; width="9%";">' + rank + '</td>';
                            var score = participant.score;
                            var rounded = Math.round(score*Math.pow(10,3))/Math.pow(10,3);
                            tableBody += '<td style="height: 30px; text-align: center; width="9%";">' + rounded + '</td>';
                            tableBody += '<td style="height: 30px; text-align: center; width="9%";">' + participant.user.firstName + '</td>';
                            //Loop through all 8 potential rounds
                            for(var j = 1; j < 9; j++) {
                                var found = false;
                                for(var k = 0; k < participant.userRounds.length; k++) {
                                    if(participant.userRounds[k].round.numRound === j) {
                                        var roundScore = participant.userRounds[k].roundScore;
                                        var roundScoreRounded = Math.round(roundScore*Math.pow(10,3))/Math.pow(10,3);
                                        tableBody += '<td style="height: 30px; text-align: center; width="9%";">' + roundScoreRounded + '</td>';
                                            found = true;
                                    }
                                }
                                if(found === false ) {
                                    tableBody += '<td style="height: 30px; text-align: center; width="9%";">0</td>';
                                }
                            }
                            tableBody += '</tr>';
                        }
    tableBody += '</tbody></table></div>';
    
    var htmlEnd = '</body></html>';
    
   
    return intro + tableHead + tableBody + htmlEnd;

}


function buildPickReminderContent(tournamentGroup){
    var intro = '<p>Hello,</p>' + '<p>You are receiving this because there are just three hours until March Madness Round ' + (tournamentGroup.currentRound) + ' tips off.</p>';
    
    var groupLink = "https://www.mcnaughtonmadness.com/tournamentGroups/" + tournamentGroup.groupName;
    var groupLinkHtml = "<a href=" + groupLink + ">McNaughton Madness: " + tournamentGroup.groupName + "</a>";
    var linkParagraph = '<p>Go to ' + groupLinkHtml + ' and login to make your picks now!</p>';
    
    var closing = '<p>Good luck!</p>';
                        
    return intro + linkParagraph + closing;
}

emailObj.sendUsernameRecovery = async function(req, user) {
    var subject = "McNaughton Madness Forgot Username";
    var mailBody = {
        content: 'Hello ' + user.firstName + ',\n\n' 
            + 'You are receiving this because you have requested the username for your McNaughton Madness account.\n\n'
            +'Username: ' + user.username + '\n\n'
            +'Please reach out to me if you feel like you have received this email in error or if you still have trouble logging in.',
        contentType: "text"
    };

    sendEmail(user.email, subject, mailBody, function(err) {
        if (err) console.log(err);
    });

    req.flash('info', 'An e-mail has been sent to ' + user.email + ' with your username.');
};

emailObj.sendPasswordRecovery = async function(req, token, user) {
    var subject = "McNaughton Madness Password Reset";
    var mailBody = {
        content: 'Hello ' + user.firstName + ',\n\n' + 'You are receiving this because you have requested the reset of the password for your McNaughton Madness account with the following username: ' + user.username + '\n\n' +
            'Please click the following link, or paste this into your browser to complete the process:\n\n' +
            'https://' + req.headers.host + '/reset/' + token + '\n\n' +
            'If you did not request this, please ignore this email and your password will remain unchanged.\n' +
            'The link above will be active for the next 1 hour.',
        contentType: "text"
    };

    sendEmail(user.email, subject, mailBody, function(err) {
        if (err) console.log(err);
    });

    req.flash('info', 'An e-mail has been sent to ' + user.email + ' with further instructions');
};

emailObj.confirmPasswordChange = async function(req, user) {
    var subject = "Password Change Confirmation";
    var mailBody = {
        content: 'Hello ' + user.firstName + ',\n\n' +
            'This is a confirmation that the password for your McNaughton Madness account has just been changed.\n',
        contentType: "text"
    };
    
    sendEmail(user.email, subject, mailBody, function(err) {
        if (err) console.log(err);
    });

    req.flash('success', 'Success! Your password has been changed.');
};

async function sendEmail(mailingList, subject, mailBody) {
    console.log("Email sent to " + mailingList);
    const mail = {
        to: mailingList,
        from: 'seth@mcnaughtonmadness.com',
        fromName: 'McNaughton Madness',
        subject: subject,
    };
    
    if(mailBody.contentType == "text")
    {
        mail.text = mailBody.content;
    }
    else if(mailBody.contentType == "html")
    {
        mail.html = mailBody.content;
    }
    
    sgMail.send(mail, function(err) {
        if(err) console.log(err);
    });
}

function createMailingList(tournamentGroup, done) {
    UserTournament.find({ "tournamentGroup.id": tournamentGroup._id }).populate({ path: "user.id" }).exec(function(err, foundUsers) {
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

function createMailingListForThoseWhoStillNeedToMakePicksThisRound(tournamentGroup, done) {
    UserTournament.find({ "tournamentGroup.id": tournamentGroup._id, 
    })
        .populate({ path: "user.id"})
        .populate({ path: "userRounds", populate: "round"})
        .exec(function(err, foundUserTournaments) {
        if (err) console.log(err);
        else {
            // Keep tournaments which do not have picks for this round - they need a reminder!
            foundUserTournaments = foundUserTournaments.filter(tournament => 
                (tournament.userRounds.filter(
                    userRound => userRound.round.numRound === tournamentGroup.currentRound)).length === 0);
                    
            var foundUserEmails = foundUserTournaments.map(tournament => tournament.user.id.email);
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
            "emailAddress": {
                "address": emailAddressList[i]
            }
        };
        formattedMailingList.push(address);
    }
    done(null, formattedMailingList);
}

function compareUserTournaments(a,b) {
    if (a.score > b.score)
        return -1;
    else if (a.score < b.score)
        return 1;
    else 
        return 0;
}

module.exports = emailObj;
