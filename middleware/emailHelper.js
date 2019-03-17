var TournamentGroup = require("../models/tournamentGroup");
var UserTournament = require("../models/userTournament");
var User = require("../models/user");
require('dotenv').config();
var authHelper = require('../helpers/auth');
var graph = require('@microsoft/microsoft-graph-client');
var async = require("async");

var emailObj = {};


emailObj.sendRoundSummary = async function(tournamentGroup) {
    tournamentGroup.userTournaments.sort(compareUserTournaments);
    async.waterfall([
            async.apply(createMailingList, tournamentGroup),
            formatMailingList,
            async function(formattedMailingList) {
                const accessToken = await authHelper.getAccessToken();

                const mail = {
                    subject: "End of Round " + (tournamentGroup.currentRound - 1) + " Summary",
                    toRecipients: formattedMailingList,
                    body: {
                        content: buildGroupScoreTableHtml(tournamentGroup),
                        contentType: "html"
                    }
                };

                const client = graph.Client.init({
                    authProvider: (done) => {
                        done(null, accessToken);
                    }
                });

                client.api(`/users/5aa3050e-9eeb-43d3-894d-138d7f541245/sendMail`).post({ message: mail }, (err, res) => {
                    if (err) console.log(err);
                    if (res) console.log(res);
                });
            }
        ],
        function(err) {
            if (err) console.log(err);
            else {
                console.log("end of round email sent");
            }
        });
};

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
    
    //===========================================================================================
    //BASE FORMATTED TABLE FOR HTML
    //Formatted here https://templates.mailchimp.com/resources/inline-css/
    //===========================================================================================
    // <html>
    //     <head>
    //         <style>
    //             table {  
    //                 color: #333; /* Lighten up font color */
    //                 background: #FAFAFA; /* Lighter grey background */
    //                 font-family: Helvetica, Arial, sans-serif; /* Nicer font */
    //                 width: 400px; 
    //                 border-collapse:  collapse; 
    //                 border-spacing: 0; 
    //             }
                
    //             td, th { 
    //                 /*border: 1px solid #CCC; */
    //                 height: 30px; 
    //             } /* Make cells a bit taller */
                
    //             th {  
    //                 background: #F3F3F3; /* Light grey background */
    //                 font-weight: bold; /* Make sure they're bold */
    //                 text-align: center; /* Center our text 
                
    //             */
    //             }
    //         </style>
    //     </head>
    //     <body>
    //         <div class="table-responsive">
    //             <table class="table table-striped table-bordered table-hover table-condensed" id="tournamentStandings" style="color: #333;background: #FAFAFA;font-family: Helvetica, Arial, sans-serif;width: 400px;border-collapse: collapse;border-spacing: 0;">
    //                 <thead>
    //                     <tr>
    //                         <th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center;">Rank</th>
    //                         <th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center;">Total</th>
    //                         <th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center;">Name</th>
    //                         <th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center;">Round 1</th>
    //                         <th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center;">Round 2</th>
    //                         <th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center;">Round 3</th>
    //                         <th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center;">Round 4</th>
    //                         <th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center;">Round 5</th>
    //                         <th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center;">Round 6</th>
    //                         <th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center;">Final Four Bonus</th>
    //                         <th style="height: 30px;background: #F3F3F3;font-weight: bold;text-align: center;">Champion Bonus</th>
    //                     </tr>
    //                 </thead>
    //                 <tbody>
    //                     <tr>
    //                         <td style="height: 30px;">1</td>
    //                         <td style="height: 30px;">25</td>
    //                         <td style="height: 30px;">Seth</td>
    //                         <td style="height: 30px;">12.2</td>
    //                         <td style="height: 30px;">12.8</td>
    //                         <td style="height: 30px;">0</td>
    //                         <td style="height: 30px;">0</td>
    //                         <td style="height: 30px;">0</td>
    //                         <td style="height: 30px;">0</td>
    //                         <td style="height: 30px;">0</td>
    //                         <td style="height: 30px;">0</td>
    //                     </tr>
    //                 </tbody>
    //             </table>
    //         </div></body>
        
    // </html>
    
    
    //===========================================================================================
    //BASE TABLE FOR HTML
    //Formatted here https://templates.mailchimp.com/resources/inline-css/
    //===========================================================================================
    // <html>
    //     <head>
    //         <style>
    //             table {  
    //                 color: #333; /* Lighten up font color */
    //                 background: #FAFAFA; /* Lighter grey background */
    //                 font-family: Helvetica, Arial, sans-serif; /* Nicer font */
    //                 width: 400px; 
    //                 border-collapse:  collapse; 
    //                 border-spacing: 0; 
    //             }
                
    //             td, th { 
    //                 /*border: 1px solid #CCC; */
    //                 height: 30px; 
    //             } /* Make cells a bit taller */
                
    //             th {  
    //                 background: #F3F3F3; /* Light grey background */
    //                 font-weight: bold; /* Make sure they're bold */
    //                 text-align: center; /* Center our text 
                
    //             */
    //             }
    //         </style>
    //     </head>
    //     <body>
    //         <div class="table-responsive">
    //             <table class="table table-striped table-bordered table-hover table-condensed" id="tournamentStandings">
    //                 <thead>
    //                     <tr>
    //                         <th>Rank</th>
    //                         <th>Total</th>
    //                         <th>Name</th>
    //                         <th>Round 1</th>
    //                         <th>Round 2</th>
    //                         <th>Round 3</th>
    //                         <th>Round 4</th>
    //                         <th>Round 5</th>
    //                         <th>Round 6</th>
    //                         <th>Final Four Bonus</th>
    //                         <th>Champion Bonus</th>
    //                     </tr>
    //                 </thead>
    //                 <tbody>
    //                     <tr>
    //                         <td>1</td>
    //                         <td>25</td>
    //                         <td>Seth</td>
    //                         <td>12.2</td>
    //                         <td>12.8</td>
    //                         <td>0</td>
    //                         <td>0</td>
    //                         <td>0</td>
    //                         <td>0</td>
    //                         <td>0</td>
    //                         <td>0</td>
    //                     </tr>
    //                 </tbody>
    //             </table>
    //         </body>
    //     </div>
    // </html>
    
                    
                    

}


