---
'@hono/prometheus': patch
---

`printMetrics` now sends the registry's `contentType` as the response's Content-Type, so the default registry is served as `text/plain; version=0.0.4; charset=utf-8` and a registry set to `Registry.OPENMETRICS_CONTENT_TYPE` is served with the OpenMetrics type. The `registry` option now accepts a registry of either content type.
