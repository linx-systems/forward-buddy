import type { Alias } from '../types/forward-email.js';
import { parseAliasRegex, resolveDomain } from './utils.js';

const REGEX_MATCH_TIMEOUT_MS = 250;
interface PromiseResolvers<T> {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
}

interface PromiseConstructorWithResolvers extends PromiseConstructor {
  withResolvers<T>(): PromiseResolvers<T>;
}

type TimeoutHandle = number | NodeJS.Timeout;


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

interface RegexWorker {
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: Event) => void) | null;
  postMessage(message: RegexMatchRequest): void;
  terminate(): void;
}

type RegexWorkerFactory = () => RegexWorker | null;

interface PendingMatch {
  resolve: (matched: boolean) => void;
  timeout: TimeoutHandle;
}

let activeWorker: RegexWorker | null = null;
let workerFactory: RegexWorkerFactory = createExtensionWorker;
let matchTimeoutMs = REGEX_MATCH_TIMEOUT_MS;
let nextRequestId = 1;
const pendingMatches = new Map<number, PendingMatch>();

function createExtensionWorker(): RegexWorker | null {
  if (typeof Worker === 'undefined') return null;

  try {
    return new Worker(new URL('../background/regex-worker.js', import.meta.url), { type: 'module' }) as unknown as RegexWorker;
  } catch {
    return null;
  }
}

function isRegexMatchResponse(value: unknown): value is RegexMatchResponse {
  if (!value || typeof value !== 'object') return false;

  const response = value as Partial<RegexMatchResponse>;
  return typeof response.id === 'number' && typeof response.matched === 'boolean';
}

function discardWorker(worker: RegexWorker): void {
  if (activeWorker !== worker) return;

  activeWorker = null;
  worker.onmessage = null;
  worker.onerror = null;
  try {
    worker.terminate();
  } catch {
    // A failed termination still leaves this worker unusable.
  }

  for (const pending of pendingMatches.values()) {
    clearTimeout(pending.timeout);
    pending.resolve(false);
  }
  pendingMatches.clear();
}

function getWorker(): RegexWorker | null {
  if (activeWorker) return activeWorker;

  let worker: RegexWorker | null;
  try {
    worker = workerFactory();
  } catch {
    return null;
  }
  if (!worker) return null;

  worker.onmessage = (event) => {
    if (activeWorker !== worker || !isRegexMatchResponse(event.data)) return;

    const pending = pendingMatches.get(event.data.id);
    if (!pending) return;

    pendingMatches.delete(event.data.id);
    clearTimeout(pending.timeout);
    pending.resolve(event.data.matched);
  };
  worker.onerror = () => discardWorker(worker);
  activeWorker = worker;
  return worker;
}

function matchRegexInWorker(source: string, flags: string, localPart: string): Promise<boolean> {
  const worker = getWorker();
  if (!worker) return Promise.resolve(false);

  const id = nextRequestId++;
  const { promise, resolve } = (Promise as PromiseConstructorWithResolvers).withResolvers<boolean>();
  const timeout = setTimeout(() => discardWorker(worker), matchTimeoutMs);
  pendingMatches.set(id, { resolve, timeout });

  try {
    worker.postMessage({ id, source, flags, localPart });
  } catch {
    discardWorker(worker);
  }

  return promise;
}

/**
 * Match an alias without evaluating account-provided regular expressions on
 * the background thread. Direct and catch-all aliases resolve immediately;
 * regex aliases fail closed if their worker is unavailable, malformed, or
 * exceeds the execution budget.
 */
export function matchesAliasSafely(
  localPart: string,
  domain: string,
  alias: Alias,
  fallbackDomain?: string,
): Promise<boolean> {
  const aliasDomain = resolveDomain(alias, fallbackDomain);
  if (aliasDomain.toLowerCase() !== domain.toLowerCase()) return Promise.resolve(false);
  if (alias.name === '*') return Promise.resolve(true);

  const regex = parseAliasRegex(alias.name);
  if (!regex) return Promise.resolve(alias.name.toLowerCase() === localPart.toLowerCase());

  return matchRegexInWorker(regex.source, regex.flags, localPart);
}

/** Test-only seam for controlled worker behavior. */
export function configureRegexWorkerForTesting(
  factory?: RegexWorkerFactory,
  timeoutMs: number = REGEX_MATCH_TIMEOUT_MS,
): void {
  if (activeWorker) discardWorker(activeWorker);
  workerFactory = factory ?? createExtensionWorker;
  matchTimeoutMs = Math.max(0, timeoutMs);
}
