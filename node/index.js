/*
Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at

    http://aws.amazon.com/apache2.0/

or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

*/

require('dotenv').config();
require('https').globalAgent.options.rejectUnauthorized = false;

// Define our dependencies
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const OAuth2Strategy = require('passport-oauth').OAuth2Strategy;
const request = require('request');
const handlebars = require('handlebars');
const TwitchJS = require('twitch-js').default;
const fetch = require('node-fetch');

// Define our constants, you will change these with your own
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET = process.env.TWITCH_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;
const CALLBACK_URL = 'http://localhost:3000/auth/twitch/callback'; // You can run locally with - http://localhost:3000/auth/twitch/callback

let test = 'false';

// Initialize Express and middleware
const app = express();
app.use(
  session({ secret: SESSION_SECRET, resave: false, saveUninitialized: false })
);
app.use(express.static('public'));
app.use(passport.initialize());
app.use(passport.session());

// Override passport profile function to get user profile from Twitch API
OAuth2Strategy.prototype.userProfile = function(accessToken, done) {
  const options = {
    url: 'https://api.twitch.tv/helix/users',
    method: 'GET',
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      Accept: 'application/vnd.twitchtv.v5+json',
      Authorization: 'Bearer ' + accessToken
    }
  };

  request(options, function(error, response, body) {
    const parsedBody = JSON.parse(body);
    if (response && response.statusCode == 200) {
      done(null, JSON.parse(body).data[0]);
    } else {
      done(JSON.parse(body));
    }
  });
};

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  done(null, user);
});

passport.use(
  'twitch',
  new OAuth2Strategy(
    {
      authorizationURL: 'https://id.twitch.tv/oauth2/authorize',
      tokenURL: 'https://id.twitch.tv/oauth2/token',
      clientID: TWITCH_CLIENT_ID,
      clientSecret: TWITCH_SECRET,
      callbackURL: CALLBACK_URL,
      state: true
    },
    function(accessToken, refreshToken, profile, done) {
      profile.accessToken = accessToken;
      profile.refreshToken = refreshToken;

      // Securely store user profile in your DB
      //User.findOrCreate(..., function(err, user) {
      //  done(err, user);
      //});

      done(null, profile);
    }
  )
);

// Set route to start OAuth link, this is where you define scopes to request
app.get(
  '/auth/twitch',
  passport.authenticate('twitch', { scope: 'user_read chat:read chat:edit' })
);

// Set route for OAuth redirect
app.get(
  '/auth/twitch/callback',
  passport.authenticate('twitch', {
    successRedirect: '/',
    failureRedirect: '/'
  })
);

// Define a simple template to safely generate HTML with values from user's profile
const template = handlebars.compile(`
<html><head><title>Twitch Auth Sample</title></head>
<table>
    <tr><th>Access Token</th><td>{{accessToken}}</td></tr>
    <tr><th>Refresh Token</th><td>{{refreshToken}}</td></tr>
    <tr><th>Display Name</th><td>{{display_name}}</td></tr>
    <tr><th>Description</th><td>{{description}}</td></tr>
    <tr><th>Profile Image</th><td><img src="{{profile_image_url}}" width="36" /></td></tr>
    <tr><th>Chat Message Sent</th><td>{{chatSent}}</td></tr>
</table></html>`);

// If user has an authenticated session, display it, otherwise display link to authenticate
app.get('/', function(req, res) {
  if (req.session && req.session.passport && req.session.passport.user) {
    req.session.passport.user.chatSent = 'false';
    const token = req.session.passport.user.accessToken;
    const username = req.session.passport.user.display_name;
    const { chat, chatConstants } = new TwitchJS({ token, username });
    chatThings(chat, req.session.passport.user).then(() => {
      // console.log('test in app.get: ', test);
      // if (test === 'true') {
      //   console.log('setting user.chatSent to true');
      //   req.session.passport.user.chatSent = 'true';
      // }
      res.send(template(req.session.passport.user));
    });
  } else {
    res.send(
      '<html><head><title>Twitch Auth Sample</title></head><a href="/auth/twitch">Connect with Twitch</html>'
    );
  }
});

app.listen(3000, function() {
  console.log('Twitch auth sample listening on port 3000!');
});

const chatThings = async (chat, user) => {
  await chat.connect();
  chat.join(user.display_name);
  await chat.say(user.display_name, 'Example chat message');
  //test = 'true';
  user.chatSent = 'true';
};
