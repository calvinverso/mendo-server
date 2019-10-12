let express = require("express");
let request = require("request");
const bodyParser = require("body-parser");
let querystring = require("querystring");
const { Client } = require("pg");

let app = express();

require("dotenv").config();

let redirect_uri = process.env.REDIRECT_URI || "http://localhost:8888/callback";
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "YOUR-DOMAIN.TLD"); // update to match the domain you will make the request from
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

client.connect().then((res, req, err) => {
  console.log("CONNECTIOR ERROR " + err);
});

app.get("/", function(req, res, next) {
  res.send("hola");
  console.log("paso?");
  console.log(process.env.DATABASE_URL);
  console.log(process.env.DB_DATABASE);
  client.query(
    "CREATE TABLE books (ID SERIAL PRIMARY KEY, author VARCHAR(255) NOT NULL, title VARCHAR(255) NOT NULL);",
    (err, res) => {
      if (err) throw err;
      console.log("solo aqui");
      for (let row of res.rows) {
        console.log("paso?");
        console.log(JSON.stringify(row));
      }
      //client.end();
    }
  );
  next();
});

app.get("/login", function(req, res) {
  res.redirect(
    "https://accounts.spotify.com/authorize?" +
      querystring.stringify({
        response_type: "code",
        client_id:
          process.env.SPOTIFY_CLIENT_ID || "6a1792e23f7a48c8accf88c6d4991909",
        scope: "user-read-private user-read-email",
        redirect_uri
      })
  );
});

app.get("/callback", (req, res) => {
  let code = req.query.code || null;
  let authOptions = {
    url: "https://accounts.spotify.com/api/token",
    form: {
      code: code,
      redirect_uri,
      grant_type: "authorization_code"
    },
    headers: {
      Authorization:
        "Basic " +
        new Buffer(
          process.env.SPOTIFY_CLIENT_ID +
            ":" +
            process.env.SPOTIFY_CLIENT_SECRET
        ).toString("base64")
    },
    json: true
  };
  var access_token;
  request.post(authOptions, (error, response, body) => {
    access_token =
      body.access_token ||
      "BQChp7ERXJOglr9Y4uJTJ2Tb9omXCNLpAPO0M-jZ12XWwPciE2ahmcpXfEi4BA7hfl0Ilhg3ruRycDNqAW4gXzzvPMIqft8v3zedOdQ2bsD6xg7C9UG3uo5L4SL2cviZx0YlrnPp1qfCa2bROvCo9aHQqwKeNkiLPMXy";
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
      client.query(
        "INSERT INTO users (id,  data, display_name) VALUES ($1, $2, $3)",
        [info.id, info, info.display_name],
        (err, res) => {
          console.error(err);
          client.end();
        });
    });
  });
});

let port = process.env.PORT || 8888;
console.log(
  `Listening on port ${port}. Go /login to initiate authentication flow.`
);
app.listen(port);
