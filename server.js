const express = require('express');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// POST /data - receive measurement from ESP32 device
app.post('/data', (req, res) => {
  const { scale_id, weight, battery_mv } = req.body;

  if (!scale_id || weight === undefined || battery_mv === undefined) {
    return res.status(400).json({ error: 'Missing required fields: scale_id, weight, battery_mv' });
  }

  try {
    db.insertMeasurement(scale_id, weight, battery_mv);

    // Check for pending command
    const pending = db.getPendingCommand(scale_id);
    if (pending) {
      db.markCommandExecuted(pending.id);
      if (pending.command === 'set_interval') {
        return res.json({ command: 'set_interval', value: pending.value });
      } else if (pending.command === 'reset') {
        return res.json({ command: 'reset' });
      }
    }

    return res.json({ command: 'none' });
  } catch (err) {
    console.error('Error in POST /data:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/dashboard - returns all scales with latest measurement, 24h delta, interval
app.get('/api/dashboard', (req, res) => {
  try {
    const scales = db.getLatestMeasurements();

    const result = scales.map(scale => {
      let delta24h = null;
      if (scale.weight !== null && scale.weight !== undefined) {
        const measurement24h = db.getMeasurement24hAgo(scale.id);
        if (measurement24h) {
          delta24h = parseFloat((scale.weight - measurement24h.weight).toFixed(2));
        }
      }
      return {
        id: scale.id,
        name: scale.name,
        lat: scale.lat,
        lon: scale.lon,
        interval_minutes: scale.interval_minutes,
        weight: scale.weight !== undefined ? scale.weight : null,
        battery_mv: scale.battery_mv !== undefined ? scale.battery_mv : null,
        timestamp: scale.timestamp || null,
        delta24h,
      };
    });

    return res.json(result);
  } catch (err) {
    console.error('Error in GET /api/dashboard:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/history/:scale_id?days=N - returns history for N days (default 90, max 90)
app.get('/api/history/:scale_id', (req, res) => {
  const { scale_id } = req.params;
  const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 90));
  try {
    const history = db.getHistory(scale_id, days);
    return res.json(history);
  } catch (err) {
    console.error('Error in GET /api/history:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/command - insert a command
app.post('/api/command', (req, res) => {
  const { scale_id, command, value } = req.body;
  if (!scale_id || !command) {
    return res.status(400).json({ error: 'Missing scale_id or command' });
  }
  try {
    db.insertCommand(scale_id, command, value || '');
    return res.json({ success: true });
  } catch (err) {
    console.error('Error in POST /api/command:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/scales - returns scales config
app.get('/api/scales', (req, res) => {
  try {
    return res.json(db.getScales());
  } catch (err) {
    console.error('Error in GET /api/scales:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/scales/:id - update scale name and location
app.post('/api/scales/:id', (req, res) => {
  const { id } = req.params;
  const { name, lat, lon } = req.body;
  if (!name || lat === undefined || lon === undefined) {
    return res.status(400).json({ error: 'Missing name, lat, or lon' });
  }
  try {
    db.updateScale(id, name, parseFloat(lat), parseFloat(lon));
    return res.json({ success: true });
  } catch (err) {
    console.error('Error in POST /api/scales/:id:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET / - serve the dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Beehive server running on http://localhost:${PORT}`);
});
