import type { Context, Env, Handler, Input, TypedResponse, ValidationTargets } from 'hono'
import { validator } from 'hono/validator'
import type {
  GenericSchema,
  GenericSchemaAsync,
  InferInput,
  InferOutput,
  SafeParseResult,
} from 'valibot'
import { safeParseAsync } from 'valibot'

/**
 * Body of the default 400 response. For `header` validation the `cookie` header is removed from it.
 */
export type FailedResponse<T extends GenericSchema | GenericSchemaAsync> =
  SafeParseResult<T> extends infer U
    ? Response & TypedResponse<U extends { success: false } ? U : never, 400, 'json'>
    : never

type MustBeResponse<T, Schema extends GenericSchema | GenericSchemaAsync> =
  T extends Promise<infer U>
    ? Promise<MustBeResponse<U, Schema>>
    : T extends Response | TypedResponse<unknown>
      ? T
      : never

export type Hook<
  T extends GenericSchema | GenericSchemaAsync,
  E extends Env,
  P extends string,
  Target extends keyof ValidationTargets = keyof ValidationTargets,
  R extends
    void | Response | TypedResponse<unknown> | Promise<Response | TypedResponse<unknown> | void> =
    void | Response | TypedResponse<unknown> | Promise<Response | TypedResponse<unknown> | void>,
> = (
  result: SafeParseResult<T> & {
    target: Target
  },
  c: Context<E, P>
) => R

type HasUndefined<T> = undefined extends T ? true : false

const RESTRICTED_DATA_FIELDS = {
  header: ['cookie'],
}

const REDACTED = '[redacted]'

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const omitFields = (value: unknown, fields: string[]): unknown =>
  isPlainObject(value)
    ? Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key)))
    : value

const redact = (text: unknown, secrets: string[]): unknown =>
  typeof text === 'string'
    ? secrets.reduce((acc, secret) => acc.split(secret).join(REDACTED), text)
    : text

const sanitizeIssue = (issue: unknown, fields: string[]): unknown => {
  if (!isPlainObject(issue)) {
    return issue
  }

  const secrets: string[] = []
  let restrictedPath = false
  const path = Array.isArray(issue.path)
    ? issue.path.map((item: unknown) => {
        if (!isPlainObject(item)) {
          return item
        }
        if (isPlainObject(item.input)) {
          for (const field of fields) {
            const secret = item.input[field]
            if (typeof secret === 'string' && secret !== '') {
              secrets.push(secret)
            }
          }
        }
        const copy: Record<string, unknown> = { ...item, input: omitFields(item.input, fields) }
        if (typeof item.key === 'string' && fields.includes(item.key)) {
          restrictedPath = true
          return Object.fromEntries(Object.entries(copy).filter(([key]) => key !== 'value'))
        }
        return copy
      })
    : issue.path

  const sanitized: Record<string, unknown> = {
    ...issue,
    input: omitFields(issue.input, fields),
    ...(path !== undefined && { path }),
    ...(Array.isArray(issue.issues) && {
      issues: issue.issues.map((subIssue: unknown) => sanitizeIssue(subIssue, fields)),
    }),
  }

  if (!restrictedPath) {
    return sanitized
  }

  return Object.fromEntries(
    Object.entries(sanitized)
      .filter(([key]) => key !== 'input')
      .map(([key, value]) =>
        key === 'message' || key === 'received' ? [key, redact(value, secrets)] : [key, value]
      )
  )
}

/**
 * Returns a copy of `result` without the fields restricted for `target`.
 * The original result is not modified.
 */
const sanitizeResult = <T>(result: T, target: keyof ValidationTargets): T => {
  if (!(target in RESTRICTED_DATA_FIELDS) || !isPlainObject(result)) {
    return result
  }
  const fields = RESTRICTED_DATA_FIELDS[target as keyof typeof RESTRICTED_DATA_FIELDS]

  return {
    typed: result.typed,
    success: result.success,
    output: omitFields(result.output, fields),
    issues: Array.isArray(result.issues)
      ? result.issues.map((issue: unknown) => sanitizeIssue(issue, fields))
      : result.issues,
  } as T
}

export const vValidator = <
  T extends GenericSchema | GenericSchemaAsync,
  Target extends keyof ValidationTargets,
  E extends Env,
  P extends string,
  In = InferInput<T>,
  Out = InferOutput<T>,
  I extends Input = {
    in: HasUndefined<In> extends true
      ? {
          [K in Target]?: In extends ValidationTargets[K]
            ? In
            : { [K2 in keyof In]?: ValidationTargets[K][K2] }
        }
      : {
          [K in Target]: In extends ValidationTargets[K]
            ? In
            : { [K2 in keyof In]: ValidationTargets[K][K2] }
        }
    out: { [K in Target]: Out }
  },
  V extends I = I,
  R extends
    void | Response | TypedResponse<unknown> | Promise<Response | TypedResponse<unknown> | void> =
    FailedResponse<T>,
>(
  target: Target,
  schema: T,
  hook?: Hook<T, E, P, Target, R>
): Handler<E, P, V, MustBeResponse<R, T>> =>
  // @ts-expect-error not typed well
  validator(target, async (value, c) => {
    const result = await safeParseAsync(schema, value)

    if (hook) {
      const hookResult = await hook({ ...result, target }, c)
      if (hookResult) {
        if (hookResult instanceof Response) {
          return hookResult
        }

        if ('response' in hookResult) {
          return hookResult.response
        }
      }
    }

    if (!result.success) {
      return c.json(sanitizeResult(result, target), 400)
    }

    return result.output
  })
