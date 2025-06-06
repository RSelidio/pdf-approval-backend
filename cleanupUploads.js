const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// CONFIGURE as needed
const uploadsDir = path.join(__dirname, 'uploads');
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

(async () => {
  try {
    // 1. Get list of all files in /uploads
    const uploadFiles = await fs.promises.readdir(uploadsDir);

    // 2. Get all referenced document files from approvals
    const approvalsResult = await pool.query('SELECT document_url FROM approvals');
    const approvalFiles = approvalsResult.rows
      .map(row => row.document_url)
      .filter(url => url)
      .map(url => path.basename(url));

    // 3. Get all referenced signature images from users
    const usersResult = await pool.query('SELECT user_signature FROM users');
    const signatureFiles = usersResult.rows
      .map(row => row.user_signature)
      .filter(url => url)
      .map(url => path.basename(url));

    // 4. Combine all referenced files into a Set
    const referencedFiles = new Set([...approvalFiles, ...signatureFiles]);

    // 5. Find orphaned files (those not referenced in DB)
    const orphanedFiles = uploadFiles.filter(file => !referencedFiles.has(file));

    if (orphanedFiles.length === 0) {
      console.log('No orphaned files found. All files are referenced in DB.');
    } else {
      console.log('Deleting orphaned files:');
      for (const file of orphanedFiles) {
        const filePath = path.join(uploadsDir, file);
        await fs.promises.unlink(filePath);
        console.log('Deleted:', file);
      }
    }
    await pool.end();
  } catch (err) {
    console.error('Error cleaning up uploads:', err);
    process.exit(1);
  }
})();
