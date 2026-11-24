import * as SQLite from 'expo-sqlite';

const DB_NAME = 'open_hands.db';
let db: SQLite.SQLiteDatabase | null = null;

export async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await migrate(db);
  }
  return db;
}

async function migrate(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER,
      user_id INTEGER,
      mood TEXT NOT NULL,
      comment TEXT NOT NULL,
      created_at TEXT NOT NULL,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS pending_screenings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      sender TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      phone TEXT,
      whatsapp TEXT,
      email TEXT,
      website TEXT,
      map_link TEXT,
      logo TEXT,
      latitude REAL,
      longitude REAL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT,
      logo_url TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      session_date TEXT,
      session_time TEXT,
      location TEXT,
      image_url TEXT
    );

    CREATE TABLE IF NOT EXISTS panic_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lat REAL,
      lng REAL,
      created_at TEXT NOT NULL,
      synced INTEGER DEFAULT 0
    );
  `);

  // Safely ensure all columns and indexes exist if upgrading an existing local database
  try { await database.execAsync(`ALTER TABLE organizations ADD COLUMN logo TEXT;`); } catch {}
  try { await database.execAsync(`ALTER TABLE organizations ADD COLUMN latitude REAL;`); } catch {}
  try { await database.execAsync(`ALTER TABLE organizations ADD COLUMN longitude REAL;`); } catch {}
  try { await database.execAsync(`ALTER TABLE organizations ADD COLUMN is_active INTEGER DEFAULT 1;`); } catch {}
  try { await database.execAsync(`ALTER TABLE organizations ADD COLUMN created_at TEXT;`); } catch {}
  try { await database.execAsync(`ALTER TABLE organizations ADD COLUMN updated_at TEXT;`); } catch {}
  try { await database.execAsync(`ALTER TABLE organizations ADD COLUMN logo_url TEXT;`); } catch {}
  try {
    await database.execAsync(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_user_server ON checkins(user_id, server_id) WHERE server_id IS NOT NULL;`
    );
  } catch {}
}

// ============ CHECK-INS ============
export interface LocalCheckin {
  id: number;
  server_id: number | null;
  user_id: number | null;
  mood: string;
  comment: string;
  created_at: string;
  synced: number;
}

export async function saveCheckinLocal(userId: number, mood: string, comment: string): Promise<number> {
  const database = await getDB();
  const res = await database.runAsync(
    `INSERT INTO checkins (user_id, mood, comment, created_at, synced) VALUES (?, ?, ?, ?, 0)`,
    [userId, mood, comment ?? '', new Date().toISOString()],
  );
  return res.lastInsertRowId;
}

export async function getUnsyncedCheckins(userId?: number): Promise<LocalCheckin[]> {
  const database = await getDB();
  if (typeof userId === 'number') {
    return database.getAllAsync<LocalCheckin>(
      `SELECT * FROM checkins WHERE synced = 0 AND user_id = ? ORDER BY created_at ASC`,
      [userId],
    );
  }
  return database.getAllAsync<LocalCheckin>(
    `SELECT * FROM checkins WHERE synced = 0 ORDER BY created_at ASC`,
  );
}

export async function markCheckinSynced(localId: number, serverId: number) {
  const database = await getDB();
  await database.runAsync(
    `UPDATE checkins SET synced = 1, server_id = ? WHERE id = ?`,
    [serverId, localId],
  );
}

export async function getAllCheckinsLocal(userId: number): Promise<LocalCheckin[]> {
  const database = await getDB();
  return database.getAllAsync<LocalCheckin>(
    `SELECT * FROM checkins WHERE user_id = ? ORDER BY created_at DESC`,
    [userId],
  );
}

export async function deleteCheckinLocal(id: number) {
  const database = await getDB();
  await database.runAsync(`DELETE FROM checkins WHERE id = ?`, [id]);
}

