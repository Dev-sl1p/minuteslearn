/** Bound waiting without hiding network errors from each form's recovery UI. */
export function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  return globalThis.fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(25000) });
}
