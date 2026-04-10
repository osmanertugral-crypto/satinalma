require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db/schema');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/products', require('./routes/products'));
app.use('/api/prices', require('./routes/prices'));
app.use('/api/po', require('./routes/po'));
app.use('/api/rfq', require('./routes/rfq'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/import', require('./routes/import'));
app.use('/api/outlook', require('./routes/outlook'));
app.use('/api/warehouse', require('./routes/warehouse'));
app.use('/api/malzeme-ihtiyac', require('./routes/malzeme-ihtiyac'));
app.use('/api/finance', require('./routes/finance'));

// Üretim modunda React build'ini sun
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

// Hata yönetimi
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Sunucu hatası' });
});

// Veritabanını başlat ve sunucuyu başlat
initDb();
app.listen(PORT, () => {
  console.log(`Server çalışıyor: http://localhost:${PORT}`);
});
