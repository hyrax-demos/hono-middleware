---
'@hono/session': patch
---

Store exactly the new session data in the stateless session cookie when calling `session.update()` or refreshing an expired session, so keys left out of the new data no longer come back on the next request.
