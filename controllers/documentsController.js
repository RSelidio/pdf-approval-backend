const pool = require('../config/db');
const path = require('path');
const fs = require('fs');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const pdfjsLib = require('pdfjs-dist');

require('dotenv').config();

const fetch = global.fetch || ((...args) => import('node-fetch').then(({default: fetch}) => fetch(...args)));

const POWER_AUTOMATE_URL = process.env.POWER_AUTOMATE_URL || "";

async function notifyPowerAutomate(email, status, fileName, fileBase64) {
  if (!POWER_AUTOMATE_URL) return;
  try {
    const res = await fetch(POWER_AUTOMATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, status, fileName, fileBase64 })
    });
    if (!res.ok) {
      console.error('Failed to notify Power Automate:', await res.text());
    }
  } catch (err) {
    console.error('Error notifying Power Automate:', err);
  }
}

exports.uploadDocument = async (req, res) => {
  try {
    const name = req.body.name || req.file.originalname;
    const url = `/files/${req.file.filename}`;
    const uploader = req.user.id;
    const { rows } = await pool.query(
      'INSERT INTO approvals (document_name, document_url, status, created_at, updated_at, uploaded_by) VALUES ($1, $2, $3, NOW(), NOW(), $4) RETURNING *',
      [name, url, 'Pending', uploader]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.listDocuments = async (req, res) => {
  try {
    let query, params;
    if (req.user.role === 'admin') {
      query = `
        SELECT approvals.*, users.full_name AS uploader_name
        FROM approvals
        LEFT JOIN users ON approvals.uploaded_by = users.id
        ORDER BY approvals.id DESC
      `;
      params = [];
    } else {
      query = `
        SELECT approvals.*, users.full_name AS uploader_name
        FROM approvals
        LEFT JOIN users ON approvals.uploaded_by = users.id
        WHERE approvals.uploaded_by = $1
        ORDER BY approvals.id DESC
      `;
      params = [req.user.id];
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.approveDocument = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const { id } = req.params;
    // Get document info
    const docResult = await pool.query(
      'SELECT a.*, u.user_signature, u.full_name FROM approvals a LEFT JOIN users u ON a.uploaded_by = u.id WHERE a.id = $1',
      [id]
    );
    if (!docResult.rows.length) return res.status(404).json({ error: 'Document not found' });
    const document = docResult.rows[0];

    const pdfPath = path.join(__dirname, '..', document.document_url.replace(/^\/files\//, 'uploads/'));
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfUint8 = new Uint8Array(pdfBytes);

    // Find keyword location on last page using pdfjs-dist
    const keywordAtentamente = "ATENTAMENTE.";
    const keywordName = "JOSEPH JUI CHANG HSU";
    let anchorAtent = null, anchorName = null, pos = {};

    const loadingTask = pdfjsLib.getDocument({ data: pdfUint8 });
    const pdf = await loadingTask.promise;
    const lastPageNum = pdf.numPages;
    const page = await pdf.getPage(lastPageNum);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();

    function findKeyword(items, keyword) {
      keyword = keyword.trim().toUpperCase();
      for (const item of items) {
        const itemText = item.str.trim().toUpperCase();
        if (itemText.includes(keyword)) {
          return {
            x: item.transform[4],
            y: item.transform[5],
            width: item.width,
            height: item.height
          };
        }
      }
      return null;
    }
    anchorAtent = findKeyword(textContent.items, keywordAtentamente);
    anchorName = findKeyword(textContent.items, keywordName);

    const sigW = 220, sigH = 80; // Make the image obvious

    if (anchorAtent) {
      let sigX = anchorAtent.x + (anchorAtent.width / 2) - (sigW / 2);
      let sigY = anchorAtent.y - sigH - 10;
      if (anchorName) {
        sigY = anchorName.y + ((anchorAtent.y - anchorName.y) / 2) - (sigH / 2);
      }
      pos = { sigX, sigY, sigW, sigH };
    } else if (anchorName) {
      let sigX = anchorName.x + (anchorName.width / 2) - (sigW / 2);
      let sigY = anchorName.y + 18;
      pos = { sigX, sigY, sigW, sigH };
    } else {
      pos = { sigX: 50, sigY: 50, sigW, sigH }; // If nothing found, lower left
    }

    // ==== USE YOUR TEST SIGNATURE IMAGE ====
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    let drewImage = false;

    const testSigPath = path.join(__dirname, '..', 'uploads', '1748497263030-test_signature.png');
    console.log('Test signature image file exists:', fs.existsSync(testSigPath));
    try {
      const signatureImageBytes = fs.readFileSync(testSigPath);
      const signatureImage = await pdfDoc.embedPng(signatureImageBytes);
      lastPage.drawImage(signatureImage, {
        x: pos.sigX,
        y: pos.sigY,
        width: pos.sigW,
        height: pos.sigH,
      });
      drewImage = true;
      console.log('Test signature image embedded!');
    } catch (err) {
      console.log('ERROR EMBEDDING TEST IMAGE:', err);
      // fallback to text if test fails
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
      lastPage.drawText(document.full_name || 'APPROVED', {
        x: pos.sigX,
        y: pos.sigY,
        size: 22,
        font: font,
        color: rgb(0.11, 0.19, 0.65)
      });
    }

    const signedPdfBytes = await pdfDoc.save();
    const signedFilename = pdfPath.replace(/\.pdf$/i, '_signed.pdf');
    fs.writeFileSync(signedFilename, signedPdfBytes);
    const signedRelUrl = '/files/' + path.basename(signedFilename);
    await pool.query(
      "UPDATE approvals SET status = 'Approved', document_url = $1, updated_at = NOW(), approved_at = NOW() WHERE id = $2",
      [signedRelUrl, id]
    );

    // Notify Power Automate (send file as base64)
    const uploaderRes = await pool.query('SELECT email FROM users WHERE id = $1', [document.uploaded_by]);
    const uploaderEmail = uploaderRes.rows[0]?.email;
    if (uploaderEmail) {
      const signedPdfBuffer = fs.readFileSync(signedFilename);
      const signedPdfBase64 = signedPdfBuffer.toString('base64');
      notifyPowerAutomate(
        uploaderEmail,
        'Approved',
        path.basename(signedFilename),
        signedPdfBase64
      );
    }

    res.json({ message: drewImage ? 'Approved and signed with image!' : 'Approved and signed with text!', signed_pdf: signedRelUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.rejectDocument = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const { id } = req.params;
    await pool.query(
      "UPDATE approvals SET status = 'Rejected', updated_at = NOW() WHERE id = $1",
      [id]
    );
    const docRes = await pool.query('SELECT * FROM approvals WHERE id = $1', [id]);
    const document = docRes.rows[0];
    if (document) {
      const uploaderRes = await pool.query('SELECT email FROM users WHERE id = $1', [document.uploaded_by]);
      const uploaderEmail = uploaderRes.rows[0]?.email;
      if (uploaderEmail) {
        let fileBase64 = '';
        let fileName = '';
        notifyPowerAutomate(
          uploaderEmail,
          'Rejected',
          fileName,
          fileBase64
        );
      }
    }
    res.json({ message: 'Document rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
