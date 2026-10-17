// put in server.js ltr
const { MongoClient } = require('mongodb');

let client;
let db;

async function getDb() {
  if (db) return db;
  client = new MongoClient(process.env.DB);
  await client.connect();
  db = client.db('wq_test');
  return db;
}

module.exports = { getDb };
