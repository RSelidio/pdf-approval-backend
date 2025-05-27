require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();

// Static file serving
app.use(cors());
app.use(express.json());
app.use('/files', express.static(path.join(__dirname, 'uploads')));
app.use(express.static('public'));

// Routes
app.use('/api', require('./routes/auth'));
app.use('/api/documents', require('./routes/documents'));

// SPA fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));


/*const msalConfig = {
  auth: {
    clientId: 'YOUR_CLIENT_ID',
    authority: 'https://login.microsoftonline.com/YOUR_TENANT_ID',
    clientSecret: 'YOUR_CLIENT_SECRET'
  }
};*/