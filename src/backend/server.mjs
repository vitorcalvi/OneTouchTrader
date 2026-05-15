import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 5171;

app.get('/api/alpaca/health', (_req, res) => {
  res.json({ hasPaperKeys: true, hasLiveKeys: false });
});

app.get('/api/alpaca/quotes', (req, res) => {
  const symbols = (req.query.symbols || '').toString().split(',').filter(Boolean);
  const out = {};
  for (const s of symbols) {
    out[s] = { ap: 100 + Math.random(), bp: 99 + Math.random() };
  }
  res.json(out);
});

app.get('/api/alpaca/positions', (_req, res) => {
  res.json([]);
});

app.get('/api/alpaca/orders', (_req, res) => {
  res.json([]);
});

app.post('/api/alpaca/orders', (req, res) => {
  const payload = req.body || {};
  const id = `order-${Math.floor(Math.random()*100000)}`;
  const created = { id, status: 'new', ...payload };
  res.json(created);
});

app.get('/api/alpaca/account', (_req, res) => {
  res.json({ cash: '100000.00', portfolio_value: '100000.00' });
});

app.get('/api/alpaca/getBars', (_req, res) => {
  res.json([]);
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Lean backend proxy listening on http://localhost:${PORT}`);
});
