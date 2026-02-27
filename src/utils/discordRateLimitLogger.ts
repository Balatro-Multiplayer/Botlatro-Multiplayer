import {
  APIRequest,
  InvalidRequestWarningData,
  REST,
  RESTEvents,
  RateLimitData,
  ResponseLike,
} from '@discordjs/rest'

let discordRestTraceSeq = 0

function nextTraceId(source: string, kind: string): string {
  discordRestTraceSeq += 1
  return `${source}:${kind}:${discordRestTraceSeq}`
}

function baseTrace(source: string, kind: string) {
  return {
    traceId: nextTraceId(source, kind),
    source,
    loggedAt: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
  }
}

function getHeader(response: ResponseLike, name: string): string | null {
  return response.headers.get(name)
}

function formatRequest(request: APIRequest) {
  return {
    method: request.method,
    route: request.route,
    path: request.path,
    retries: request.retries,
    auth: request.data.auth ?? true,
    hasBody: request.data.body != null,
    fileCount: request.data.files?.length ?? 0,
  }
}

function format429Headers(response: ResponseLike) {
  return {
    retryAfter: getHeader(response, 'retry-after'),
    scope: getHeader(response, 'x-ratelimit-scope'),
    bucket: getHeader(response, 'x-ratelimit-bucket'),
    limit: getHeader(response, 'x-ratelimit-limit'),
    remaining: getHeader(response, 'x-ratelimit-remaining'),
    reset: getHeader(response, 'x-ratelimit-reset'),
    resetAfter: getHeader(response, 'x-ratelimit-reset-after'),
    global: getHeader(response, 'x-ratelimit-global'),
    via: getHeader(response, 'via'),
    cfRay: getHeader(response, 'cf-ray'),
  }
}

function logRateLimited(source: string, data: RateLimitData): void {
  console.warn('[DISCORD RATE LIMIT]', {
    ...baseTrace(source, 'rateLimited'),
    global: data.global,
    scope: data.scope,
    method: data.method,
    route: data.route,
    url: data.url,
    hash: data.hash,
    majorParameter: data.majorParameter,
    limit: data.limit,
    retryAfterMs: data.retryAfter,
    timeToResetMs: data.timeToReset,
    sublimitTimeoutMs: data.sublimitTimeout,
  })
}

function logInvalidRequestWarning(
  source: string,
  data: InvalidRequestWarningData,
): void {
  console.warn('[DISCORD INVALID REQUEST WARNING]', {
    ...baseTrace(source, 'invalidRequestWarning'),
    count: data.count,
    remainingTimeMs: data.remainingTime,
  })
}

function log429Response(
  source: string,
  request: APIRequest,
  response: ResponseLike,
): void {
  console.error('[DISCORD 429 RESPONSE]', {
    ...baseTrace(source, '429'),
    request: formatRequest(request),
    response: {
      status: response.status,
      statusText: response.statusText,
      headers: format429Headers(response),
    },
  })
}

export function attachDiscordRateLimitLogging(
  rest: REST,
  source: string,
): void {
  rest.on(RESTEvents.RateLimited, (data) => {
    logRateLimited(source, data)
  })

  rest.on(RESTEvents.InvalidRequestWarning, (data) => {
    logInvalidRequestWarning(source, data)
  })

  rest.on(RESTEvents.Response, (request, response) => {
    if (response.status !== 429) return
    log429Response(source, request, response)
  })
}
