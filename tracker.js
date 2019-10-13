let express = require("express");
let request = require("request");
const bodyParser = require("body-parser");
let queryString = require("querystring");
const { Client } = require("pg");
const fetch = require("node-fetch");
require("dotenv").config();
var SpotifyWebApi = require("spotify-web-api-node");
var http = require("http");

//let app = express();

/*
setInterval(() => {
 */
let redirect_uri = process.env.TRACKING_URI || "http://localhost:8888/tracking";
var spotifyAPI = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirect_uri
});
var scopes = [
  "user-read-private",
  "user-top-read",
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state"
];
module.exports = {
  refreshToken(app, res) {
    //app.get("/", (req, res) => {
    var authURL = spotifyAPI.createAuthorizeURL(scopes, "state");
    console.log(authURL);
    res.redirect(authURL + "&redirect_uri=" + redirect_uri);
    //});

    app.get("/tracking", (req, res) => {
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
        console.log("The token expires in " + body["expires_in"]);
        console.log("The access token is " + body["access_token"]);
        console.log("The refresh token is " + body["refresh_token"]);
        spotifyAPI.setAccessToken(body["access_token"]);
        spotifyAPI.setRefreshToken(body["refresh_token"]);

        this.trackPlays();
        setInterval(() => {
          spotifyAPI.refreshAccessToken().then(function(data) {
            console.log("The access token has been refreshed!");

            // Save the access token so that it's used in future calls
            spotifyAPI.setAccessToken(data.body["access_token"]);
          });
        }, 3000000);
      });
    });
  },

  tokenRefresh(access_token, refresh_token, client, id) {
    spotifyAPI.setAccessToken(access_token);
    spotifyAPI.setRefreshToken(refresh_token);
    this.trackPlays(client, id);
    setInterval(() => {
      spotifyAPI.refreshAccessToken().then(function(data) {
        console.log("The access token has been refreshed!");

        // Save the access token so that it's used in future calls
        spotifyAPI.setAccessToken(data.body["access_token"]);
      });
    }, 3000000);
  },

  trackPlays(client, id) {
    function getRecentlyPlayed() {
      spotifyAPI.getMyRecentlyPlayedTracks({ limit: 50 }).then(
        function(data) {
          // Output items
          //console.log("Now Playing: ", data.body.item.name);
          var play_history = { tracks: [] };

          client.query(
            "SELECT jsonb_array_elements_text(play_history->'tracks') as tracks FROM users where id = $1",
            [id],
            (error, results) => {
              if (error) {
                throw error;
              }
              var lastPlayed;
              results.rows.map((item, i) => {
                var track = JSON.parse(item.tracks);
                if (i == 0) {
                  lastPlayed = track.played_at;
                  console.log("LAST PLAYED AT: " + lastPlayed);
                }
                play_history.tracks.push(track);
                console.log("TRACK " + i + " " + JSON.stringify(track));
              });

              data.body.items.map((item, i) => {
                var myTime = item.played_at;
                if (myTime > lastPlayed) {
                  var track = {
                    uri: item.track.uri,
                    played_at: item.played_at,
                    name: item.track.name,
                    artist: item.track.artists[0].name
                  };

                  play_history.tracks.splice(i, 0, track);
                }

                console.log(play_history);

                client.query(
                  "UPDATE users SET play_history = $1 WHERE id = $2;",
                  [play_history, id]
                );
              });
            }
          );
        },
        function(err) {
          console.log("Something went wrong!", err);
        }
      );
    }
    getRecentlyPlayed();
    setInterval(() => getRecentlyPlayed(), 60000);
  }
};

/*
spotifyAPI.getArtistAlbums('43ZHCT0cAZBISjO8DG9PnE').then(
    function(data) {
      console.log('Artist albums', data.body);
    },
    function(err) {
      console.error(err);
    }
  );
  */
/*
setInterval(() => {
  spotifyAPI.refreshAccessToken().then(
    function(data) {
      console.log("The access token has been refreshed!");

      // Save the access token so that it's used in future calls
      spotifyApi.setAccessToken(data.body.access_token);
    },
    function(err) {
      console.log("Could not refresh access token", err);
    }
  );
  spotifyAPI.getMyCurrentPlaybackState({}).then(
    function(data) {
      // Output items
      console.log("Now Playing: ", data.body.item.name);
    },
    function(err) {
      console.log("Something went wrong!", err);
    }
  );
}, 2000);

/*
let authRefresh = {
  url: "https://accounts.spotify.com/api/token",
  form: {
    grant_type: "refresh_token",
    refresh_token:
      "AQAkoiMkP1REnq4j0WAYoQ_LwNV-BMzW22UGGtK5Rl8Li15GqmpS31y2wjJuIFAUQ5kKJtR-VrHU5ndaaOnUaR6NHL4tbDEyYqacyBjL_202099boneXzRJFnGq9_FT7AAk5uQ",
    client_id: process.env.SPOTIFY_CLIENT_ID,
    client_secret: process.env.SPOTIFY_CLIENT_SECRET
  },
  json: true
};

function handleCurrently() {
  request.post(authRefresh, (err, res, body) => {
    var access_token =
      body.access_token ||
      "BQA0WJN_T9VbGpmZs3fZgfK1UxCgqxccBSD8w7b0_imV2zyKjhE-1mjfRomum5Rb97LbzAuiFIvuS9NCzlxAQApEqB2_UdpvrrkdOTSS9dtghpaWitQBmKpvnORMtbUHovckYReL6qS-JkQUw3EneWghMxjrcYkiV9Q10BK-aEYaYTpg";
    let currentlyPlaying = {
      url: "https://api.spotify.com/v1/me/player/currently-playing",
      headers: {
        Authorization: "Bearer " + access_token
      },
      success: response => {
        console.log(response);
      }
    };
    request.get(currentlyPlaying, (req, res, body) => {
      console.log("body" + body);
      // var info = JSON.parse(body);
      //var playing = info.is_playing;

      //
      //console.log(info.is_playing);
    });

    fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",

        Authorization: "Bearer " + access_token
      }
    })
      .then(res => res.json())
      .then(data => {
        //this.setState({ userData: data });
        console.log(data);
      });
  });
}

setInterval(() => handleCurrently(), 2000);

/*
    let auth = {
      url: "https://accounts.spotify.com/api/token",
      form: {
        code: null,
        redirect_uri,
        grant_type: "authorization_code",
        client_id: process.env.SPOTIFY_CLIENT_ID,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET
      },
      json: true
    };
    request.post(auth, (error, response, body) => {
      var access_token = body.access_token;
      fetch("https://api.spotify.com/v1/me/player/currently-playing", {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer " + access_token
        }
      })
        .then(res => res.json())
        .then(data => console.log(data.item.name));
    });
  }, 3000);
  */
