// src/db.js
// Centralized SQLite connection used across the application.
// It creates the data directory if missing and opens the DB in WAL mode.
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });

const db = new DatabaseSync(path.join(DATA, 'gamedoro.db'));
// Ensure PRAGMAs are set (WAL + foreign keys)
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;`);

module.exports = db;
