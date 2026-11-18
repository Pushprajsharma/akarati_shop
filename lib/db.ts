import { MongoClient, Db, Collection, Document } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "khata_app";
if (!uri) throw new Error("Please define MONGODB_URI in .env.local");

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  var _mongoIndexesPromise: Promise<void> | undefined;
}

const client = new MongoClient(uri);
const clientPromise = global._mongoClientPromise ?? client.connect();
if (process.env.NODE_ENV !== "production") global._mongoClientPromise = clientPromise;

export async function getMongoClient(): Promise<MongoClient> {
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const connected = await clientPromise;
  const db = connected.db(dbName);
  if (!global._mongoIndexesPromise) {
    global._mongoIndexesPromise = Promise.all([
      db.collection("customers").createIndex({ name: 1 }),
      db.collection("customers").createIndex({ mobile: 1 }),
      db.collection("transactions").createIndex({ customerId: 1, transactionDate: 1, createdAt: 1, entryOrder: 1 }),
      db.collection("transactions").createIndex({ invoiceId: 1 }),
      db.collection("invoices").createIndex({ customerId: 1, invoiceDate: -1 }),
      db.collection("invoices").createIndex({ invoiceNumber: 1 }, { unique: true })
    ]).then(() => undefined);
  }
  await global._mongoIndexesPromise;
  return db;
}

export async function getCollection<T extends Document = Document>(name: string): Promise<Collection<T>> {
  return (await getDb()).collection<T>(name);
}
