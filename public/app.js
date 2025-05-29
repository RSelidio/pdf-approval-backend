// Notification
function showNotification(msg) {
  const n = document.getElementById('notification');
  n.innerText = msg;
  n.style.display = 'block';
  setTimeout(() => { n.style.display = 'none'; }, 3500);
}

// NAV BAR with navigation
function renderNavbar() {
  const navLinks = document.getElementById('nav-user-links');
  const user = getUser && getUser();
  if (!navLinks) return;
  if (user && user.username) {
    navLinks.innerHTML = `
      <span class="nav-user">
        👤 <b>${user.full_name || user.username}</b> (${user.role || ''})
      </span>
      <a href="#" id="nav-upload">Upload PDF</a>
      <a href="#" id="nav-approvals">Approval Workflow</a>
      <a href="#" id="nav-logout" class="nav-logout-btn">Logout</a>
    `;
    document.getElementById('nav-logout').onclick = (e) => { e.preventDefault(); logout(); };
    document.getElementById('nav-upload').onclick = (e) => { e.preventDefault(); showPage('upload-page'); };
    document.getElementById('nav-approvals').onclick = async (e) => { e.preventDefault(); await loadApprovals(); showPage('approval-table-page'); };
  } else {
    navLinks.innerHTML = `
      <a href="#" id="nav-login">Login</a>
      <a href="#" id="nav-register">Register</a>
    `;
    document.getElementById('nav-login').onclick = (e) => { e.preventDefault(); showPage('auth-page'); };
    document.getElementById('nav-register').onclick = (e) => { e.preventDefault(); showPage('register-page'); };
  }
}

function setUserAuth(user, token) {
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('token', token);
  renderNavbar();
}
function clearUserAuth() {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  renderNavbar();
}
function getUser() {
  return JSON.parse(localStorage.getItem('user') || 'null');
}
function getToken() {
  return localStorage.getItem('token');
}
function showPage(page) {
  ['auth-page', 'register-page', 'upload-page', 'approval-table-page'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  const showEl = document.getElementById(page);
  if (showEl) showEl.classList.remove('hidden');
  renderNavbar();
}
function showLoggedInUser() {
  const user = getUser();
  if (user) {
    let sig = user.user_signature ? `<img class="signature-img" src="${user.user_signature}" title="Signature">` : '';
    let html = `<b>Logged in as:</b> ${user.full_name} <span style="color:#888;">(${user.username}, ${user.role})</span> ${sig} <button class="logout-btn" onclick="logout()">Logout</button>`;
    document.getElementById('user-info').innerHTML = html;
    document.getElementById('user-info-table').innerHTML = html;
  }
}

document.getElementById('show-register').onclick = e => { e.preventDefault(); showPage('register-page'); };
document.getElementById('show-login').onclick = e => { e.preventDefault(); showPage('auth-page'); };

document.addEventListener("DOMContentLoaded", async function () {
  renderNavbar();
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.onsubmit = async function (e) {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const statusDiv = document.getElementById('auth-status');
      statusDiv.style.color = "black";
      statusDiv.textContent = "Logging in...";
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.token) {
          setUserAuth(data.user, data.token);
          statusDiv.style.color = "green";
          statusDiv.textContent = "Login successful! Redirecting...";
          setTimeout(async () => {
            showLoggedInUser();
            await loadApprovals();
            showPage('approval-table-page');
          }, 800);
        } else {
          statusDiv.style.color = "red";
          statusDiv.textContent = data.error || "Login failed";
        }
      } catch (error) {
        statusDiv.style.color = "red";
        statusDiv.textContent = "Network error or server offline";
      }
    };
  }
  const token = getToken();
  if (token && getUser()) {
    showLoggedInUser();
    await loadApprovals();
    showPage('approval-table-page');
  } else {
    showPage('auth-page');
  }
});

document.getElementById('register-form').onsubmit = async function (e) {
  e.preventDefault();
  const username = document.getElementById('reg-username').value;
  const password = document.getElementById('reg-password').value;
  const email = document.getElementById('reg-email').value;
  const full_name = document.getElementById('reg-fullname').value;
  const signature = document.getElementById('reg-signature').files[0];
  const role = document.getElementById('reg-role').value;
  const formData = new FormData();
  formData.append('username', username);
  formData.append('password', password);
  formData.append('email', email);
  formData.append('full_name', full_name);
  if (signature) formData.append('user_signature', signature);
  formData.append('role', role);
  document.getElementById('register-status').textContent = 'Registering...';
  const res = await fetch('/api/register', {
    method: 'POST',
    body: formData
  });
  const data = await res.json();
  if (data.error) {
    document.getElementById('register-status').textContent = data.error;
  } else {
    document.getElementById('register-status').textContent = 'Registered! You can now log in.';
  }
};

function logout() {
  clearUserAuth();
  location.reload();
}

