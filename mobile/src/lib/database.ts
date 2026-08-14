import * as SQLite from 'expo-sqlite';
import type { CountDraft, Inventory, Product, QueueItem } from '../types';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function json<T>(value: string | null, fallback: T): T {
  try {
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

export async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('armazena-certo.db').then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS inventories (
          id INTEGER PRIMARY KEY NOT NULL,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS products (
          inventory_id INTEGER NOT NULL,
          product_id INTEGER NOT NULL,
          estoque_id INTEGER,
          sku TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL,
          barcode TEXT NOT NULL DEFAULT '',
          reference TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT '',
          unit TEXT NOT NULL DEFAULT 'UN',
          factor REAL NOT NULL DEFAULT 1,
          total_counted REAL NOT NULL DEFAULT 0,
          difference REAL NOT NULL DEFAULT 0,
          validities TEXT NOT NULL DEFAULT '[]',
          locations TEXT NOT NULL DEFAULT '[]',
          updated_at TEXT NOT NULL,
          PRIMARY KEY (inventory_id, product_id)
        );
        CREATE INDEX IF NOT EXISTS products_codes ON products (inventory_id, barcode, sku, reference);
        CREATE TABLE IF NOT EXISTS count_queue (
          local_id TEXT PRIMARY KEY NOT NULL,
          inventory_id INTEGER NOT NULL,
          code TEXT NOT NULL,
          product_id INTEGER NOT NULL,
          product_name TEXT NOT NULL,
          quantity REAL NOT NULL,
          standardized_quantity REAL NOT NULL,
          validity TEXT,
          observation TEXT,
          location TEXT,
          created_at TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'pending',
          last_error TEXT
        );
        CREATE INDEX IF NOT EXISTS queue_inventory_status ON count_queue (inventory_id, status, created_at);
      `);
      return db;
    });
  }
  return databasePromise;
}

export async function cacheInventories(inventories: Inventory[]) {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const inventory of inventories) {
      await db.runAsync(
        'INSERT OR REPLACE INTO inventories (id, payload, updated_at) VALUES (?, ?, ?)',
        inventory.id,
        JSON.stringify(inventory),
        now
      );
    }
  });
}

export async function getCachedInventories() {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ payload: string }>('SELECT payload FROM inventories ORDER BY updated_at DESC');
  return rows.map((row) => json<Inventory>(row.payload, {} as Inventory)).filter((item) => item.id);
}

export async function getCachedInventory(id: number) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ payload: string }>('SELECT payload FROM inventories WHERE id = ?', id);
  return row ? json<Inventory>(row.payload, {} as Inventory) : null;
}

export async function cacheProducts(inventoryId: number, products: Product[], replace = false) {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    if (replace) await db.runAsync('DELETE FROM products WHERE inventory_id = ?', inventoryId);
    for (const product of products) {
      await db.runAsync(
        `INSERT OR REPLACE INTO products
          (inventory_id, product_id, estoque_id, sku, name, barcode, reference, category, unit, factor,
           total_counted, difference, validities, locations, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        inventoryId,
        product.productId,
        product.estoqueId ?? null,
        product.sku,
        product.name,
        product.barcode,
        product.reference,
        product.category,
        product.unit,
        product.factor,
        product.totalCounted,
        product.difference,
        JSON.stringify(product.validities),
        JSON.stringify(product.locations),
        now
      );
    }
  });
}

type ProductRow = {
  inventory_id: number; product_id: number; estoque_id: number | null; sku: string; name: string;
  barcode: string; reference: string; category: string; unit: string; factor: number;
  total_counted: number; difference: number; validities: string; locations: string;
};

function rowToProduct(row: ProductRow): Product {
  return {
    inventoryId: row.inventory_id,
    productId: row.product_id,
    estoqueId: row.estoque_id ?? undefined,
    sku: row.sku,
    name: row.name,
    barcode: row.barcode,
    reference: row.reference,
    category: row.category,
    unit: row.unit,
    factor: Number(row.factor || 1),
    totalCounted: Number(row.total_counted || 0),
    difference: Number(row.difference || 0),
    validities: json(row.validities, []),
    locations: json(row.locations, [])
  };
}

