#!/usr/bin/env bash
# Generates tonal placeholder photos. Safe to delete once real photos are in.
set -euo pipefail
cd "$(dirname "$0")/.."
mk() { # out w h label seed tone
  convert -seed "$5" -size "$2x$3" plasma:"gray$6"-"gray$(( $6 / 3 ))" -colorspace gray -blur 0x14 \
    -attenuate 0.35 +noise Gaussian -colorspace gray \
    -fill '#8F897F' -font DejaVu-Sans-Mono -pointsize $(( $2 / 40 )) -gravity southwest \
    -annotate +$(( $2 / 24 ))+$(( $2 / 24 )) "$4" -quality 82 "$1"
}
mk src/assets/portrait.jpg 1280 1600 "[ PORTRAIT — REPLACE src/assets/portrait.jpg ]" 7 22
i=0
for dims in 1280x1600 1600x1067 1067x1600 1400x1400 1600x1067 1280x1600 1600x1067 1067x1600 1280x1600; do
  i=$((i+1)); n=$(printf %02d $i)
  mk "src/photos/digital/placeholder-$n.jpg" "${dims%x*}" "${dims#*x}" "[ DIGITAL $n ]" $((i*13)) $(( 18 + (i*7)%16 ))
done
for r in 01 02; do
  for f in 1 2 3 4 5; do
    mk "src/photos/film/roll-$r/frame-0$f.jpg" 1500 1000 "[ ROLL $r · FRAME 0$f ]" $((f*31 + ${r#0}*7)) $(( 16 + (f*5)%14 ))
  done
done
