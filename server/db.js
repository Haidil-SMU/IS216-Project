// One shared MongoDB connection for the whole server.
const { MongoClient } = require('mongodb');

const DB_NAME = 'ecohome';
let client;
let db;

async function connectDb() {
  if (!process.env.DB) {
    throw new Error('Missing DB connection string in server/.env');
  }
  client = new MongoClient(process.env.DB);
  await client.connect();
  db = client.db(DB_NAME);

  // Emails and Singpass accounts must be unique, but only when they exist.
  await db.collection('users').createIndex(
    { email: 1 },
    { unique: true, partialFilterExpression: { email: { $type: 'string' } } },
  );
  await db.collection('users').createIndex(
    { 'singpass.uuid': 1 },
    { unique: true, partialFilterExpression: { 'singpass.uuid': { $type: 'string' } } },
  );
  await db.collection('households').createIndex({ ownerId: 1, id: 1 });
  await db.collection('plans').createIndex({ ownerId: 1, id: 1 });

  console.log('MongoDB connected successfully!');
  return db;
}

function getDb() {
  if (!db) throw new Error('MongoDB is not connected yet');
  return db;
}

function getClient() {
  if (!client) throw new Error('MongoDB is not connected yet');
  return client;
}

module.exports = { connectDb, getDb, getClient, DB_NAME };
