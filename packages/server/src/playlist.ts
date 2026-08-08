import { YoutubeService } from "./Youtube.service";

new YoutubeService()
  .createPlaylist({
    title: "Megadeth - Anthology",
    privacyStatus: "unlisted",
    templatePlaylistId: "OLAK5uy_nwYO77auM3UBUr8MROz59UL46-gKrW-GM",
  })
  .then(console.log);