emailObj.sendPasswordRecovery = async function(req, token, user) {
    var subject = "McNaughton Madness Password Reset";
    var mailBody = {
        content: 'Hello ' + user.firstName + ',\n\n' + 'You are receiving this because you have requested the reset of the password for your McNaughton Madness account with the following username: ' + user.username + '\n\n' +
            'Please click the following link, or paste this into your browser to complete the process:\n\n' +
            'http://' + req.headers.host + '/reset/' + token + '\n\n' +
            'If you did not request this, please ignore this email and your password will remain unchanged.\n',
        contentType: "text"
    };
    
    async.waterfall([
        async.apply(formatMailingList, new Array(user.email)),
        function(list, callback) {
            callback(null, list, subject, mailBody);
        },
        sendEmail
    ], function(err) {
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

    async.waterfall([
        async.apply(formatMailingList, new Array(user.email)),
        function(list, callback) {
            callback(null, list, subject, mailBody);
        },
        sendEmail
    ], function(err) {
        if (err) console.log(err);
    });

    req.flash('success', 'Success! Your password has been changed.');
};




async function sendEmail(formattedMailingList, subject, mailBody) {
    const accessToken = await authHelper.getAccessToken();

    const mail = {
        toRecipients: formattedMailingList,
        subject: subject,
        body: mailBody
    };

    const client = graph.Client.init({
        authProvider: (done) => {
            done(null, accessToken);
        }
    });

    client.api(`/users/5aa3050e-9eeb-43d3-894d-138d7f541245/sendMail`).post({ message: mail }, (err, res) => {
        if (err) console.log(err);
        if (res) console.log(res);

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

function formatMailingList(emailAddressList, done) {
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
