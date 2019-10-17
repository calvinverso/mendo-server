let queryString = require("querystring");
const { Client } = require("pg");
let request = require("request");
const fetch = require("node-fetch");
require("dotenv").config();
var SpotifyWebApi = require("spotify-web-api-node");

/**
 * Sets up Spotify API credentials
 */
let redirect_uri = process.env.REDIRECT_URI || "http://localhost:8888/callback";
var spotifyAPI = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirect_uri
});

//Establishes connection to Heroku Postgres Database
const client = new Client({
  connectionString: `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`,
  ssl: true
});
client.connect();

var userId;
/**
 * Sets authorization token to access Spotify API
 * @param {string} access_token Spotify API access token
 * @param {string} refresh_token Spotify API refresh token
 */
async function init(access_token, refresh_token) {
  spotifyAPI.setAccessToken(access_token);
  spotifyAPI.setRefreshToken(refresh_token);

  await spotifyAPI.getMe().then(data => {
    console.log(data.body.id);
    userId = data.body.id;
  });
  setInterval(() => {
    this.refreshToken();
  }, 3000000);
}

/**
 *  Adds user to database if it does not exist
 * @param {string} id Spotify User ID
 * @param {{}} info Spotify User Data
 * @param {string} display_name Spotify User display name
 */
function addUserToDatabase(id, info, display_name) {
  client.query(
    "INSERT INTO users(id, data, display_name) SELECT $1, $2, $3 ON CONFLICT (id) DO NOTHING;",
    [id, info, display_name],
    err => {
      if (err) throw err;
    }
  );
}

async function getPlayHistory() {
  try {
    var response = await client.query(
      "SELECT jsonb_array_elements_text(play_history->'tracks') AS tracks FROM users WHERE id = $1",
      [userId]
    );
    return response;
  } catch (error) {
    console.error(error);
  }
}
async function getPlayHistoryUris(access_token) {
  await init(access_token, "");
  console.log("USER ID: " + userId);
  var playHistory = [];
  try {
    var results = await getPlayHistory();
    results.rows.map(item => {
      playHistory.push(JSON.parse(item.tracks).uri);
    });

    return playHistory;
  } catch (error) {
    console.error(error);
  }
}

function trackPlays() {
  function getRecentlyPlayed() {
    spotifyAPI.getMyRecentlyPlayedTracks({ limit: 50 }).then(
      async function(data) {
        var play_history = { tracks: [] };
        var lastPlayed;

        results = await getPlayHistory();
        results.rows.map((item, i) => {
          var track = JSON.parse(item.tracks);
          if (i == 0) {
            lastPlayed = track.played_at;
            console.log("LAST PLAYED AT: " + lastPlayed);
          }
          play_history.tracks.push(track);
        });
        data.body.items.map((item, i) => {
          var myTime = item.played_at;
          if (!lastPlayed || myTime > lastPlayed) {
            var track = {
              uri: item.track.uri,
              played_at: item.played_at,
              name: item.track.name,
              artist: item.track.artists[0].name
            };
            play_history.tracks.splice(i, 0, track);
          }
          client.query("UPDATE users SET play_history = $1 WHERE id = $2;", [
            play_history,
            userId
          ]);
        });
      },
      function(err) {
        console.log("Something went wrong!", err);
      }
    );
  }
  getRecentlyPlayed();
  setInterval(() => getRecentlyPlayed(), 60000);
}

function start(access_token, refresh_token, id) {
  init(access_token, refresh_token);
  trackPlays();
}

/**
 * Creates playlist description according to parameters established by user
 * @param {string} energy
 * @param {string} danceability
 * @param {string} valence
 * @param {string} popularity
 */