export async function mergeRemoteCheckins(userId: number, checkins: any[]) {
  const database = await getDB();
  for (const c of checkins) {
    await database.runAsync(
      `INSERT OR IGNORE INTO checkins (server_id, user_id, mood, comment, created_at, synced)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [c.id, userId, c.mood, c.comment ?? '', c.created_at],
    );
  }
}

// ============ SCREENINGS ============
export async function saveScreeningLocal(userId: number, payload: any): Promise<number> {
  const database = await getDB();
  const res = await database.runAsync(
    `INSERT INTO pending_screenings (user_id, payload, created_at, synced) VALUES (?, ?, ?, 0)`,
    [userId, JSON.stringify(payload), new Date().toISOString()],
  );
  return res.lastInsertRowId;
}

export async function getUnsyncedScreenings() {
  const database = await getDB();
  return database.getAllAsync<{
    id: number;
    user_id: number;
    payload: string;
    created_at: string;
  }>(`SELECT * FROM pending_screenings WHERE synced = 0 ORDER BY created_at ASC`);
}

export async function markScreeningSynced(localId: number) {
  const database = await getDB();
  await database.runAsync(`UPDATE pending_screenings SET synced = 1 WHERE id = ?`, [localId]);
}

// ============ ORGANIZATIONS ============
export async function cacheOrganizations(orgs: any[]) {
  const database = await getDB();
  await database.execAsync(`DELETE FROM organizations`);
  for (const o of orgs) {
    const logoUrl = o.logo_url || (o.logo ? `https://www.openhands.co.bw/storage/${o.logo}` : null);
    await database.runAsync(
      `INSERT OR REPLACE INTO organizations (id, name, description, phone, whatsapp, email, website, map_link, logo, latitude, longitude, is_active, created_at, updated_at, logo_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        o.id,
        o.name,
        o.description,
        o.phone,
        o.whatsapp,
        o.email,
        o.website,
        o.map_link,
        o.logo,
        o.latitude,
        o.longitude,
        o.is_active ? 1 : 0,
        o.created_at,
        o.updated_at,
        logoUrl,
      ],
    );
  }
}

export async function getCachedOrganizations(): Promise<any[]> {
  const database = await getDB();
  return database.getAllAsync(`SELECT * FROM organizations ORDER BY name`);
}

// ============ SESSIONS ============
export async function cacheSessions(sessions: any[]) {
  const database = await getDB();
  await database.execAsync(`DELETE FROM sessions`);
  for (const s of sessions) {
    await database.runAsync(
      `INSERT OR REPLACE INTO sessions (id, title, description, session_date, session_time, location, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [s.id, s.title, s.description, s.session_date, s.session_time, s.location, s.image_url],
    );
  }
}

export async function getCachedSessions(): Promise<any[]> {
  const database = await getDB();
  return database.getAllAsync(`SELECT * FROM sessions ORDER BY session_date DESC`);
}

// ============ CHAT ============
export async function saveChatLocal(userId: number, sender: 'user' | 'bot', message: string) {
  const database = await getDB();
  await database.runAsync(
    `INSERT INTO chat_messages (user_id, sender, message, created_at) VALUES (?, ?, ?, ?)`,
    [userId, sender, message, new Date().toISOString()],
  );
}

export async function getChatLocal(userId: number) {
  const database = await getDB();
  return database.getAllAsync<{
    id: number;
    sender: string;
    message: string;
    created_at: string;
  }>(
    `SELECT id, sender, message, created_at FROM chat_messages
     WHERE user_id = ? ORDER BY created_at ASC LIMIT 100`,
    [userId],
  );
}

export async function clearChatLocal(userId: number) {
  const database = await getDB();
  await database.runAsync(`DELETE FROM chat_messages WHERE user_id = ?`, [userId]);
}

// ============ PANIC ============
export async function savePanicLocal(lat: number | null, lng: number | null): Promise<number> {
  const database = await getDB();
  const res = await database.runAsync(
    `INSERT INTO panic_logs (lat, lng, created_at, synced) VALUES (?, ?, ?, 0)`,
    [lat, lng, new Date().toISOString()],
  );
  return res.lastInsertRowId;
}

export async function getUnsyncedPanics() {
  const database = await getDB();
  return database.getAllAsync<{ id: number; lat: number; lng: number; created_at: string }>(
    `SELECT * FROM panic_logs WHERE synced = 0`,
  );
}

export async function markPanicSynced(localId: number) {
  const database = await getDB();
  await database.runAsync(`UPDATE panic_logs SET synced = 1 WHERE id = ?`, [localId]);
}