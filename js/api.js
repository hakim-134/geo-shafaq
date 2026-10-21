// Where the live-rooms API (the api-geo-shafaq repo) is. The domains are temporary;
// change them here. Anywhere else (localhost, a LAN address) the API is expected on the
// same host, port 8131. Solo play does not need the API; only rooms do.
const WEB_HOST = "geo.shafaq.uz";
const API_URL = "https://api.geo.shafaq.uz";

window.UZG_API =
  window.location.hostname === WEB_HOST
    ? API_URL
    : `${window.location.protocol}//${window.location.hostname}:8131`;
