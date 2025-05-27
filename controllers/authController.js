const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

exports.register = async (req, res) => {
  try {
    const { username, password, email, full_name, role } = req.body;
    if (!username || !password || !email || !full_name) return res.status(400).json({ error: 'Missing fields' });
    const hash = await bcrypt.hash(password, 10);
    let signaturePath = req.file ? `/files/${req.file.filename}` : null;
    const result = await pool.query(
      'INSERT INTO users (username, password, email, full_name, user_signature, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, email, full_name, role, user_signature',
      [username, hash, email, full_name, signaturePath, role || 'user']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userResult.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = userResult.rows[0];
    if (!(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Invalid credentials' });
    delete user.password;
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, email: user.email, full_name: user.full_name, user_signature: user.user_signature },
      process.env.JWT_SECRET, { expiresIn: '8h' }
    );
    res.json({ token, user });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
