#!/usr/bin/env bash
# Builds static/tiles/uzbekistan.pmtiles: the basemap of Uzbekistan (and a little around it),
# cut from Protomaps' daily OpenStreetMap build. About 155 MB; it goes to the CDN, and
# browsers read only the tiles they need (HTTP range requests).
#
#   scripts/tiles.sh              # yesterday's build
#   scripts/tiles.sh 20261021     # a given day
#
# Needs the pmtiles CLI: go install github.com/protomaps/go-pmtiles@latest
set -euo pipefail
cd "$(dirname "$0")/.."
day=${1:-$(date -d yesterday +%Y%m%d)}
pmtiles=$(command -v pmtiles || command -v go-pmtiles || echo "$HOME/go/bin/go-pmtiles")
mkdir -p static/tiles
# the region is the country's border, simplified and widened by ~15 km
"$pmtiles" extract "https://build.protomaps.com/$day.pmtiles" static/tiles/uzbekistan.pmtiles \
  --region=scripts/uzbekistan-region.geojson --maxzoom=14
ls -lh static/tiles/uzbekistan.pmtiles
