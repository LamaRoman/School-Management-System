import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRefreshError, isNetworkError } from './refreshOutcome.ts';

test('401/403 from the refresh endpoint is a definitive rejection (sign out)', () => {
  assert.equal(classifyRefreshError({ response: { status: 401 } }), 'rejected');
  assert.equal(classifyRefreshError({ response: { status: 403 } }), 'rejected');
});

test('network errors, timeouts and 5xx never sign the user out', () => {
  assert.equal(classifyRefreshError(new Error('Network Error')), 'unavailable');
  assert.equal(classifyRefreshError({ code: 'ECONNABORTED' }), 'unavailable');
  assert.equal(classifyRefreshError({ response: { status: 500 } }), 'unavailable');
  assert.equal(classifyRefreshError({ response: { status: 502 } }), 'unavailable');
  assert.equal(classifyRefreshError({ response: { status: 429 } }), 'unavailable');
  assert.equal(classifyRefreshError(null), 'unavailable');
});

test('isNetworkError', () => {
  assert.equal(isNetworkError(new Error('Network Error')), true);
  assert.equal(isNetworkError({ response: { status: 500 } }), false);
  assert.equal(isNetworkError({ response: { status: 401 }, isRefreshUnavailable: true }), true);
});
