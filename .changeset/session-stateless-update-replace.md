---
'@hono/session': patch
---

In stateless cookie mode, update() and get(refresh) now replace the session data instead of merging it, so removed keys no longer reappear on the next request.
