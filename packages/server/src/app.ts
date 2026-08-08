import { envConfig, nonNullable } from "@cascateer/lib";
import cors from "cors";
import express, { ErrorRequestHandler, json } from "express";
import session from "express-session";
import { StatusCodes } from "http-status-codes";
import { resolve } from "path";
import { RegisterRoutes } from "../build/routes";
import tsoaConfig from "../tsoa.json";
import { SpotifyService } from "./Spotify.service";
import { YoutubeService } from "./Youtube.service";

const { SPOTIFY_REDIRECT_URI, YOUTUBE_REDIRECT_URI } = envConfig();

const [APP_HOST, APP_PORT] = tsoaConfig.spec.host.split(":");

const app = express();

app.use(json());
app.use(
  cors({
    credentials: true,
    origin: true,
  }),
);
app.use(
  session({
    resave: false,
    saveUninitialized: false,
    secret: "secret secret",
  }),
);

app.set("view engine", "ejs");
app.set("views", resolve(__dirname, "views"));

app.get(new URL(nonNullable(SPOTIFY_REDIRECT_URI)).pathname, (req, res) => {
  const code = req.query.code?.toString();

  if (code != null) {
    SpotifyService.codes.next(code);
  }

  res.render("oauth/auth-callback", { code: req.query.code });
});

app.get(new URL(nonNullable(YOUTUBE_REDIRECT_URI)).pathname, (req, res) => {
  const code = req.query.code?.toString();

  if (code != null) {
    YoutubeService.codes.next(code);
  }

  res.render("oauth/auth-callback", { code: req.query.code });
});

RegisterRoutes(app);

app.use(<ErrorRequestHandler>function (error, req, res, next) {
  console.error(error);

  res
    .status(StatusCodes.INTERNAL_SERVER_ERROR)
    .send(error.stack ?? error.message);
});

app.listen(+nonNullable(APP_PORT), nonNullable(APP_HOST), () =>
  console.log(`Server is running on http://${APP_HOST}:${APP_PORT}`),
);
