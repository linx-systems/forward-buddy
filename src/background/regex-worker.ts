interface RegexMatchRequest {
  id: number;
  source: string;
  flags: string;
  localPart: string;
}

interface RegexMatchResponse {
  id: number;
  matched: boolean;
}
interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  postMessage(message: RegexMatchResponse): void;
}

// This module is loaded only as a dedicated extension worker.
const workerScope = globalThis as unknown as WorkerScope;


function isMatchRequest(value: unknown): value is RegexMatchRequest {
  if (!value || typeof value !== 'object') return false;

  const request = value as Partial<RegexMatchRequest>;
  return typeof request.id === 'number'
    && typeof request.source === 'string'
    && typeof request.flags === 'string'
    && typeof request.localPart === 'string';
}

workerScope.addEventListener('message', (event) => {
  if (!isMatchRequest(event.data)) return;

  const { id, source, flags, localPart } = event.data;
  let matched = false;
  try {
    matched = new RegExp(source, flags || undefined).test(localPart);
  } catch {
    // Invalid patterns must not match.
  }

  const response: RegexMatchResponse = { id, matched };
  workerScope.postMessage(response);
});
