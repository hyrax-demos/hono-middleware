---
'@hono/prometheus': patch
---

Send the registry's content type as the `Content-Type` of the `printMetrics` response, so an OpenMetrics registry is served as `application/openmetrics-text` and the default registry as `text/plain; version=0.0.4; charset=utf-8`.

The `registry` option's type now also accepts a `Registry<OpenMetricsContentType>`.
