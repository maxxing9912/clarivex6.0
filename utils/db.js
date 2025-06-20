// utils/db.js
const path = require('path');
const fs = require('fs');
const { QuickDB } = require('quick.db');

// Create a “data” folder in project root if missing
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const DB_FILE = path.join(dataDir, 'database.sqlite');
console.log('[db] SQLite path:', DB_FILE);

// Use the correct option for your quick.db version: { filePath: DB_FILE } or { file: DB_FILE }
const db = new QuickDB({ filePath: DB_FILE });

module.exports = db;