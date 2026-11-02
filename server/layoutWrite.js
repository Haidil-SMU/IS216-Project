// ============================================================================
// layoutWrite.js  (server)
// ----------------------------------------------------------------------------
// What it is : helpers for saving rooms to the database safely.
//   layoutOps       - works out the smallest list of writes needed to turn the
//                     rooms stored in the database into the rooms the user sent.
//   bulkWriteSafely - runs a list of writes together (all or nothing) when the
//                     database supports transactions, otherwise one after another.
// Receives   : the rooms collection, a list of write operations, stored rooms,
//              incoming rooms and the household id.
// Used by    : spatialRoutes.js
// ============================================================================

const { getClient } = require('./db');

// ============================================================================
// Writing to the database
// ============================================================================

// True when the error just means "this database cannot do transactions"
// (for example a plain local MongoDB that is not a replica set).
function noTransactions(e) {
  if (!e) {
    return false;
  }
  if (e.code === 20) {
    return true;
  }
  const message = String(e.message).toLowerCase();
  if (message.includes('transaction numbers are only allowed')) {
    return true;
  }
  if (message.includes('replica set')) {
    return true;
  }
  if (message.includes('does not support transactions')) {
    return true;
  }
  if (message.includes('not supported')) {
    return true;
  }
  return false;
}

// Runs the writes in ops on the collection.
// Tries a transaction first; if the database cannot do that, writes normally.
// "client" is optional (only tests pass it).
async function bulkWriteSafely(collection, ops, client) {
  if (!ops.length) {
    return;
  }
  if (!client) {
    client = getClient();
  }

  let session = null;
  try {
    session = client.startSession();
    await session.withTransaction(function () {
      return collection.bulkWrite(ops, { ordered: true, session: session });
    });
    return;
  } catch (e) {
    if (!noTransactions(e)) {
      throw e;
    }
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch (err) {
        // ignore: nothing useful to do if closing the session fails
      }
    }
  }

  // No transactions available: do the same writes without one.
  await collection.bulkWrite(ops, { ordered: true });
}

// ============================================================================
// Working out what changed
// ============================================================================

// Makes a copy of a value in a fixed form, so two equal rooms always give the
// same text: ObjectIds and Dates become strings, object keys are sorted.
function canon(v) {
  if (v && typeof v.toHexString === 'function') {
    return String(v);
  }
  if (v instanceof Date) {
    return v.toISOString();
  }
  if (Array.isArray(v)) {
    const list = [];
    for (const item of v) {
      list.push(canon(item));
    }
    return list;
  }
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).sort();
    const copy = {};
    for (const key of keys) {
      copy[key] = canon(v[key]);
    }
    return copy;
  }
  return v;
}

// Turns the parts of a room that matter into one comparable piece of text.
function roomText(r) {
  let placements = r.placements;
  if (placements === undefined || placements === null) {
    placements = [];
  }
  let openWalls = r.openWalls;
  if (openWalls === undefined || openWalls === null) {
    openWalls = [];
  }
  return JSON.stringify(canon({
    name: r.name,
    type: r.type,
    order: r.order,
    origin: r.origin,
    dimension: r.dimension,
    placements: placements,
    openWalls: openWalls,
  }));
}

// Finds the room with this id in a list of rooms. Returns null if not there.
function findRoom(rooms, id) {
  for (const room of rooms) {
    if (String(room._id) === id) {
      return room;
    }
  }
  return null;
}

// Compares the stored rooms with the incoming rooms and returns the writes needed:
//   - a replaceOne (upsert) for every new or changed room
//   - one deleteMany for the rooms that are no longer there
function layoutOps(stored, incoming, householdId) {
  const ops = [];

  for (const r of incoming) {
    const old = findRoom(stored, String(r._id));
    if (old === null || roomText(old) !== roomText(r)) {
      ops.push({ replaceOne: { filter: { _id: r._id }, replacement: r, upsert: true } });
    }
  }

  const gone = [];
  for (const r of stored) {
    if (findRoom(incoming, String(r._id)) === null) {
      gone.push(r._id);
    }
  }
  if (gone.length) {
    ops.push({ deleteMany: { filter: { householdId: householdId, _id: { $in: gone } } } });
  }

  return ops;
}

module.exports = { bulkWriteSafely, layoutOps };
