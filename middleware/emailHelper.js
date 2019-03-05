
var TournamentGroup = require("../models/tournamentGroup");
var UserTournament = require("../models/userTournament");
var User = require("../models/user");
var authHelper = require('../helpers/auth');
var graph = require('@microsoft/microsoft-graph-client');

var emailObj = {};



emailObj.sendRoundSummary = async function(tournamentGroup) {
    
    var mailingList = createMailingList(tournamentGroup); 
    
    const accessToken = await authHelper.getAccessToken();

    const mail = {
        subject: "Multiple Email Test",
        toRecipients: //mailingList,
            [{
                emailAddress: {
                    address: "slmcnaughton@yahoo.com"
                }
            }],
        body: {
            content: "This is a test to see if we can send the same email to multiple people at once",
            contentType: "text"
        }
    };
    
    console.log(mail);

    const client = graph.Client.init({
        authProvider: (done) => {
            done(null, accessToken);
        }
    });

    client.api(`/users/5aa3050e-9eeb-43d3-894d-138d7f541245/sendMail`).post({ message: mail }, (err, res) => {
        if (err) console.log(err);
        if (res) console.log(res);
        
    });
        
};


emailObj.sendPasswordRecovery = async function(req, token, user){
    const accessToken = await authHelper.getAccessToken();

    const mail = {
        subject: "McNaughton Madness Password Reset",
        toRecipients: [{
            emailAddress: {
                address: user.email
            }
        }],
        body: {
            content: 'Hello ' + user.firstName + ',\n\n' + 'You are receiving this because you have requested the reset of the password for your McNaughton Madness account.\n\n' +
                'Please click the following link, or paste this into your browser to complete the process:\n\n' +
                'http://' + req.headers.host + '/reset/' + token + '\n\n' +
                'If you did not request this, please ignore this email and your password will remain unchanged.\n',
            contentType: "text"
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
    req.flash('info', 'An e-mail has been sent to ' + user.email + ' with further instructions');
};

function createMailingList(tournamentGroup) {
    UserTournament.find( {"tournamentGroup.id" : tournamentGroup._id}).populate({path: "user.id"}).exec(function(err, foundUsers) {
        if(err) console.log(err);
        else {
            var emailAddressList = [];
            for (var i = 0; i < foundUsers.length; i++)
            {
                // console.log(userObjects[i].user.id.email);
                emailAddressList.push(foundUsers[i].user.id.email);
            }
            return formatMailingList(emailAddressList);
        }
    });
}

function formatMailingList(emailAddressList) {
    var formattedMailingList = [];
    for (var i = 0; i < emailAddressList.length; i++)
    {
        var address = {
            "emailAddress": {
                "address" : emailAddressList[i]
            }
        };
        formattedMailingList.push(address);
    }
    return formattedMailingList;
}




module.exports = emailObj;