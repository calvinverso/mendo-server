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

var userId;
var playHistory = [];
module.exports = {
  refreshToken() {
    spotifyAPI.refreshAccessToken().then(function(data) {
      console.log("ACCESS TOKEN REFRESHED");
      spotifyAPI.setAccessToken(data.body["access_token"]);
    });
  },
  async init(access_token, refresh_token) {
    spotifyAPI.setAccessToken(access_token);
    spotifyAPI.setRefreshToken(refresh_token);
    await spotifyAPI.getMe().then(data => {
      console.log(data.body.id);
      userId = data.body.id;
    });

    setInterval(() => {
      this.refreshToken();
    }, 3000000);
  },
  default(access_token, refresh_token, client, id) {
    this.init(access_token, refresh_token);
    this.trackPlays(client);
    this.createThePlaylist(client);
  },

  trackPlays(client) {
    function getRecentlyPlayed() {
      spotifyAPI.getMyRecentlyPlayedTracks({ limit: 50 }).then(
        function(data) {
          // Output items
          //console.log("Now Playing: ", data.body.item.name);
          var play_history = { tracks: [] };

          var lastPlayed;
          client.query(
            "SELECT jsonb_array_elements_text(play_history->'tracks') as tracks FROM users where id = $1",
            [userId],
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
                //console.log("TRACK " + i + " " + JSON.stringify(track));
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

                //console.log(play_history);

                client.query(
                  "UPDATE users SET play_history = $1 WHERE id = $2;",
                  [play_history, userId]
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
  },
  async getPlayHistoryUris(client) {
    try {
      await client.query(
        "SELECT jsonb_array_elements_text(play_history->'tracks') as tracks FROM users where id = $1",
        [userId],
        (error, results) => {
          if (error) {
            throw error;
          }

          results.rows.map(item => {
            playHistory.push(item.tracks.uri);
          });
        }
      );
    } catch (error) {
      console.error(error);
    }
  },
  async createThePlaylist(client) {
    this.getPlayHistoryUris(client);
    var topArtists = [],
      topTracks = [];
    await spotifyAPI.getMyTopArtists({ limit: 5 }).then(data => {
      //console.log(data.body.items);
      data.body.items.map(item => {
        // console.log(item.id);
        topArtists.push(item.id);
        //console.log("ARTIST")
      });
    });
    console.log(topArtists.toString());
    await spotifyAPI.getMyTopTracks({ limit: 5 }).then(data => {
      //console.log(data.body.items);
      data.body.items.map(item => {
        //console.log(item.id);
        topTracks.push(item.id);
        //console.log("TRACK")
      });
    });
    console.log(topTracks.toString());

    var recommendedTracks = [];
    await fetch(
      "https://api.spotify.com/v1/recommendations?" +
        queryString.stringify({
          //seed_artists: topArtists.toString(),
          seed_tracks: topTracks.toString()
        }),
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer " + spotifyAPI.getAccessToken()
        }
      }
    )
      .then(res => res.json())
      .then(data =>
        data.tracks.map(track => {
          console.log(track.name);

          if (!playHistory.includes(track.uri)) {
            console.log("doesnt exist");
            recommendedTracks.push(track.uri);
          } else {
            console.log("you listened to that already");
          }
        })
      );
    console.log(userId);
    console.log(recommendedTracks.toString());
    try {
      await spotifyAPI
        .createPlaylist(userId, "First Mendo Playlist")
        .then(async data => {
          var playlistId = data.body.id;
          console.log(playlistId);
          await spotifyAPI.addTracksToPlaylist(playlistId, recommendedTracks);
        });
    } catch (error) {
      console.error(error);
    }

    /*
    spotifyAPI
      .getRecommendations({ seed_artists: topArtists.toString(), seed_tracks: topTracks.toString() })
      .then(data => {
        console.log("RECOMMENDATIONS");
        console.log(data);
      })
      .catch(console.log("sorry bro"));
      */
  }
};
