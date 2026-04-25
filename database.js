const fs = require('fs');
const path = require('path');

// Use DATA_DIR env var if set (for Railway Volume), else fallback to local dir
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DB_FILE = path.join(DATA_DIR, 'data.json');

// Ensure DATA_DIR exists (for Railway Volume mount)
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {}
}

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      scales: [
        { id: 'scale_1', name: 'כוורת 1', lat: 31.7683, lon: 35.2137, interval_minutes: 60 },
        { id: 'scale_2', name: 'כוורת 2', lat: 31.7690, lon: 35.2140, interval_minutes: 60 },
        { id: 'scale_3', name: 'כוורת 3', lat: 31.7695, lon: 35.2145, interval_minutes: 60 },
        { id: 'scale_4', name: 'כוורת 4', lat: 31.7700, lon: 35.2150, interval_minutes: 60 }
      ],
      measurements: [],
      commands: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function insertMeasurement(scale_id, weight, battery_mv) {
  const db = loadDB();
  db.measurements.push({ scale_id, weight, battery_mv, timestamp: new Date().toISOString() });
  if (db.measurements.length > 10000) db.measurements = db.measurements.slice(-10000);
  saveDB(db);
}

function getLatestMeasurements() {
  const db = loadDB();
  return db.scales.map(scale => {
    const measurements = db.measurements.filter(m => m.scale_id === scale.id);
    const latest = measurements.length > 0 ? measurements[measurements.length - 1] : null;
    return { ...scale, ...(latest || {}), latest_timestamp: latest ? latest.timestamp : null };
  });
}

function getMeasurement24hAgo(scale_id) {
  const db = loadDB();
  const target = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const measurements = db.measurements.filter(m => m.scale_id === scale_id);
  if (measurements.length === 0) return null;
  return measurements.reduce((closest, m) => {
    if (!closest) return m;
    return Math.abs(new Date(m.timestamp) - target) < Math.abs(new Date(closest.timestamp) - target) ? m : closest;
  }, null);
}

function getHistory(scale_id, days) {
  const db = loadDB();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db.measurements
    .filter(m => m.scale_id === scale_id && new Date(m.timestamp) >= cutoff)
    .map(m => ({ timestamp: m.timestamp, weight: m.weight }));
}

function getPendingCommand(scale_id) {
  const db = loadDB();
  return db.commands.find(c => c.scale_id === scale_id && !c.executed) || null;
}

function markCommandExecuted(command_id) {
  const db = loadDB();
  const cmd = db.commands.find(c => c.id === command_id);
  if (cmd) cmd.executed = true;
  saveDB(db);
}

function insertCommand(scale_id, command, value) {
  const db = loadDB();
  const id = Date.now();
  db.commands.push({ id, scale_id, command, value: value || '', executed: false, created_at: new Date().toISOString() });
  if (db.commands.length > 500) db.commands = db.commands.slice(-500);
  saveDB(db);
}

function getScales() {
  return loadDB().scales;
}

function updateScale(scale_id, name, lat, lon) {
  const db = loadDB();
  const scale = db.scales.find(s => s.id === scale_id);
  if (scale) {
    if (name !== undefined) scale.name = name;
    if (lat !== undefined) scale.lat = lat;
    if (lon !== undefined) scale.lon = lon;
    saveDB(db);
  }
}

function updateInterval(scale_id, interval_minutes) {
  const db = loadDB();
  const scale = db.scales.find(s => s.id === scale_id);
  if (scale) {
    scale.interval_minutes = interval_minutes;
    saveDB(db);
  }
}

module.exports = {
  insertMeasurement,
  getLatestMeasurements,
  getMeasurement24hAgo,
  getPendingCommand,
  markCommandExecuted,
  insertCommand,
  getHistory,
  getScales,
  updateScale,
  updateInterval
};
