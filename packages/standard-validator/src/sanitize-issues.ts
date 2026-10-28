import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ValidationTargets } from 'hono'

const RESTRICTED_DATA_FIELDS = {
  header: ['cookie'],
}

/**
 * Sanitizes validation issues by removing sensitive data fields from error messages.
 *
 * This function removes potentially sensitive information (like cookies) from validation
 * error messages before they are returned to the client. It handles different validation
 * library formats based on the vendor string.
 *
 * @param issues - Array of validation issues from Standard Schema validation
 * @param vendor - The validation library vendor identifier (e.g., 'arktype', 'valibot')
 * @param target - The validation target being processed ('header', 'json', etc.)
 * @returns Sanitized array of validation issues with sensitive data removed
 *
 * @example
 * ```ts
 * const issues = [{ message: 'Invalid header', data: { cookie: 'secret' } }]
 * const sanitized = sanitizeIssues(issues, 'arktype', 'header')
 * // Returns issues with cookie field removed from data
 * ```
 */
export function sanitizeIssues(
  issues: readonly StandardSchemaV1.Issue[],
  vendor: string,
  target: keyof ValidationTargets
): readonly StandardSchemaV1.Issue[] {
  if (!(target in RESTRICTED_DATA_FIELDS)) {
    return issues
  }

  const restrictedFields =
    RESTRICTED_DATA_FIELDS[target as keyof typeof RESTRICTED_DATA_FIELDS] || []

  // Redact first: it reads the restricted raw values from the issues' `data`,
  // which sanitizeArktypeIssues strips.
  let sanitized = redactRestrictedPathIssues(issues, vendor, restrictedFields)

  if (vendor === 'arktype') {
    sanitized = sanitizeArktypeIssues(sanitized, restrictedFields)
  }

  if (vendor === 'valibot') {
    sanitized = sanitizeValibotIssues(sanitized, restrictedFields)
  }

  return sanitized
}

/**
 * Removes restricted fields from the validated input before it is echoed back
 * in the default error response.
 *
 * For targets listed in `RESTRICTED_DATA_FIELDS` (the `cookie` header for the
 * `header` target) a plain-object `value` is returned as a new object without
 * those keys. Any other target or value is returned unchanged.
 *
 * @param value - The validated input (e.g. the request header record)
 * @param target - The validation target being processed ('header', 'json', etc.)
 * @returns `value`, or a copy of it without the restricted keys
 */
export function sanitizeData<T>(value: T, target: keyof ValidationTargets): T {
  if (!(target in RESTRICTED_DATA_FIELDS) || !isPlainObject(value)) {
    return value
  }

  const restrictedFields = RESTRICTED_DATA_FIELDS[target as keyof typeof RESTRICTED_DATA_FIELDS]

  return omitKeys(value, restrictedFields) as T
}

const REDACTED = '[redacted]'
const REDACTED_STRING_FIELDS = ['message', 'received', 'actual', 'problem', 'expected']

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function omitKeys(obj: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => !keys.includes(key)))
}

function pathItemKey(item: unknown): unknown {
  return isRecord(item) ? item['key'] : item
}

function redactWith(text: string, rawValues: ReadonlySet<string>): string {
  let result = text
  for (const rawValue of rawValues) {
    if (rawValue !== '') {
      result = result.split(rawValue).join(REDACTED)
    }
  }
  return result
}

/**
 * Redacts the nested `issues` of an issue whose path reaches a restricted field:
 * each sub-issue is copied without `input`, and `rawValues` (plus the sub-issue's
 * own string `input`) are redacted in its string fields, recursively.
 */
function redactSubIssues(subIssues: readonly unknown[], rawValues: ReadonlySet<string>): unknown[] {
  return subIssues.map((subIssue) => {
    if (!isRecord(subIssue)) {
      return subIssue
    }
    const values = new Set(rawValues)
    const input = subIssue['input']
    if (typeof input === 'string') {
      values.add(input)
    }
    return Object.fromEntries(
      Object.entries(subIssue)
        .filter(([field]) => field !== 'input')
        .map(([field, value]) => {
          if (field === 'issues' && Array.isArray(value)) {
            return [field, redactSubIssues(value, values)]
          }
          if (REDACTED_STRING_FIELDS.includes(field) && typeof value === 'string') {
            return [field, redactWith(value, values)]
          }
          return [field, value]
        })
    )
  })
}

/**
 * Redacts the raw value of issues whose path points at a restricted field
 * (e.g. a schema that validates the `cookie` header itself). Such issues can
 * carry the raw value in `input`, in path items' `value`/`input`, in arktype's
 * `data`, or inside `message`/`received`. Issues are copied, keeping their
 * prototype so that e.g. arktype's `toJSON` keeps working.
 */
