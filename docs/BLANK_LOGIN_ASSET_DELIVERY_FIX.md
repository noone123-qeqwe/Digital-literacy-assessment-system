# Blank login page: stalled asset downloads

The live HTML returned HTTP 200, but its main script and stylesheet did not
finish downloading. A fresh browser remained at an empty React root with no
script exception. The failure occurred before the login form or intro could run.

The custom compression wrapper returned the gzip input stream's backpressure
signal to a producer piping into the HTTP response. That producer then waited
for a response drain event, while the relevant drain belonged to gzip. Large,
compressible streams could stall when the producer outran compression.

Replace the custom write/end wrappers with Express's compression middleware,
pinned in the dependency lockfile. Keep the 1 KiB threshold and exclusions for
HEAD requests, byte ranges, explicit opt-out headers, bodyless statuses, event
streams, and non-compressible types. The middleware handles flow control and
encoding negotiation. Existing no-store HTML, immutable hashed-asset caching,
and retired-asset 404 handling remain in place.

The regression suite now serves large JavaScript and CSS fixtures through the
same compression and static-delivery stack, checking complete bodies with gzip
and identity requests. A fast, highly compressible script producer reproduces
the original stall: it timed out before this change and completes afterward.
The backend suite and production client build are also checked. Browser
verification uses a fresh session and intercepted API fixtures, without signing
into or changing real accounts.
