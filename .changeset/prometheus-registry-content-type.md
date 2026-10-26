---
'@hono/prometheus': patch
---

Send the registry's content type from `printMetrics`, so an OpenMetrics registry is served as `application/openmetrics-text` and the default registry as `text/plain; version=0.0.4`. The `registry` option now also accepts a registry typed with the OpenMetrics content type.