function redactRestrictedPathIssues(
  issues: readonly StandardSchemaV1.Issue[],
  vendor: string,
  restrictedFields: readonly string[]
): readonly StandardSchemaV1.Issue[] {
  const reachesRestricted = (issue: StandardSchemaV1.Issue): boolean => {
    const key = pathItemKey(issue.path?.[0])
    return typeof key === 'string' && restrictedFields.includes(key)
  }

  const redactIssue = (
    issue: StandardSchemaV1.Issue,
    inheritedValues: ReadonlySet<string>
  ): StandardSchemaV1.Issue => {
    const raw = issue as unknown as Record<string, unknown>
    const rawValues = new Set<string>(inheritedValues)

    // arktype's own `input` is its error context, not the validated value.
    const dropInput = vendor !== 'arktype'
    if (dropInput && typeof raw['input'] === 'string') {
      rawValues.add(raw['input'])
    }
    if (vendor === 'arktype' && typeof raw['data'] === 'string') {
      rawValues.add(raw['data'])
    }

    // Array.from rather than .map: arktype paths are an Array subclass. Only used
    // when some path item is an object (valibot); plain key paths are kept as is.
    const path = Array.from(issue.path ?? [], (item) => {
      if (!isRecord(item)) {
        return item
      }
      const key = item['key']
      if (typeof item['value'] === 'string') {
        rawValues.add(item['value'])
      }
      if (isRecord(item['input']) && typeof key === 'string') {
        const restrictedValue = item['input'][key]
        if (typeof restrictedValue === 'string') {
          rawValues.add(restrictedValue)
        }
      }
      const rest = omitKeys(item, ['value'])
      return isRecord(item['input'])
        ? { ...rest, input: omitKeys(item['input'], restrictedFields) }
        : rest
    })

    const ownFields = Object.fromEntries(
      Object.entries(raw).filter(([field]) => !(dropInput && field === 'input'))
    )
    const proto = Object.getPrototypeOf(issue) as object | null
    const redacted = Object.create(proto) as Record<string, unknown>
    // defineProperty also shadows getter-only fields on the prototype
    const setOwn = (field: string, value: unknown) => {
      Object.defineProperty(redacted, field, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      })
    }
    for (const [field, value] of Object.entries(ownFields)) {
      setOwn(field, value)
    }
    if (issue.path?.some(isRecord)) {
      setOwn('path', path)
    }
    if (vendor === 'arktype' && typeof raw['data'] === 'string') {
      setOwn('data', REDACTED)
    }
    // arktype's union errors nest one error per branch in `errors`, each with
    // its own path (here also reaching the restricted field).
    const arktypeErrors =
      vendor === 'arktype' && Array.isArray(raw['errors'])
        ? Array.from(raw['errors'] as StandardSchemaV1.Issue[], (error) =>
            sanitizeIssue(error, rawValues)
          )
        : undefined
    if (arktypeErrors) {
      setOwn('errors', arktypeErrors)
    }
    // arktype spreads its error context into toJSON; drop raw-value fields from it.
    if (vendor === 'arktype' && isRecord(raw['input'])) {
      const context = omitKeys(raw['input'], ['data', 'actual', 'problem', 'message'])
      setOwn('input', arktypeErrors ? { ...context, errors: arktypeErrors } : context)
    }

    const redactString = (text: string): string => redactWith(text, rawValues)

    for (const field of REDACTED_STRING_FIELDS) {
      const text = redacted[field]
      if (typeof text === 'string') {
        const replaced = redactString(text)
        if (replaced !== text) {
          setOwn(field, replaced)
        }
      }
    }

    // valibot's nested sub-issues (e.g. from `union`) have no path of their own
    // but carry the same raw value in `input` and in their string fields.
    if (Array.isArray(raw['issues'])) {
      setOwn('issues', redactSubIssues(raw['issues'], rawValues))
    }

    return redacted as unknown as StandardSchemaV1.Issue
  }

  const hasRestrictedKey = (value: unknown): boolean =>
    isRecord(value) && restrictedFields.some((field) => field in value)

  /**
   * Issues whose own path does not reach a restricted field can still hold it:
   * e.g. a `union` at the schema root has no path, its `input` (valibot) or
   * `data` (arktype) is the whole header record, and its nested `issues`
   * (valibot) or `errors` (arktype), one per option, carry their own paths,
   * some of which reach the `cookie` header. Such an issue is copied with the
   * restricted keys dropped from its object `input`/`data` and from path items'
   * `input`, the raw restricted values redacted from its string fields, and its
   * nested `issues`/`errors` sanitized the same way.
   */
  const sanitizeIssue = (
    issue: StandardSchemaV1.Issue,
    inheritedValues: ReadonlySet<string> = new Set()
  ): StandardSchemaV1.Issue => {
    if (reachesRestricted(issue)) {
      return redactIssue(issue, inheritedValues)
    }
    if (!isRecord(issue)) {
      return issue
    }

    const raw = issue as unknown as Record<string, unknown>
    // arktype's own `input` is its error context, not the validated value;
    // arktype keeps the validated value in `data`.
    const validated = vendor === 'arktype' ? raw['data'] : raw['input']
    const rawValues = new Set<string>(inheritedValues)
    if (isRecord(validated)) {
      for (const field of restrictedFields) {
        const value = validated[field]
        if (typeof value === 'string') {
          rawValues.add(value)
        }
      }
    }
    const stripValidated = hasRestrictedKey(validated)
    const stripPath =
      Array.isArray(issue.path) &&
      issue.path.some((item) => isRecord(item) && hasRestrictedKey(item['input']))
    const nestedField = vendor === 'arktype' ? 'errors' : 'issues'
    const subIssues = raw[nestedField]
    const sanitizedSubIssues = Array.isArray(subIssues)
      ? Array.from(subIssues as StandardSchemaV1.Issue[], (subIssue) =>
          sanitizeIssue(subIssue, rawValues)
        )
      : undefined
    const subIssuesChanged =
      sanitizedSubIssues !== undefined &&
      sanitizedSubIssues.some((subIssue, index) => subIssue !== (subIssues as unknown[])[index])

    if (rawValues.size === 0 && !stripValidated && !stripPath && !subIssuesChanged) {
      return issue
    }

    const proto = Object.getPrototypeOf(issue) as object | null
    const copy = Object.create(proto) as Record<string, unknown>
    const setOwn = (field: string, value: unknown) => {
      Object.defineProperty(copy, field, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      })
    }
    for (const [field, value] of Object.entries(raw)) {
      setOwn(field, value)
    }
    if (stripValidated) {
      setOwn(
        vendor === 'arktype' ? 'data' : 'input',
        omitKeys(validated as Record<string, unknown>, restrictedFields)
      )
    }
    if (stripPath) {
      setOwn(
        'path',
        Array.from(issue.path ?? [], (item) =>
          isRecord(item) && isRecord(item['input'])
            ? { ...item, input: omitKeys(item['input'], restrictedFields) }
            : item
        )
      )
    }
    if (subIssuesChanged) {
      setOwn(nestedField, sanitizedSubIssues)
    }
    // arktype spreads its error context into toJSON; keep its `errors` in step
    // and drop raw-value fields from it.
    if (vendor === 'arktype' && isRecord(raw['input'])) {
      const context = omitKeys(raw['input'], ['data', 'actual', 'problem', 'message'])
      setOwn(
        'input',
        sanitizedSubIssues && 'errors' in context
          ? { ...context, errors: sanitizedSubIssues }
          : context
      )
    }
    // Read after the copy is built: arktype computes these fields with getters.
    for (const field of REDACTED_STRING_FIELDS) {
      const text = copy[field]
      if (typeof text === 'string') {
        const replaced = redactWith(text, rawValues)
        if (replaced !== text) {
          setOwn(field, replaced)
        }
      }
    }
    return copy as unknown as StandardSchemaV1.Issue
  }

  return Array.from(issues, (issue) => sanitizeIssue(issue))
}

