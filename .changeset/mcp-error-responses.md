---
'@hono/mcp': minor
---

StreamableHTTPTransport now answers protocol errors with the statuses the MCP spec requires, and returns them instead of throwing:

- An unsupported `MCP-Protocol-Version` is answered `400 Bad Request` instead of `404`, so clients in session mode are no longer told their session expired.
- A repeated `Mcp-Session-Id` header (joined as `"a, b"`) is answered `400 Bad Request` instead of `404 Session not found`.
- Protocol-level refusals are returned from `handleRequest` as JSON-RPC error `Response`s instead of being thrown as `HTTPException`, so a host `app.onError` no longer replaces them.
