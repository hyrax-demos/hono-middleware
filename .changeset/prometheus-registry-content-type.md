---
'@hono/prometheus': patch
---

Send the registry's content type from `printMetrics`, so a registry created with `Registry.OPENMETRICS_CONTENT_TYPE` is served as OpenMetrics and the default registry is served as `text/plain; version=0.0.4; charset=utf-8` instead of plain `text/plain`.

The `registry` option is now typed to accept a registry using either the Prometheus or the OpenMetrics content type.
