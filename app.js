const STORES = ["Calliope Quality Meats", "Kin Kora Meats", "Tannum Meats"];
const STORE_ALIASES = {
  "Kingaroy Meats": "Kin Kora Meats",
  "Calliope Meats": "Calliope Quality Meats"
};
const STORAGE_KEY = "butcher-specials-hub-v1";
const CLOUD_SETTINGS_KEY = "butcher-specials-cloud-settings-v1";
const AUTH_KEY = "butcher-specials-auth-v1";
const SESSION_KEY = "butcher-specials-session-v1";

const state = loadState();
const cloudSettings = loadCloudSettings();
let authMode = "login";

function defaultState() {
  return { specials: [], results: [], suppliers: [], invoices: [] };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultState();
  try {
    const loaded = { ...defaultState(), ...JSON.parse(raw) };
    loaded.specials = loaded.specials.map((special) => ({
      ...special,
      stores: (special.stores || []).map(normalizeStoreName)
    }));
    loaded.results = loaded.results.map((result) => ({
      ...result,
      store: normalizeStoreName(result.store)
    }));
    return loaded;
  } catch {
    return defaultState();
  }
}

function normalizeStoreName(store) {
  return STORE_ALIASES[store] || store;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (cloudSettings.autoSync && cloudSettings.url) syncToCloud({ quiet: true });
}

function loadAuth() {
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try { return normalizeAuth(JSON.parse(raw)); } catch { return null; }
}

function normalizeAuth(auth) {
  if (!auth) return null;
  if (Array.isArray(auth.accounts)) {
    return {
      version: 2,
      accounts: auth.accounts.map((account) => ({
        ...account,
        store: normalizeStoreName(account.store)
      }))
    };
  }
  if (auth.username && auth.passwordHash) {
    return {
      version: 2,
      accounts: [{
        id: id(), username: auth.username, salt: auth.salt,
        passwordHash: auth.passwordHash, role: "admin", store: "",
        createdAt: auth.createdAt || new Date().toISOString()
      }]
    };
  }
  return null;
}

