# Mobile account recovery interface

The shared password reset, verification, and account recovery card uses a compact
layout with readable mobile type, 16px input text, and touch controls at least
44px square. Password reset retains independent visibility controls. Custom Copy
and Paste buttons are removed; native text selection, keyboard shortcuts, and
the browser's touch-and-hold menu remain available.
Short screens can scroll to every field and action without horizontal overflow.

Recovery requests show accessible inline feedback. Temporary service and network
failures preserve entered passwords and allow retrying. Expired links offer a new
link action. Successful password resets clear the fields and offer sign-in.
Repeated submit taps are locked, and one-time link requests are reused during
React Strict Mode's effect replay.

The API interceptor suppresses floating error notifications only on the four
account recovery routes, including their background status/session reads, or for
requests explicitly handled inline. Errors are still rejected; session handling
and notifications elsewhere remain in place. This improves error presentation;
it does not repair or conceal a server outage.

Validation uses isolated browser fixtures and clipboard stubs, with no real
password resets, email delivery, clipboard access, or account changes. Checks cover
320px through 1365px layouts, short landscape and keyboard-height viewports,
visibility controls, clipboard permissions, input validation, retained values,
duplicate taps, expired links, successful completion, route changes, one-time
links, background service failures, and page-load recovery. Frontend lint and
production build are also required.
