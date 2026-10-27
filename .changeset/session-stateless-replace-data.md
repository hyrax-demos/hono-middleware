---
'@hono/session': patch
---

Replace the session data held in a stateless session cookie when the session is updated with `update()` or refreshed, instead of merging it with the previous cookie data, so keys removed from the session data no longer reappear on the next request.
