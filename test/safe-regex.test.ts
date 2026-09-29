import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Alias } from '../src/types/forward-email.js';

import {
  configureRegexWorkerForTesting,
  matchesAliasSafely,
} from '../src/lib/safe-regex.js';

interface RegexMatchRequest {
  id: number;
  source: string;
  flags: string;
  localPart: string;
}

class FakeRegexWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  readonly requests: RegexMatchRequest[] = [];
  terminated = false;

  postMessage(request: RegexMatchRequest): void {
    this.requests.push(request);
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(index: number, matched: boolean): void {
    const request = this.requests[index];
    this.onmessage?.({ data: { id: request.id, matched } });
  }

  fail(): void {
    this.onerror?.();
  }
}

const regexAlias: Alias = { id: '1', name: '/^test-.*/g', domain: 'example.test' };

beforeEach(() => {
  configureRegexWorkerForTesting();
});

describe('matchesAliasSafely', () => {
  it('matches direct and catch-all aliases without creating a regex worker', async () => {
    let workerCreations = 0;
    configureRegexWorkerForTesting(() => {
      workerCreations += 1;
      return new FakeRegexWorker();
    });

    const directAlias: Alias = { id: '2', name: 'Sales', domain: 'example.test' };
    const catchAllAlias: Alias = { id: '3', name: '*', domain: 'example.test' };

    assert.equal(await matchesAliasSafely('sales', 'example.test', directAlias), true);
    assert.equal(await matchesAliasSafely('anything', 'example.test', catchAllAlias), true);
    assert.equal(await matchesAliasSafely('sales', 'other.example.test', directAlias), false);
    assert.equal(workerCreations, 0);
  });

  it('correlates responses for reusable regex worker requests', async () => {
    const worker = new FakeRegexWorker();
    let workerCreations = 0;
    configureRegexWorkerForTesting(() => {
      workerCreations += 1;
      return worker;
    });

    const first = matchesAliasSafely('test-first', 'example.test', regexAlias);
    const second = matchesAliasSafely('test-second', 'example.test', regexAlias);

    assert.equal(workerCreations, 1);
    assert.deepEqual(worker.requests.map(({ source, flags, localPart }) => ({ source, flags, localPart })), [
      { source: '^test-.*', flags: 'g', localPart: 'test-first' },
      { source: '^test-.*', flags: 'g', localPart: 'test-second' },
    ]);

    worker.respond(1, true);
    worker.respond(0, false);

    assert.equal(await first, false);
    assert.equal(await second, true);
  });

  it('fails closed when the regex worker rejects a malformed pattern', async () => {
    const worker = new FakeRegexWorker();
    configureRegexWorkerForTesting(() => worker);

    const malformedAlias: Alias = { id: '4', name: '/[a-/', domain: 'example.test' };
    const result = matchesAliasSafely('test-user', 'example.test', malformedAlias);

    assert.equal(worker.requests[0].source, '[a-');
    worker.respond(0, false);
    assert.equal(await result, false);
  });

  it('fails closed when no regex worker is available', async () => {
    configureRegexWorkerForTesting(() => null);

    assert.equal(await matchesAliasSafely('test-user', 'example.test', regexAlias), false);
  });

  it('terminates a timed-out worker and fails closed', async () => {
    const worker = new FakeRegexWorker();
    configureRegexWorkerForTesting(() => worker, 1);

    assert.equal(await matchesAliasSafely('test-user', 'example.test', regexAlias), false);
    assert.equal(worker.terminated, true);
  });

  it('fails closed after a worker error and recovers with a fresh worker', async () => {
    const failedWorker = new FakeRegexWorker();
    const recoveredWorker = new FakeRegexWorker();
    let workerCreations = 0;
    configureRegexWorkerForTesting(() => {
      workerCreations += 1;
      return workerCreations === 1 ? failedWorker : recoveredWorker;
    });

    const failedMatch = matchesAliasSafely('test-user', 'example.test', regexAlias);
    failedWorker.fail();
    assert.equal(await failedMatch, false);
    assert.equal(failedWorker.terminated, true);

    const recoveredMatch = matchesAliasSafely('test-user', 'example.test', regexAlias);
    assert.equal(workerCreations, 2);
    recoveredWorker.respond(0, true);
    assert.equal(await recoveredMatch, true);
  });
});