export async function getProducts(inventoryId: number, search = '') {
  const db = await getDatabase();
  const term = search.trim();
  const rows = term
    ? await db.getAllAsync<ProductRow>(
        `SELECT * FROM products WHERE inventory_id = ? AND
         (name LIKE ? OR sku LIKE ? OR barcode LIKE ? OR reference LIKE ?) ORDER BY name LIMIT 250`,
        inventoryId, `%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`
      )
    : await db.getAllAsync<ProductRow>('SELECT * FROM products WHERE inventory_id = ? ORDER BY name LIMIT 250', inventoryId);
  return rows.map(rowToProduct);
}

export async function findProductByCode(inventoryId: number, candidates: string[]) {
  const db = await getDatabase();
  for (const candidate of candidates) {
    const row = await db.getFirstAsync<ProductRow>(
      `SELECT * FROM products WHERE inventory_id = ? AND
       (UPPER(barcode) = ? OR UPPER(sku) = ? OR UPPER(reference) = ?) LIMIT 1`,
      inventoryId, candidate, candidate, candidate
    );
    if (row) return rowToProduct(row);
  }
  return null;
}

export async function enqueueCount(draft: CountDraft) {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR IGNORE INTO count_queue
       (local_id, inventory_id, code, product_id, product_name, quantity, standardized_quantity,
        validity, observation, location, created_at, attempts, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending')`,
      draft.localId, draft.inventoryId, draft.code, draft.productId, draft.productName, draft.quantity,
      draft.standardizedQuantity, draft.validity ?? null, draft.observation ?? null, draft.location ?? null,
      draft.createdAt
    );
    await db.runAsync(
      `UPDATE products SET total_counted = total_counted + ?, difference = difference + ?
       WHERE inventory_id = ? AND product_id = ?`,
      draft.standardizedQuantity, draft.standardizedQuantity, draft.inventoryId, draft.productId
    );
  });
}

type QueueRow = {
  local_id: string; inventory_id: number; code: string; product_id: number; product_name: string;
  quantity: number; standardized_quantity: number; validity: string | null; observation: string | null;
  location: string | null; created_at: string; attempts: number; status: QueueItem['status']; last_error: string | null;
};

function rowToQueue(row: QueueRow): QueueItem {
  return {
    localId: row.local_id, inventoryId: row.inventory_id, code: row.code, productId: row.product_id,
    productName: row.product_name, quantity: Number(row.quantity), standardizedQuantity: Number(row.standardized_quantity),
    validity: row.validity, observation: row.observation, location: row.location, createdAt: row.created_at,
    attempts: row.attempts, status: row.status, lastError: row.last_error
  };
}

export async function getQueue(inventoryId?: number) {
  const db = await getDatabase();
  const rows = inventoryId === undefined
    ? await db.getAllAsync<QueueRow>('SELECT * FROM count_queue ORDER BY created_at')
    : await db.getAllAsync<QueueRow>('SELECT * FROM count_queue WHERE inventory_id = ? ORDER BY created_at', inventoryId);
  return rows.map(rowToQueue);
}

export async function removeQueueItem(localId: string) {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM count_queue WHERE local_id = ?', localId);
}

export async function markQueueItem(localId: string, status: QueueItem['status'], attempts: number, error: string | null) {
  const db = await getDatabase();
  await db.runAsync('UPDATE count_queue SET status = ?, attempts = ?, last_error = ? WHERE local_id = ?', status, attempts, error, localId);
}

export async function retryBlockedQueue(inventoryId: number) {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE count_queue SET status = 'pending', attempts = 0, last_error = NULL WHERE inventory_id = ?",
    inventoryId
  );
}
