const credentials = {
  client: {
    id: process.env.APP_ID,
    secret: process.env.APP_PASSWORD,
  },
  auth: {
    tokenHost: 'https://login.microsoftonline.com/' + process.env.TENANT,
    authorizePath: '/oauth2/v2.0/authorize',
    tokenPath: '/oauth2/v2.0/token'
  }
};
const oauth2 = require('simple-oauth2').create(credentials);



async function getAccessToken()
{
    // Get the access token object.
    const tokenConfig = {
      scope: 'https://graph.microsoft.com/.default'
    };
    try {
      console.log(tokenConfig);
      const result = await oauth2.clientCredentials.getToken(tokenConfig);
      
      console.log(result);

      const accessToken = await oauth2.accessToken.create(result);
      
      return  accessToken.token.access_token;

    } catch (error) {
      console.log('Access Token Error', error.message);
      return null;
    }

}

exports.getAccessToken = getAccessToken;


