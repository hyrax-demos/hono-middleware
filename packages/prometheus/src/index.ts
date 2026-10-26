import type { Context, MiddlewareHandler, TypedResponse } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type {
  DefaultMetricsCollectorConfiguration,
  OpenMetricsContentType,
  RegistryContentType,
} from 'prom-client'
import { Registry, collectDefaultMetrics as promCollectDefaultMetrics } from 'prom-client'
import { createStandardMetrics } from './standardMetrics'
import type { MetricOptions, CustomMetricsOptions } from './standardMetrics'

interface PrometheusOptions {
  registry?: Registry | Registry<OpenMetricsContentType>
  collectDefaultMetrics?: boolean | DefaultMetricsCollectorConfiguration<RegistryContentType>
  prefix?: string
  metricOptions?: Omit<CustomMetricsOptions, 'prefix' | 'register'>
}

const evaluateCustomLabels = (customLabels: MetricOptions['customLabels'], context: Context) => {
  const labels: Record<string, string> = {}

  for (const [key, fn] of Object.entries(customLabels ?? {})) {
    labels[key] = fn(context)
  }

  return labels
}

export const prometheus = (
  options?: PrometheusOptions
): {
  printMetrics: (
    c: Context
  ) => Promise<Response & TypedResponse<string, ContentfulStatusCode, 'text'>>
  registerMetrics: MiddlewareHandler
} => {
  const {
    registry = new Registry(),
    collectDefaultMetrics = false,
    prefix = '',
    metricOptions,
  } = options ?? {}

  if (collectDefaultMetrics) {
    promCollectDefaultMetrics({
      prefix,
      register: registry,
      ...(typeof collectDefaultMetrics === 'object' && collectDefaultMetrics),
    })
  }

  const metrics = createStandardMetrics({
    prefix,
    registry,
    customOptions: metricOptions,
  })

  return {
    printMetrics: async (c: Context) => {
      const res = c.text(await registry.metrics())
      // Label the body with the registry's own format (Prometheus text or OpenMetrics)
      res.headers.set('Content-Type', registry.contentType)
      return res
    },
    registerMetrics: createMiddleware(async (c, next) => {
      const timer = metrics.requestDuration?.startTimer()

      try {
        await next()
      } finally {
        const commonLabels = {
          method: c.req.method,
          route: c.req.routePath,
          status: c.res.status.toString(),
          ok: String(c.res.ok),
        }

        timer?.({
          ...commonLabels,
          ...evaluateCustomLabels(metricOptions?.requestDuration?.customLabels, c),
        })

        metrics.requestsTotal?.inc({
          ...commonLabels,
          ...evaluateCustomLabels(metricOptions?.requestsTotal?.customLabels, c),
        })
      }
    }),
  }
}
