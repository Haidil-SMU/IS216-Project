const { getClient } = require('./db');

const noTransactions = (e) =>
  e?.code === 20 || /Transaction numbers are only allowed|replica set|does not support transactions|not supported/i.test(String(e?.message));

async function bulkWriteSafely(collection, ops, client = null) {
  if (!ops.length) return;
  let session;
  try {
    session = (client || getClient()).startSession();
    await session.withTransaction(() => collection.bulkWrite(ops, { ordered: true, session }));
    return;
  } catch (e) {
    if (!noTransactions(e)) throw e;
  } finally {
    await session?.endSession().catch(() => {});
  }
  await collection.bulkWrite(ops, { ordered: true });
}

function canon(v) {
  if (v && typeof v.toHexString === 'function') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]));
  return v;
}

const roomText = (r) => JSON.stringify(canon({
  name: r.name, type: r.type, order: r.order, origin: r.origin, dimension: r.dimension, placements: r.placements ?? [], openWalls: r.openWalls ?? [],
}));

function layoutOps(stored, incoming, householdId) {
  const was = new Map(stored.map((r) => [String(r._id), r]));
  const now = new Set(incoming.map((r) => String(r._id)));
  const ops = incoming
    .filter((r) => !was.has(String(r._id)) || roomText(was.get(String(r._id))) !== roomText(r))
    .map((r) => ({ replaceOne: { filter: { _id: r._id }, replacement: r, upsert: true } }));
  const gone = stored.filter((r) => !now.has(String(r._id))).map((r) => r._id);
  if (gone.length) ops.push({ deleteMany: { filter: { householdId, _id: { $in: gone } } } });
  return ops;
}

module.exports = { bulkWriteSafely, layoutOps };