function saveAuth(auth) { localStorage.setItem(AUTH_KEY, JSON.stringify(normalizeAuth(auth))); }
function authAccounts() { return loadAuth()?.accounts || []; }
function currentUser() {
  const username = sessionStorage.getItem(SESSION_KEY);
  if (!username) return null;
  return authAccounts().find((account) => account.username.toLowerCase() === username.toLowerCase()) || null;
}
function isAdmin() { return currentUser()?.role === "admin"; }
function bytesToHex(buffer) { return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function randomHex(length = 16) {
  const bytes = new Uint8Array(length); crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function generatedPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = ""; const bytes = new Uint8Array(12); crypto.getRandomValues(bytes);
  bytes.forEach((byte) => { value += alphabet[byte % alphabet.length]; }); return value;
}
async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  return bytesToHex(await crypto.subtle.digest("SHA-256", data));
}
function setAuthMessage(message) { document.querySelector("#authMessage").textContent = message || ""; }
function showAuth() {
  const auth = loadAuth(); authMode = auth ? "login" : "setup";
  document.querySelector("#authScreen").hidden = false; document.querySelector("#appShell").hidden = true;
  document.querySelector("#authTitle").textContent = auth ? "Login" : "Create login";
  document.querySelector("#authHelp").textContent = auth ? "Enter your login to open the specials database." : "Set the first login for this app on this device. Use the same login after restoring or syncing your data.";
  document.querySelector("#authSubmit").textContent = auth ? "Login" : "Create login";
  document.querySelector("#authConfirmWrap").hidden = Boolean(auth);
  document.querySelector("#authUsername").value = ""; document.querySelector("#authPassword").value = ""; document.querySelector("#authConfirmPassword").value = ""; setAuthMessage("");
}
function showApp() {
  document.querySelector("#authScreen").hidden = true; document.querySelector("#appShell").hidden = false;
  document.querySelector("#currentUser").textContent = `${currentUser()?.username || "User"}${currentUser()?.store ? ` - ${currentUser().store}` : ""}`;
  applyPermissions(); renderAll();
}
function applyPermissions() {
  document.querySelectorAll(".admin-only").forEach((element) => { element.hidden = !isAdmin(); });
  const user = currentUser();
  if (user?.store) {
    document.querySelector("#sheetStore").value = user.store; document.querySelector("#sheetStore").disabled = true;
    document.querySelector("#resultStore").value = user.store; document.querySelector("#resultStore").disabled = true;
  } else {
    document.querySelector("#sheetStore").disabled = false; document.querySelector("#resultStore").disabled = false;
  }
}
async function wireAuth() {
  document.querySelector("#authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = document.querySelector("#authUsername").value.trim();
    const password = document.querySelector("#authPassword").value;
    const confirmPassword = document.querySelector("#authConfirmPassword").value;
    if (password.length < 6) { setAuthMessage("Use at least 6 characters."); return; }
    if (authMode === "setup") {
      if (password !== confirmPassword) { setAuthMessage("Passwords do not match."); return; }
      const salt = randomHex(); const passwordHash = await hashPassword(password, salt);
      saveAuth({ version: 2, accounts: [{ id: id(), username, salt, passwordHash, role: "admin", store: "", createdAt: new Date().toISOString() }] });
      sessionStorage.setItem(SESSION_KEY, username); showApp(); return;
    }
    const account = authAccounts().find((item) => item.username.toLowerCase() === username.toLowerCase());
    if (!account || await hashPassword(password, account.salt) !== account.passwordHash) { setAuthMessage("Incorrect username or password."); return; }
    sessionStorage.setItem(SESSION_KEY, account.username); showApp();
  });
  document.querySelector("#logoutBtn").addEventListener("click", () => { sessionStorage.removeItem(SESSION_KEY); showAuth(); });
}
function loadCloudSettings() {
  const raw = localStorage.getItem(CLOUD_SETTINGS_KEY);
  if (!raw) return { url: "", key: "butcher-specials-hub", autoSync: false };
  try { return { url: "", key: "butcher-specials-hub", autoSync: false, ...JSON.parse(raw) }; }
  catch { return { url: "", key: "butcher-specials-hub", autoSync: false }; }
}
function saveCloudSettings() { localStorage.setItem(CLOUD_SETTINGS_KEY, JSON.stringify(cloudSettings)); renderCloudStatus(); }
function exportPayload() { return { ...state, auth: loadAuth(), exportedAt: new Date().toISOString() }; }
function cloudEndpoint() {
  if (!cloudSettings.url) return "";
  return `${cloudSettings.url.replace(/\/$/, "")}/${encodeURIComponent(cloudSettings.key || "butcher-specials-hub")}.json`;
}
function setCloudStatus(text) { document.querySelector("#cloudStatus").textContent = text; }
function renderCloudStatus() { setCloudStatus(!cloudSettings.url ? "Local only" : cloudSettings.autoSync ? "Cloud auto sync" : "Cloud ready"); }
async function syncToCloud(options = {}) {
  const endpoint = cloudEndpoint(); if (!endpoint) { if (!options.quiet) alert("Add your Firebase database URL first."); return; }
  try {
    setCloudStatus("Syncing...");
    const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...exportPayload(), cloudUpdatedAt: new Date().toISOString() }) });
    if (!response.ok) throw new Error(`Cloud save failed: ${response.status}`);
    setCloudStatus("Cloud saved"); if (!options.quiet) alert("Saved to cloud.");
  } catch (error) { setCloudStatus("Cloud error"); if (!options.quiet) alert(error.message); }
}
async function syncFromCloud() {
  const endpoint = cloudEndpoint(); if (!endpoint) { alert("Add your Firebase database URL first."); return; }
  if (!confirm("Replace this device's local data with the cloud copy?")) return;
  try {
    setCloudStatus("Syncing..."); const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`Cloud load failed: ${response.status}`);
    const cloudState = await response.json(); if (!cloudState) throw new Error("No cloud data found yet. Use Sync to cloud first.");
    Object.assign(state, defaultState(), cloudState);
    if (cloudState.auth) { saveAuth(cloudState.auth); delete state.auth; }
    delete state.cloudUpdatedAt; delete state.exportedAt;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); renderAll(); setCloudStatus("Cloud loaded");
  } catch (error) { setCloudStatus("Cloud error"); alert(error.message); }
}
function id() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function money(value) { return Number(value || 0).toLocaleString("en-AU", { style: "currency", currency: "AUD" }); }
function number(value) { return Number(value || 0).toLocaleString("en-AU", { maximumFractionDigits: 2 }); }
function gpMargin(buy, sell) { const sellNum = Number(sell || 0); return sellNum ? ((sellNum - Number(buy || 0)) / sellNum) * 100 : 0; }
function csvEscape(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
function download(filename, content, type = "text/plain") {
  const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}
function selectedOptions(select) { return Array.from(select.selectedOptions).map((option) => option.value); }
function setDefaultWeek() {
  const input = document.querySelector("#weekStarting"); const sheet = document.querySelector("#sheetWeek"); const today = new Date(); const day = today.getDay();
  today.setDate(today.getDate() + (day === 0 ? -6 : 1 - day)); const value = today.toISOString().slice(0, 10); input.value = value; sheet.value = value;
}
function wireTabs() {
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active")); document.querySelectorAll(".view").forEach((view) => view.classList.remove("active-view"));
    tab.classList.add("active"); document.querySelector(`#${tab.dataset.view}`).classList.add("active-view"); renderAll();
  }));
}
function wireSpecialForm() {
  const form = document.querySelector("#specialForm"); const buy = document.querySelector("#purchasePrice"); const sell = document.querySelector("#sellPrice"); const preview = document.querySelector("#gpPreview");
  const updatePreview = () => { preview.textContent = `${gpMargin(buy.value, sell.value).toFixed(1)}%`; };
  buy.addEventListener("input", updatePreview); sell.addEventListener("input", updatePreview);
  form.addEventListener("submit", (event) => {
    event.preventDefault(); const editingId = document.querySelector("#editingId").value;
    const record = { id: editingId || id(), weekStarting: document.querySelector("#weekStarting").value, productName: document.querySelector("#productName").value.trim(), cutNotes: document.querySelector("#cutNotes").value.trim(), supplierName: document.querySelector("#supplierName").value.trim(), purchasePrice: Number(buy.value), sellPrice: Number(sell.value), unit: document.querySelector("#unit").value, stores: selectedOptions(document.querySelector("#stores")), promoText: document.querySelector("#promoText").value.trim(), internalNote: document.querySelector("#internalNote").value.trim(), updatedAt: new Date().toISOString() };
    if (!record.stores.length) record.stores = [...STORES]; const index = state.specials.findIndex((special) => special.id === editingId);
    if (index >= 0) state.specials[index] = record; else state.specials.unshift(record);
    upsertSupplier(record.supplierName); saveState(); form.reset(); document.querySelector("#editingId").value = ""; document.querySelector("#saveSpecialBtn").textContent = "Save special"; setDefaultWeek(); updatePreview(); renderAll();
  });
  document.querySelector("#resetFormBtn").addEventListener("click", () => { form.reset(); document.querySelector("#editingId").value = ""; document.querySelector("#saveSpecialBtn").textContent = "Save special"; setDefaultWeek(); updatePreview(); });
}
function editSpecial(specialId) {
  const special = state.specials.find((item) => item.id === specialId); if (!special) return; document.querySelector('[data-view="entry"]').click();
  document.querySelector("#editingId").value = special.id; document.querySelector("#weekStarting").value = special.weekStarting; document.querySelector("#productName").value = special.productName;
  document.querySelector("#cutNotes").value = special.cutNotes; document.querySelector("#supplierName").value = special.supplierName; document.querySelector("#purchasePrice").value = special.purchasePrice;
  document.querySelector("#sellPrice").value = special.sellPrice; document.querySelector("#unit").value = special.unit;
  Array.from(document.querySelector("#stores").options).forEach((option) => { option.selected = special.stores.includes(option.value); });
  document.querySelector("#promoText").value = special.promoText; document.querySelector("#internalNote").value = special.internalNote;
  document.querySelector("#gpPreview").textContent = `${gpMargin(special.purchasePrice, special.sellPrice).toFixed(1)}%`; document.querySelector("#saveSpecialBtn").textContent = "Update special";
}
function deleteSpecial(specialId) { if (!confirm("Delete this special?")) return; state.specials = state.specials.filter((item) => item.id !== specialId); state.results = state.results.filter((item) => item.specialId !== specialId); saveState(); renderAll(); }
function renderSpecials() {
  const tbody = document.querySelector("#specialsTable"); const query = document.querySelector("#searchSpecials").value.trim().toLowerCase(); const user = currentUser();
  const rows = state.specials.filter((special) => !user?.store || special.stores.includes(user.store)).filter((special) => [special.weekStarting, special.productName, special.supplierName, special.stores.join(" "), special.internalNote].join(" ").toLowerCase().includes(query)).sort((a, b) => b.weekStarting.localeCompare(a.weekStarting)).map((special) => `<tr><td>${special.weekStarting}</td><td><strong>${special.productName}</strong><br>${special.cutNotes || ""}</td><td>${special.supplierName}</td><td>${money(special.purchasePrice)} / ${special.unit}</td><td>${money(special.sellPrice)} / ${special.unit}</td><td class="metric">${gpMargin(special.purchasePrice, special.sellPrice).toFixed(1)}%</td><td>${special.stores.join("<br>")}</td><td><div class="row-actions"><button type="button" onclick="editSpecial('${special.id}')">Edit</button><button type="button" class="danger" onclick="deleteSpecial('${special.id}')">Delete</button></div></td></tr>`);
  tbody.innerHTML = rows.join("") || `<tr><td colspan="8" class="empty">No specials yet.</td></tr>`;
}
function renderSheet() {
  const area = document.querySelector("#printArea"); const week = document.querySelector("#sheetWeek").value; const user = currentUser(); const store = user?.store || document.querySelector("#sheetStore").value;
  const specials = state.specials.filter((special) => !week || special.weekStarting === week).filter((special) => store === "All stores" || special.stores.includes(store)).sort((a, b) => a.productName.localeCompare(b.productName));
  const title = store === "All stores" ? "All Stores" : store;
  area.innerHTML = `<div class="sheet-header"><div><div class="sheet-title">${title}</div><div>Weekly specials starting ${week || "all weeks"}</div></div><div>${new Date().toLocaleDateString("en-AU")}</div></div><table><thead><tr><th>Product</th><th>Promo</th><th>Sell price</th><th>Supplier</th><th>Notes</th></tr></thead><tbody>${specials.map((special) => `<tr><td><strong>${special.productName}</strong><br>${special.cutNotes || ""}</td><td>${special.promoText || "Weekly special"}</td><td class="price">${money(special.sellPrice)} / ${special.unit}</td><td>${special.supplierName}</td><td>${special.internalNote || ""}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">No specials match this week and store.</td></tr>`}</tbody></table>`;
}
function renderResults() {
  const user = currentUser(); const specialSelect = document.querySelector("#resultSpecial");
  specialSelect.innerHTML = state.specials.filter((special) => !user?.store || special.stores.includes(user.store)).sort((a, b) => b.weekStarting.localeCompare(a.weekStarting)).map((special) => `<option value="${special.id}">${special.weekStarting} - ${special.productName}</option>`).join("");
  const tbody = document.querySelector("#resultsTable");
  tbody.innerHTML = state.results.filter((result) => !user?.store || result.store === user.store).map((result) => {
    const special = state.specials.find((item) => item.id === result.specialId); if (!special) return ""; const qty = Number(result.quantitySold || 0); const revenue = qty * Number(special.sellPrice || 0); const grossProfit = qty * (Number(special.sellPrice || 0) - Number(special.purchasePrice || 0)) - Number(result.wasteCost || 0);
    return `<tr><td>${special.weekStarting}</td><td>${special.productName}</td><td>${result.store}</td><td>${number(qty)} ${special.unit}</td><td>${money(revenue)}</td><td class="metric">${money(grossProfit)}</td><td>${result.note || ""}</td><td><button type="button" class="danger" onclick="deleteResult('${result.id}')">Delete</button></td></tr>`;
  }).join("") || `<tr><td colspan="8" class="empty">No store results logged yet.</td></tr>`;
}
function wireResultForm() {
  document.querySelector("#resultForm").addEventListener("submit", (event) => {
    event.preventDefault(); if (!document.querySelector("#resultSpecial").value) return;
    state.results.unshift({ id: id(), specialId: document.querySelector("#resultSpecial").value, store: currentUser()?.store || document.querySelector("#resultStore").value, quantitySold: Number(document.querySelector("#quantitySold").value), wasteCost: Number(document.querySelector("#wasteCost").value || 0), note: document.querySelector("#resultNote").value.trim(), createdAt: new Date().toISOString() });
    saveState(); event.target.reset(); renderAll();
  });
}
function deleteResult(resultId) { state.results = state.results.filter((item) => item.id !== resultId); saveState(); renderAll(); }
function upsertSupplier(name) { const cleanName = name.trim(); if (!cleanName) return; if (!state.suppliers.some((supplier) => supplier.name.toLowerCase() === cleanName.toLowerCase())) state.suppliers.push({ id: id(), name: cleanName, contact: "", phone: "", notes: "" }); }
function wireSupplierForm() {
  document.querySelector("#supplierForm").addEventListener("submit", (event) => {
    event.preventDefault(); const name = document.querySelector("#supplierRecordName").value.trim(); const existing = state.suppliers.find((supplier) => supplier.name.toLowerCase() === name.toLowerCase());
    const record = { id: existing?.id || id(), name, contact: document.querySelector("#supplierContact").value.trim(), phone: document.querySelector("#supplierPhone").value.trim(), notes: document.querySelector("#supplierNotes").value.trim() };
    if (existing) Object.assign(existing, record); else state.suppliers.push(record); saveState(); event.target.reset(); renderAll();
  });
}
function renderSuppliers() {
  const allNames = new Set([...state.suppliers.map((supplier) => supplier.name), ...state.specials.map((special) => special.supplierName)].filter(Boolean));
  document.querySelector("#supplierList").innerHTML = Array.from(allNames).sort().map((name) => `<option value="${name}"></option>`).join("");
  document.querySelector("#supplierCards").innerHTML = Array.from(allNames).sort().map((name) => { const supplier = state.suppliers.find((item) => item.name === name) || { name }; const specials = state.specials.filter((special) => special.supplierName === name).length; return `<article class="card"><h3>${supplier.name}</h3><p><strong>Special lines:</strong> ${specials}</p><p><strong>Contact:</strong> ${supplier.contact || "-"}</p><p><strong>Phone/email:</strong> ${supplier.phone || "-"}</p><p>${supplier.notes || ""}</p></article>`; }).join("") || `<div class="empty">No suppliers yet.</div>`;
}
function wireInvoiceForm() {
  document.querySelector("#invoiceForm").addEventListener("submit", (event) => {
    event.preventDefault(); const file = document.querySelector("#invoiceFile").files[0]; const supplier = document.querySelector("#invoiceSupplier").value.trim();
    state.invoices.unshift({ id: id(), supplier, invoiceDate: document.querySelector("#invoiceDate").value, invoiceNumber: document.querySelector("#invoiceNumber").value.trim(), fileName: file?.name || "", notes: document.querySelector("#invoiceNotes").value.trim(), createdAt: new Date().toISOString() });
    if (supplier) upsertSupplier(supplier); saveState(); event.target.reset(); renderAll();
  });
}
function renderInvoices() { document.querySelector("#invoiceCards").innerHTML = state.invoices.map((invoice) => `<article class="card"><h3>${invoice.supplier || "Supplier not entered"}</h3><p><strong>Date:</strong> ${invoice.invoiceDate || "-"}</p><p><strong>Invoice:</strong> ${invoice.invoiceNumber || "-"}</p><p><strong>File noted:</strong> ${invoice.fileName || "-"}</p><p>${invoice.notes || ""}</p><button type="button" class="danger" onclick="deleteInvoice('${invoice.id}')">Delete</button></article>`).join("") || `<div class="empty">No invoice notes yet.</div>`; }
function deleteInvoice(invoiceId) { state.invoices = state.invoices.filter((item) => item.id !== invoiceId); saveState(); renderAll(); }
function specialsCsv(records = state.specials) {
  const header = ["Week", "Product", "Cut notes", "Supplier", "Purchase price", "Sell price", "Unit", "GP margin", "Stores", "Promo", "Internal note"];
  const rows = records.map((special) => [special.weekStarting, special.productName, special.cutNotes, special.supplierName, special.purchasePrice, special.sellPrice, special.unit, `${gpMargin(special.purchasePrice, special.sellPrice).toFixed(1)}%`, special.stores.join("; "), special.promoText, special.internalNote]);
  return [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}
function wireExports() {
  document.querySelector("#exportSpecialsCsv").addEventListener("click", () => download("butcher-specials.csv", specialsCsv(), "text/csv"));
  document.querySelector("#exportSheetCsv").addEventListener("click", () => { const week = document.querySelector("#sheetWeek").value; const store = document.querySelector("#sheetStore").value; const records = state.specials.filter((special) => !week || special.weekStarting === week).filter((special) => store === "All stores" || special.stores.includes(store)); download(`weekly-sheet-${week || "all"}-${store.replaceAll(" ", "-")}.csv`, specialsCsv(records), "text/csv"); });
  document.querySelector("#backupBtn").addEventListener("click", () => download(`butcher-specials-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exportPayload(), null, 2), "application/json"));
  document.querySelector("#restoreInput").addEventListener("change", (event) => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const restored = JSON.parse(reader.result); Object.assign(state, defaultState(), restored); if (restored.auth) { localStorage.setItem(AUTH_KEY, JSON.stringify(restored.auth)); delete state.auth; } delete state.exportedAt; delete state.cloudUpdatedAt; saveState(); renderAll(); } catch { alert("That backup file could not be read."); } }; reader.readAsText(file); });
  document.querySelector("#printSheet").addEventListener("click", () => window.print());
}
function wireCloud() {
  document.querySelector("#cloudUrl").value = cloudSettings.url; document.querySelector("#cloudKey").value = cloudSettings.key; document.querySelector("#cloudAutoSync").checked = cloudSettings.autoSync;
  document.querySelector("#cloudForm").addEventListener("submit", (event) => { event.preventDefault(); cloudSettings.url = document.querySelector("#cloudUrl").value.trim(); cloudSettings.key = document.querySelector("#cloudKey").value.trim() || "butcher-specials-hub"; cloudSettings.autoSync = document.querySelector("#cloudAutoSync").checked; saveCloudSettings(); alert("Cloud settings saved."); });
  document.querySelector("#syncUpBtn").addEventListener("click", () => syncToCloud()); document.querySelector("#syncDownBtn").addEventListener("click", () => syncFromCloud()); renderCloudStatus();
}
async function accountRecord({ existing, username, password, role, store }) { const salt = randomHex(); const passwordHash = await hashPassword(password, salt); return { id: existing?.id || id(), username, salt, passwordHash, role, store: role === "store" ? store : "", createdAt: existing?.createdAt || new Date().toISOString() }; }
function storeAuthAccounts(accounts) { saveAuth({ version: 2, accounts }); if (currentUser()) sessionStorage.setItem(SESSION_KEY, currentUser().username); saveState(); }
function showGeneratedPasswords(lines) { const box = document.querySelector("#generatedPasswords"); if (!lines.length) { box.hidden = true; box.innerHTML = ""; return; } box.hidden = false; box.innerHTML = `<strong>Temporary passwords - record these now:</strong><br>${lines.map((line) => `${line.username}: ${line.password}`).join("<br>")}`; }
function clearAccountForm() { document.querySelector("#accountForm").reset(); document.querySelector("#accountEditingId").value = ""; document.querySelector("#saveAccountBtn").textContent = "Save account"; }
async function wireAccounts() {
  document.querySelector("#accountForm").addEventListener("submit", async (event) => {
    event.preventDefault(); if (!isAdmin()) return; const editingId = document.querySelector("#accountEditingId").value; const username = document.querySelector("#accountUsername").value.trim(); const role = document.querySelector("#accountRole").value; const store = document.querySelector("#accountStore").value; const existingAccounts = authAccounts(); const existing = existingAccounts.find((account) => account.id === editingId); const duplicate = existingAccounts.find((account) => account.username.toLowerCase() === username.toLowerCase() && account.id !== editingId);
    if (duplicate) { alert("That username already exists."); return; } let password = document.querySelector("#accountPassword").value.trim(); const generated = !password; if (!password) password = generatedPassword(); if (password.length < 6) { alert("Use at least 6 characters."); return; }
    const record = await accountRecord({ existing, username, password, role, store }); const accounts = existing ? existingAccounts.map((account) => account.id === existing.id ? record : account) : [...existingAccounts, record]; storeAuthAccounts(accounts); showGeneratedPasswords(generated ? [{ username, password }] : []); clearAccountForm(); renderAll();
  });
  document.querySelector("#clearAccountBtn").addEventListener("click", () => { clearAccountForm(); showGeneratedPasswords([]); });
  document.querySelector("#createStoreAccountsBtn").addEventListener("click", async () => {
    if (!isAdmin()) return; const existingAccounts = authAccounts(); const created = []; const additions = [];
    for (const store of STORES) {
      const username = store === "Calliope Quality Meats" ? "calliope" : store.toLowerCase().replace(" meats", "").replaceAll(" ", "");
      if (existingAccounts.some((account) => account.username.toLowerCase() === username)) continue; const password = generatedPassword(); additions.push(await accountRecord({ username, password, role: "store", store })); created.push({ username, password });
    }
    if (!additions.length) { alert("The three store accounts already exist."); return; } storeAuthAccounts([...existingAccounts, ...additions]); showGeneratedPasswords(created); renderAll();
  });
}
function editAccount(accountId) { if (!isAdmin()) return; const account = authAccounts().find((item) => item.id === accountId); if (!account) return; document.querySelector("#accountEditingId").value = account.id; document.querySelector("#accountUsername").value = account.username; document.querySelector("#accountPassword").value = ""; document.querySelector("#accountRole").value = account.role; document.querySelector("#accountStore").value = account.store || ""; document.querySelector("#saveAccountBtn").textContent = "Update account"; showGeneratedPasswords([]); }
function deleteAccount(accountId) { if (!isAdmin()) return; const accounts = authAccounts(); const account = accounts.find((item) => item.id === accountId); if (!account) return; if (account.username === currentUser()?.username) { alert("You cannot delete the account you are logged in with."); return; } if (!confirm(`Delete account ${account.username}?`)) return; storeAuthAccounts(accounts.filter((item) => item.id !== accountId)); renderAll(); }
function renderAccounts() {
  const table = document.querySelector("#accountsTable"); if (!table) return; if (!isAdmin()) { table.innerHTML = `<tr><td colspan="5" class="empty">Only admin users can manage accounts.</td></tr>`; return; }
  table.innerHTML = authAccounts().map((account) => `<tr><td><strong>${account.username}</strong></td><td>${account.role}</td><td>${account.store || "All stores"}</td><td>${account.createdAt ? account.createdAt.slice(0, 10) : ""}</td><td><div class="row-actions"><button type="button" onclick="editAccount('${account.id}')">Edit / reset</button><button type="button" class="danger" onclick="deleteAccount('${account.id}')">Delete</button></div></td></tr>`).join("") || `<tr><td colspan="5" class="empty">No accounts yet.</td></tr>`;
}
function renderAll() { renderSpecials(); renderSheet(); renderResults(); renderSuppliers(); renderInvoices(); renderAccounts(); }
document.querySelector("#searchSpecials").addEventListener("input", renderSpecials); document.querySelector("#sheetWeek").addEventListener("change", renderSheet); document.querySelector("#sheetStore").addEventListener("change", renderSheet);
wireTabs(); setDefaultWeek(); wireAuth(); wireSpecialForm(); wireResultForm(); wireSupplierForm(); wireInvoiceForm(); wireExports(); wireCloud(); wireAccounts();
if (loadAuth() && currentUser()) showApp(); else showAuth();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