function createPlaylistDescription(energy, danceability, valence, popularity) {
  var desc = "A ";
  if (energy > 6) {
    desc = desc + "high energy, ";
  } else if (energy <= 4) {
    desc = desc + "low energy, ";
  } else {
    desc = desc + "mid energy, ";
  }
  if (danceability > 6) {
    desc = desc + "danceable, ";
  } else if (danceability <= 4) {
    desc = desc + "chill, ";
  }

  if (valence > 6) {
    desc = desc + "cheerful, ";
  } else if (valence <= 4) {
    desc = desc + "somber, ";
  }

  if (popularity > 6) {
    desc = desc + "trendy ";
  } else if (popularity <= 4) {
    desc = desc + "niche ";
  } else {
    desc = desc + "hot ";
  }
  desc = desc + " playlist created using Mendo";
  return desc;
}
async function getRecommendedTracks(
  target_energy,
  target_danceability,
  target_popularity,
  target_valence,
  access_token
) {
  var topArtists = [],
    topTracks = [],
    recommendedTracks = [];
  var playHistory = await getPlayHistoryUris(access_token);

  await spotifyAPI
    .getMyTopArtists({ limit: 5, time_range: "short_term" })
    .then(data => {
      data.body.items.map(item => {
        topArtists.push(item.id);
      });
    });

  await spotifyAPI
    .getMyTopTracks({ limit: 5, time_range: "short_term" })
    .then(data => {
      data.body.items.map(item => {
        topTracks.push(item.id);
      });
    });

  await fetch(
    "https://api.spotify.com/v1/recommendations?" +
      queryString.stringify({
        seed_artists: topArtists.toString(),
        //seed_tracks: topTracks.toString(),
        target_energy: target_energy,
        target_danceability: target_danceability,
        target_valence: target_valence,
        target_popularity: target_popularity,
        limit: 25
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
      data.tracks.map((track, i) => {
        console.log(i);
        console.log(track.name);

        if (!playHistory.includes(track.uri)) {
          console.log("Check this one out");
          recommendedTracks.push(track.uri);
        } else {
          console.log("You listened to that already");
        }
      })
    );
  console.log(userId);
  //console.log(recommendedTracks.toString());

  return recommendedTracks
}
module.exports = {
  /**
   * Authorizes and logs in to Spotify API
   * @param {Response} res /login endpoint response
   *
   */
  login(res) {
    res.redirect(
      "https://accounts.spotify.com/authorize?" +
        queryString.stringify({
          response_type: "code",
          client_id: process.env.SPOTIFY_CLIENT_ID,
          scope: process.env.SCOPE,
          redirect_uri
        })
    );
  },

  callback(req, res) {
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

        addUserToDatabase(info.id, info, info.display_name);
        start(access_token, refresh_token, info.id);
      });
    });
  },

  refreshToken() {
    spotifyAPI.refreshAccessToken().then(function(data) {
      console.log("ACCESS TOKEN REFRESHED");
      spotifyAPI.setAccessToken(data.body["access_token"]);
    });
  },
  async createThePlaylist(
    access_token,
    target_energy,
    target_danceability,
    target_valence,
    target_popularity,
    playlist_name
  ) {

    var recommendedTracks = await getRecommendedTracks(
      target_energy,
      target_danceability,
      target_valence,
      target_popularity,
      access_token
    );
    console.log(recommendedTracks)

    var description = createPlaylistDescription(
      target_energy,
      target_danceability,
      target_valence,
      target_popularity
    );

    try {
      var playlistId = {};
      await spotifyAPI
        .createPlaylist(userId, playlist_name)
        .then(async data => {
          playlistId = { id: data.body.id };
          console.log("PLAYLIST");
          console.log(data.body);

          await spotifyAPI.addTracksToPlaylist(data.body.id, recommendedTracks);
          await spotifyAPI.changePlaylistDetails(data.body.id, {
            description: description || "Created using Mendo"
          });
        });
      return playlistId;
    } catch (error) {
      console.error(error);
    }
  }
    /*
  async getPlayHistory() {
    try {
      var playHistory = { tracks: [] };
      var hey = { hey: "adios" };
      var hola = await client.query(
        "SELECT jsonb_array_elements_text(play_history->'tracks') AS tracks FROM users WHERE id = $1 LIMIT 15",
        [userId]
      );
      //console.log(hola)
      hola.rows.map(row => {
        // console.log(row.tracks)
        playHistory.tracks.push(JSON.parse(row.tracks));
      });
      console.log(playHistory);
      return playHistory;
    } catch (error) {
      console.error(error);
    }
  },
  */
};