let uploadedPDF = null;
let previewURL = null;
const pdfInput = document.getElementById('pdf-upload');
const docNameInput = document.getElementById('doc-name');
const pdfCanvas = document.getElementById('pdf-canvas');
const ctx = pdfCanvas.getContext('2d');
const statusDiv = document.getElementById('upload-status');
if (pdfInput) {
  pdfInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    statusDiv.textContent = '';
    if (!file || file.type !== 'application/pdf') {
      statusDiv.textContent = 'Please upload a valid PDF file.';
      pdfCanvas.style.display = 'none';
      document.getElementById('to-approval-btn').style.display = 'none';
      return;
    }
    const fileReader = new FileReader();
    fileReader.onload = async function () {
      try {
        const typedarray = new Uint8Array(this.result);
        const pdfDoc = await pdfjsLib.getDocument({ data: typedarray }).promise;
        const page = await pdfDoc.getPage(1);
        const viewport = page.getViewport({ scale: 1.35 });
        pdfCanvas.width = viewport.width;
        pdfCanvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        pdfCanvas.style.display = 'block';
        document.getElementById('to-approval-btn').style.display = 'inline-block';
        uploadedPDF = file;
        if (previewURL) URL.revokeObjectURL(previewURL);
        previewURL = URL.createObjectURL(file);
      } catch (err) {
        statusDiv.textContent = 'Failed to load PDF: ' + err.message;
        pdfCanvas.style.display = 'none';
        document.getElementById('to-approval-btn').style.display = 'none';
      }
    };
    fileReader.readAsArrayBuffer(file);
  });
  document.getElementById('to-approval-btn').onclick = async () => {
    try {
      if (!uploadedPDF) {
        statusDiv.textContent = "Please upload a PDF first!";
        return;
      }
      const formData = new FormData();
      formData.append('pdf', uploadedPDF);
      formData.append('name', docNameInput.value);
      statusDiv.textContent = "Uploading...";
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + getToken()
        },
        body: formData,
      });
      if (!res.ok) {
        let msg = "";
        if (res.status === 401) {
          msg = "You must be logged in!";
          logout();
        } else {
          const errData = await res.json().catch(() => ({}));
          msg = errData.error || "Upload failed: " + res.statusText;
        }
        statusDiv.textContent = msg;
        console.error("Upload failed:", msg);
        return;
      }
      statusDiv.textContent = "Upload successful!";
      uploadedPDF = null;
      pdfInput.value = '';
      docNameInput.value = '';
      pdfCanvas.style.display = 'none';
      document.getElementById('to-approval-btn').style.display = 'none';
    } catch (e) {
      statusDiv.textContent = "JS Error: " + (e && e.message ? e.message : e);
      console.error(e);
    }
  };
  document.getElementById('goto-approval-btn').onclick = async () => {
    await loadApprovals();
    showPage('approval-table-page');
  };
}

document.getElementById('goto-upload-btn').onclick = () => showPage('upload-page');

async function loadApprovals() {
  const tbody = document.querySelector('#approval-table tbody');
  tbody.innerHTML = '<tr><td colspan="8">Loading...</td></tr>';
  try {
    const res = await fetch('/api/documents', {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    });
    const approvalData = await res.json();
    tbody.innerHTML = '';
    let hasAnyRow = false;
    const user = getUser();
    approvalData.forEach(row => {
      if (!row || !row.id || !row.document_name || !row.document_url || !row.status) return;
      hasAnyRow = true;
      let icon, iconClass, statClass;
      if (row.status === 'Approved') {
        icon = '✔️'; iconClass = 'circle-green'; statClass = 'status-approved';
      } else if (row.status === 'Rejected') {
        icon = '❌'; iconClass = 'circle-red'; statClass = 'status-rejected';
      } else {
        icon = '⏳'; iconClass = 'circle-yellow'; statClass = 'status-pending';
      }
      let actions = '';
      if (user && user.role === 'admin' && row.status === 'Pending') {
        actions = `<button class="approve-btn" onclick="updateStatus(${row.id}, 'approve')">Approve</button>
          <button class="reject-btn" onclick="updateStatus(${row.id}, 'reject')">Reject</button>`;
      }
      let linkCell = '';
      if (row.status === 'Approved') {
        // row.document_name holds your original file name (from the DB)
        linkCell = `<a href="${row.document_url}" target="_blank" download="${row.document_name}.pdf">Download PDF</a>`;
      } else {
        linkCell = `<a href="${row.document_url}" target="_blank">View PDF</a>`;
      }

      const uploadedAt = row.created_at ? new Date(row.created_at).toLocaleString() : '';
      const approvedAt = row.approved_at ? new Date(row.approved_at).toLocaleString() : '';
      const uploader = row.uploader_name || '';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="icon ${iconClass}">${icon}</span></td>
        <td>${row.document_name}</td>
        <td>${linkCell}</td>
        <td class="${statClass}" id="status-${row.id}">${row.status}</td>
        <td>${uploader}</td>
        <td>${uploadedAt}</td>
        <td>${approvedAt}</td>
        <td>${actions}</td>
      `;
      tbody.appendChild(tr);
    });
    if (!hasAnyRow) {
      tbody.innerHTML = '<tr><td colspan="8">No documents found.</td></tr>';
    }
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="8">Failed to load documents.</td></tr>';
    console.error(e);
  }
}
window.updateStatus = async function (id, action) {
  let endpoint = '';
  if (action === 'approve') endpoint = `approve`;
  if (action === 'reject') endpoint = `reject`;
  const res = await fetch(`/api/documents/${id}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + getToken()
    }
  });
  let data = {};
  try { data = await res.json(); } catch { }
  if (action === 'approve') {
    if (res.ok) {
      showNotification("Document approved and signed! Click the 'Download PDF' link to get the signed version.");
    } else {
      showNotification(data.error || "Approval failed!");
    }
  }
  if (action === 'reject') {
    if (res.ok) {
      showNotification("Document rejected.");
    } else {
      showNotification(data.error || "Reject failed!");
    }
  }
  loadApprovals();
};