function sanitizeArktypeIssues(
  issues: readonly StandardSchemaV1.Issue[],
  restrictedFields: string[]
): readonly StandardSchemaV1.Issue[] {
  return issues.map((issue) => {
    if (
      issue &&
      typeof issue === 'object' &&
      'data' in issue &&
      typeof issue.data === 'object' &&
      issue.data !== null &&
      !Array.isArray(issue.data)
    ) {
      const dataCopy = { ...(issue.data as Record<string, unknown>) }
      for (const field of restrictedFields) {
        delete dataCopy[field]
      }
      // Preserve prototype chain to maintain toJSON method
      const sanitizedIssue = Object.create(Object.getPrototypeOf(issue))
      Object.assign(sanitizedIssue, issue, { data: dataCopy })
      return sanitizedIssue
    }
    return issue
  }) as readonly StandardSchemaV1.Issue[]
}

function sanitizeValibotIssues(
  issues: readonly StandardSchemaV1.Issue[],
  restrictedFields: string[]
): readonly StandardSchemaV1.Issue[] {
  return issues.map((issue) => {
    if (issue && typeof issue === 'object' && 'path' in issue && Array.isArray(issue.path)) {
      for (const path of issue.path) {
        if (
          typeof path === 'object' &&
          'input' in path &&
          typeof path.input === 'object' &&
          path.input !== null &&
          !Array.isArray(path.input)
        ) {
          for (const field of restrictedFields) {
            delete path.input[field]
          }
        }
      }
    }
    return issue
  }) as readonly StandardSchemaV1.Issue[]
}
