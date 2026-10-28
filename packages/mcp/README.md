# Hono MCP (Model Context Protocol)

Connect Hono to a Model Context Protocol (MCP) server over HTTP Streaming Transport.

## Streamable HTTP Transport

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPTransport } from '@hono/mcp'
import { Hono } from 'hono'

const app = new Hono()

// Your MCP server implementation
const mcpServer = new McpServer({
  name: 'my-mcp-server',
  version: '1.0.0',
})

// Initialize the transport
const transport = new StreamableHTTPTransport()

app.all('/mcp', async (c) => {
  if (!mcpServer.isConnected()) {
    // Connect the mcp with the transport
    await mcpServer.connect(transport)
  }

  return transport.handleRequest(c)
})

export default app
```

### Options

The `StreamableHTTPTransport` constructor accepts all options from the MCP SDK's `StreamableHTTPServerTransportOptions`, plus:

- **`strictAcceptHeader`** (default: `false`) — When `false` (the default), the transport accepts POST requests where the `Accept` header contains `application/json`, `text/event-stream`, or `*/*`. This improves compatibility with clients like Gemini CLI, Java MCP SDK, Open WebUI, and curl. When `true`, the transport enforces strict MCP spec compliance, requiring both `application/json` and `text/event-stream` in the `Accept` header.
- **`onsessiondisconnected`** — Optional callback invoked with the session ID when the standalone GET SSE stream disconnects. This does not close the session; clients can reconnect and resume it until they send `DELETE`.

```ts
// Permissive mode (default) — works with most HTTP clients
const transport = new StreamableHTTPTransport()

// Strict mode — requires fully spec-compliant Accept header
const transport = new StreamableHTTPTransport({ strictAcceptHeader: true })
```

### Error responses

`handleRequest` returns protocol-level refusals as `Response` objects with a JSON-RPC error body (`{ jsonrpc: '2.0', error: { code, message }, id: null }`) instead of throwing them. Your route returns them as they are, so a host `app.onError` handler does not change their status or body.

| Status | When                                                                                                                                                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | Unsupported or repeated `MCP-Protocol-Version`; missing or repeated `Mcp-Session-Id`; server not initialized; server already initialized; more than one initialize request in a batch; a request body that cannot be parsed as JSON-RPC |
| `403`  | `Host` or `Origin` header rejected by DNS rebinding protection (`enableDnsRebindingProtection`)                                                                                                                                         |
| `404`  | `Mcp-Session-Id` does not match the transport's session. Per the MCP spec, a client that receives this starts a new session with a new `InitializeRequest`                                                                              |
| `405`  | Unsupported HTTP method; the response carries an `Allow: GET, POST, DELETE` header                                                                                                                                                      |
| `406`  | `Accept` header does not allow the response type (see `strictAcceptHeader`)                                                                                                                                                             |
| `409`  | A standalone GET SSE stream is already open for the session                                                                                                                                                                             |
| `415`  | POST `Content-Type` is not `application/json`                                                                                                                                                                                           |

The session checks (`Mcp-Session-Id`, initialization state) apply only when `sessionIdGenerator` is set. Errors raised while an SSE stream is already being written (for example a failure replaying events from the `eventStore`) happen after the response has started, so they are not HTTP responses.

## Auth

The simplest way to setup MCP Auth when using 3rd party auth providers.

```ts
import { Hono } from 'hono'
import { simpleMcpAuthRouter } from '@hono/mcp'

const app = new Hono()

app.route(
  '/',
  simpleMcpAuthRouter({
    issuer: '[auth provider domain]',
    resourceServerUrl: new URL('http://localhost:3000/mcp'),
  })
)

// ...
// Logic to connect with the transport
```

For implementing custom auth, check out the docs - <https://honohub.dev/docs/hono-mcp>

## Author

Aditya Mathur <https://github.com/mathuraditya724>

## License

MIT
