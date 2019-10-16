let express = require("express");
let request = require("request");
const bodyParser = require("body-parser");
let queryString = require("querystring");
const { Client } = require("pg");
const fetch = require("node-fetch");
var SpotifyWebApi = require("spotify-web-api-node");
var http = require("http");

let app = express();
var tracker = require("./tracker.js");

require("dotenv").config();

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const client = new Client({
  connectionString: `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`,
  ssl: true
});

client.connect();

redirect_uri = process.env.REDIRECT_URI || "http://localhost:8888/callback";

setInterval(function() {
  http.get("http://mendo-server.herokuapp.com/");
}, 300000);

app.get("/login", function(req, res) {
  //tracker.refreshToken(app,res);
  res.redirect(
    "https://accounts.spotify.com/authorize?" +
      queryString.stringify({
        response_type: "code",
        client_id: process.env.SPOTIFY_CLIENT_ID,
        scope: process.env.SCOPE,
        redirect_uri
      })
  );
});

app.get("/playhistory", async (req, res) => {
  tracker.getPlayHistory(client).then(result => {
    console.log(result);
    res.send(result);
  });
  //console.log(ans);
  //res.send(ans);
});

app.get("/createplaylist", (req, res) => {
  tracker
    .createThePlaylist(
      client,
      req.query.access_token,
      req.query.target_energy,
      req.query.target_danceability,
      req.query.target_valence,
      req.query.target_popularity,
      req.query.playlist_name
    )
    .then(result => {
      console.log(result);
      res.send(result);
    });
});

app.get("/callback", (req, res) => {
  //request.post(auth, (error, response, body) => {
  //access_token = body.access_token
  let auth = {
    url: "https://accounts.spotify.com/api/token",
    form: {
      code: req.query.code || null,
      redirect_uri,
      grant_type: "authorization_code",
      client_id: process.env.SPOTIFY_CLIENT_ID,
      client_secret: process.env.SPOTIFY_CLIENT_SECRET
    },
    json: true
  };
  request.post(auth, (error, response, body) => {
    var access_token = body.access_token;
    var refresh_token = body.refresh_token;

    let uri = process.env.FRONTEND_URI || "http://localhost:3000";
    res.redirect(uri + "?access_token=" + access_token);
    //res.send(refresh_token)
    //res.json(tracker.getPlayHistory())
    let userInfo = {
      url: "https://api.spotify.com/v1/me",
      headers: {
        Authorization: "Bearer " + access_token
      },
      success: response => {
        console.log(response);
      }
    };
    request.get(userInfo, function(err, res, body) {
      var info = JSON.parse(body);
      console.log(info.id);

      client.query(
        "INSERT INTO users(id, data, display_name) SELECT $1, $2, $3 on conflict (id) do nothing;",
        [info.id, info, info.display_name],
        err => {
          if (err) throw err;
        }
      );

      tracker.default(access_token, refresh_token, client, info.id);
    });
  });
});
//});

let port = process.env.PORT || 8888;
console.log(
  `Listening on port ${port}. Go /login to initiate authentication flow.`
);
app.listen(port);
