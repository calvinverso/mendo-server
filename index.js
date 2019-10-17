let express = require("express");
let request = require("request");
const bodyParser = require("body-parser");
let queryString = require("querystring");
const { Client } = require("pg");
//const fetch = require("node-fetch");
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

redirect_uri = process.env.REDIRECT_URI || "http://localhost:8888/callback";

//Keeps the server running
setInterval(function() {
  http.get("http://mendo-server.herokuapp.com/");
}, 300000);

app.get("/login", function(request, response) {
  tracker.login(response);
});

/*
app.get("/playhistory", async (request, response) => {
  tracker.getPlayHistory().then(result => {
    console.log(result);
    response.send(result);
  });
});
*/

app.get("/createplaylist", (req, res) => {
  console.log(req.query);
  tracker
    .createThePlaylist(
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
  tracker.callback(req, res);
});

let port = process.env.PORT || 8888;
console.log(
  `Listening on port ${port}`
);
app.listen(port);
