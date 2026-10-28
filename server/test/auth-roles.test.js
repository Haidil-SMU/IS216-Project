// Unit tests for the requireAuth / requireClient / requireContractor guards.
// No Express, database or network: each guard is called with in-memory req/res/next doubles.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { requireAuth, requireClient, requireContractor } = require('../auth');

const USER_ID = '64b7f0c2a1b2c3d4e5f60718';
const LOGGED_OUT = 'Please log in to continue.';

function makeReq(session) {
  return { session };
}

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function makeNext() {
  const next = (...args) => { next.calls.push(args); };
  next.calls = [];
  return next;
}

// Arrange and act in one place, so each test only asserts.
function run(guard, session) {
  const res = makeRes();
  const next = makeNext();
  guard(makeReq(session), res, next);
  return { res, next };
}

function assertBlocked({ res, next }, status, error) {
  assert.equal(res.statusCode, status);
  assert.deepEqual(res.body, { error });
  assert.equal(next.calls.length, 0, 'next() must not run after a rejection');
}

function assertAllowed({ res, next }) {
  assert.deepEqual(next.calls, [[]], 'next() called exactly once, with no error');
  assert.equal(res.statusCode, null, 'no response sent');
}

describe('requireAuth', () => {
  test('rejects a request with no session object', () => {
    assertBlocked(run(requireAuth, undefined), 401, LOGGED_OUT);
  });

  test('rejects a session without a userId', () => {
    assertBlocked(run(requireAuth, {}), 401, LOGGED_OUT);
  });

  test('allows any logged-in user, whatever their role', () => {
    assertAllowed(run(requireAuth, { userId: USER_ID, role: 'contractor' }));
  });
});

describe('requireClient (homeowner-only)', () => {
  test('rejects a signed-out request with 401 before checking the role', () => {
    assertBlocked(run(requireClient, { role: 'client' }), 401, LOGGED_OUT);
  });

  test('rejects an empty-string userId with 401', () => {
    assertBlocked(run(requireClient, { userId: '', role: 'client' }), 401, LOGGED_OUT);
  });

  test('rejects a contractor with 403', () => {
    assertBlocked(
      run(requireClient, { userId: USER_ID, role: 'contractor' }),
      403,
      'This is for homeowner accounts.',
    );
  });

  test('allows a homeowner', () => {
    assertAllowed(run(requireClient, { userId: USER_ID, role: 'client' }));
  });

  test('treats a legacy session with no role as a homeowner', () => {
    assertAllowed(run(requireClient, { userId: USER_ID }));
  });
});

describe('requireContractor (contractor-only)', () => {
  test('rejects a signed-out request with 401', () => {
    assertBlocked(run(requireContractor, undefined), 401, LOGGED_OUT);
  });

  test('rejects a homeowner with 403', () => {
    assertBlocked(
      run(requireContractor, { userId: USER_ID, role: 'client' }),
      403,
      'This is for contractor accounts.',
    );
  });

  test('rejects a legacy session with no role, so a missing role never grants contractor access', () => {
    assertBlocked(
      run(requireContractor, { userId: USER_ID }),
      403,
      'This is for contractor accounts.',
    );
  });

  test('allows a contractor', () => {
    assertAllowed(run(requireContractor, { userId: USER_ID, role: 'contractor' }));
  });
});
