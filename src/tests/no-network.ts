// Outside record mode, tests may only call the local test server; model calls go through cassettes.
if (process.env.UXWOZ_RECORD !== '1') {
  const real = globalThis.fetch
  globalThis.fetch = Object.assign((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1')
      throw new Error(`tests must not call ${url.host}; replay a cassette instead`)
    return real(input, init)
  }, real)
}
