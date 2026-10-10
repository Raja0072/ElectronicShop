// ════════════════════════════════════════════════════════════
//  CONFIG — Change base URL to your Spring Boot server
// ════════════════════════════════════════════════════════════
const API = '/api';

// Escape user-controlled text before putting it into innerHTML
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
// Today's date (YYYY-MM-DD) in the browser's LOCAL timezone (toISOString gives UTC)
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// ════════════════════════════════════════════════════════════
//  LOCAL STATE (mirrors DB, used for offline-like experience)
// ════════════════════════════════════════════════════════════
let state = {
  products: [], customers: [], sales: [], cart: [],
  selectedCustomer: null, currentPage: 'dashboard',
  productPage: 1, productSearch: '', productFilter: '',
  reportTab: 'daily', stockTab: 'low',
  charts: {}, fuseProducts: null, fuseCustomers: null,
  editingProductId: null, editingCustomerId: null,
  confirmCallback: null,
};

// ════════════════════════════════════════════════════════════
//  API HELPER
// ════════════════════════════════════════════════════════════
async function api(method, path, body) {
  try {
    const opts = { method, headers: { 'Content-Type':'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API + path, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type');
    return ct && ct.includes('json') ? res.json() : res.text();
  } catch(e) {
    console.warn('API error:', e.message);
    toast('Server error: ' + e.message, 'error');
    return null;
  }
}

const EMPTY_SUMMARY = {total:0, profit:0, count:0};

// ════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════
async function init() {
  // Set date
  document.getElementById('dashDate').textContent = new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  // Set report date defaults
  const today = todayStr();
  const monthStart = today.slice(0,8)+'01';
  document.getElementById('reportFrom').value = monthStart;
  document.getElementById('reportTo').value = today;

  // Load data
  await loadAllData();
  buildFuseIndexes();
  loadDashboard();
  checkTheme();
}

async function loadAllData() {
  const [products, customers] = await Promise.all([
    api('GET','/products'),
    api('GET','/customers'),
  ]);
  state.products = Array.isArray(products) ? products : [];
  state.customers = Array.isArray(customers) ? customers : [];
  if (!Array.isArray(products) || !Array.isArray(customers)) {
    toast('Could not load data from the server', 'error');
  }
  updateNavBadges();
}

function updateNavBadges() {
  const low = state.products.filter(p => p.stock <= p.minStock).length;
  const due = state.customers.filter(c => c.totalDue > 0).length;
  setNavBadge('nb-stock', low);
  setNavBadge('nb-customers', due);
  document.getElementById('alertDot').style.display = low > 0 ? 'block' : 'none';
}
function setNavBadge(id, n) {
  const el = document.getElementById(id);
  if (n > 0) { el.textContent = n; el.style.display = 'inline'; }
  else el.style.display = 'none';
}

function buildFuseIndexes() {
  state.fuseProducts = new Fuse(state.products, {
    keys: ['name','category'], threshold: 0.45, includeScore: true
  });
  state.fuseCustomers = new Fuse(state.customers, {
    keys: ['name','phone'], threshold: 0.4, includeScore: true
  });
}

// ════════════════════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════════════════════
const PAGE_TITLES = {dashboard:'Dashboard',products:'Products',stock:'Stock Management',sales:'Quick Sale',customers:'Customers',reports:'Reports',excel:'Excel Import / Export'};

function navigate(page, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item,.bnav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  document.querySelectorAll(`[data-page="${page}"]`).forEach(n => n.classList.add('active'));
  document.getElementById('topbarTitle').textContent = PAGE_TITLES[page] || page;
  state.currentPage = page;
  closeSidebar();

  if (page==='dashboard') loadDashboard();
  else if (page==='products') renderProducts();
  else if (page==='stock') loadStock();
  else if (page==='sales') renderSalePage();
  else if (page==='customers') renderCustomers('');
  else if (page==='reports') loadReports();
}

function openSidebar()  { document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebarOverlay').style.display='block'; }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').style.display='none'; }

// ════════════════════════════════════════════════════════════
//  DARK MODE
// ════════════════════════════════════════════════════════════
function toggleDark() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  setTheme(!isDark);
}
function setTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.getElementById('darkToggle').className = 'toggle-switch' + (dark ? ' on' : '');
  localStorage.setItem('theme', dark ? 'dark' : 'light');
  redrawCharts();
}
function checkTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  setTheme(saved === 'dark');
}

// ════════════════════════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════════════════════════
function toast(msg, type='') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `<span>${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ════════════════════════════════════════════════════════════
//  CONFIRM DIALOG
// ════════════════════════════════════════════════════════════
function confirmAction({icon='🗑️', iconColor='red', title='Are you sure?', msg, okLabel='Confirm', okClass='btn-danger', onOk}) {
  state.confirmCallback = onOk;
  document.getElementById('confirmIconEmoji').textContent = icon;
  document.getElementById('confirmIcon').className = 'confirm-icon ' + iconColor;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  const btn = document.getElementById('confirmOkBtn');
  btn.textContent = okLabel;
  btn.className = 'btn btn-full ' + okClass;
  openModal('modalConfirm');
}
function runConfirm() {
  closeModal('modalConfirm');
  if (state.confirmCallback) { state.confirmCallback(); state.confirmCallback = null; }
}

// ════════════════════════════════════════════════════════════
//  MODAL HELPERS
// ════════════════════════════════════════════════════════════
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-backdrop').forEach(m => {
  m.addEventListener('click', e => { if(e.target===m) closeModal(m.id); });
});

// ════════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════════
async function loadDashboard() {
  const [daily, stats] = await Promise.all([
    api('GET','/sales/daily') || null,
    api('GET','/dashboard/stats') || null,
  ]);
  const d = daily || EMPTY_SUMMARY;
  document.getElementById('st-sales').textContent = d.total.toLocaleString('en-IN');
  document.getElementById('st-sales-sub').textContent = d.count + ' transactions';
  document.getElementById('st-profit').textContent = d.profit.toLocaleString('en-IN');
  const pct = d.total > 0 ? Math.round((d.profit/d.total)*100) : 0;
  document.getElementById('st-profit-sub').textContent = pct + '% margin';
  const low = state.products.filter(p => p.stock <= p.minStock);
  const dueC = state.customers.filter(c => c.totalDue > 0);
  document.getElementById('st-lowstock').textContent = low.length;
  document.getElementById('st-due').textContent = dueC.length;
  const totalDue = dueC.reduce((a,c) => a+c.totalDue, 0);
  document.getElementById('st-due-sub').textContent = '₹'+totalDue.toLocaleString('en-IN')+' pending';

  // Alerts
  const alerts = [];
  if (low.length) alerts.push(`<div class="alert alert-orange"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg><div><strong>${low.length} products</strong> are running low on stock. <a onclick="navigate('stock',null)" style="cursor:pointer;font-weight:700;text-decoration:underline">View Stock →</a></div></div>`);
  if (dueC.length) alerts.push(`<div class="alert alert-red"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg><div><strong>${dueC.length} customers</strong> have unpaid dues totalling ₹${totalDue.toLocaleString('en-IN')}. <a onclick="navigate('customers',null)" style="cursor:pointer;font-weight:700;text-decoration:underline">View Customers →</a></div></div>`);
  document.getElementById('dashAlerts').innerHTML = alerts.join('');

  drawWeeklyChart();
  drawPieChart();
  renderDashLowStock(low);
  renderDashDue(dueC);
}

function renderDashLowStock(low) {
  const el = document.getElementById('dashLowStock');
  if (!low.length) { el.innerHTML = '<div class="empty-state" style="padding:20px"><p>All products well stocked ✓</p></div>'; return; }
  el.innerHTML = low.slice(0,6).map(p => `
    <div class="stock-item">
      <div style="font-size:20px;width:32px;text-align:center">${esc(p.emoji||'📦')}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</div>
        <div class="stock-bar-wrap" style="margin-top:5px">
          <div class="stock-bar" style="width:${Math.min(100,Math.round(p.stock/Math.max(1,p.minStock*2)*100))}%;background:${p.stock==0?'var(--danger)':p.stock<=p.minStock?'var(--warning)':'var(--success)'}"></div>
        </div>
      </div>
      <span class="badge ${p.stock==0?'badge-red':p.stock<=p.minStock?'badge-orange':'badge-gray'}" style="margin-left:8px">${p.stock} left</span>
    </div>`).join('');
}

function renderDashDue(dueC) {
  const el = document.getElementById('dashDueCustomers');
  if (!dueC.length) { el.innerHTML = '<div class="empty-state" style="padding:20px"><p>No pending dues ✓</p></div>'; return; }
  el.innerHTML = dueC.slice(0,5).map(c => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div class="cust-avatar" style="width:36px;height:36px;font-size:13px">${c.name.slice(0,2).toUpperCase()}</div>
      <div style="flex:1">
        <div style="font-size:13.5px;font-weight:600">${esc(c.name)}</div>
        <div style="font-size:11.5px;color:var(--text3)">${esc(c.phone||'No phone')}</div>
      </div>
      <span style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:var(--danger)">₹${c.totalDue.toLocaleString('en-IN')}</span>
    </div>`).join('');
}

async function getWeeklyData() {
  const key = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
  const sales = await api('GET', `/sales?from=${key(days[0])}&to=${key(days[6])}`);
  const byDay = {};
  days.forEach(d => { byDay[key(d)] = {day: d.toLocaleDateString('en-IN',{weekday:'short'}), sales:0, profit:0}; });
  (Array.isArray(sales) ? sales : []).forEach(s => {
    const k = (s.saleDate || '').slice(0,10);
    if (byDay[k]) { byDay[k].sales += s.totalAmount || 0; byDay[k].profit += s.profit || 0; }
  });
  return days.map(d => byDay[key(d)]);
}

async function drawWeeklyChart() {
  const data = await getWeeklyData();
  const ctx = document.getElementById('weeklyChart').getContext('2d');
  if (state.charts.weekly) state.charts.weekly.destroy();
  state.charts.weekly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d=>d.day),
      datasets: [
        {label:'Sales ₹',data:data.map(d=>d.sales),backgroundColor:'rgba(37,99,235,0.7)',borderRadius:6,borderSkipped:false},
        {label:'Profit ₹',data:data.map(d=>d.profit),backgroundColor:'rgba(22,163,74,0.7)',borderRadius:6,borderSkipped:false,type:'line',borderColor:'#16A34A',fill:false,tension:0.4,pointRadius:4,pointBackgroundColor:'#16A34A'},
      ]
    },
    options: { responsive:true,maintainAspectRatio:false, plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:10}}}, scales:{y:{beginAtZero:true,grid:{color:'rgba(148,163,184,0.1)'},ticks:{callback:v=>'₹'+v.toLocaleString('en-IN'),font:{size:10}}},x:{grid:{display:false},ticks:{font:{size:11}}}}}
  });
}

function drawPieChart() {
  const ctx = document.getElementById('pieChart').getContext('2d');
  if (state.charts.pie) state.charts.pie.destroy();
  const cats = {};
  state.products.forEach(p => { cats[p.category] = (cats[p.category]||0) + p.sellPrice * p.stock; });
  state.charts.pie = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(cats),
      datasets: [{data: Object.values(cats), backgroundColor:['#2563EB','#16A34A','#D97706','#DC2626','#7C3AED'],borderWidth:0,hoverOffset:6}]
    },
    options: { responsive:true,maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{font:{size:11},boxWidth:10,padding:8}}} }
  });
}

function redrawCharts() {
  if (state.currentPage === 'dashboard') { drawWeeklyChart(); drawPieChart(); }
  if (state.currentPage === 'reports')   loadReports();
}

// ════════════════════════════════════════════════════════════
//  PRODUCTS
// ════════════════════════════════════════════════════════════
const ITEMS_PER_PAGE = 8;
const CAT_EMOJIS = {cable:'🔌',mobile:'📱',laptop:'💻',accessory:'🎧',other:'📦'};

function renderProducts(search, filter, page) {
  if (search !== undefined) { state.productSearch = search; state.productPage = 1; }
  if (filter !== undefined) { state.productFilter = filter; state.productPage = 1; }
  if (page !== undefined) state.productPage = page;

  let list = state.products;
  if (state.productSearch) {
    const results = state.fuseProducts.search(state.productSearch);
    list = results.map(r=>r.item);
  }
  if (state.productFilter) list = list.filter(p => p.category === state.productFilter);

  document.getElementById('prodCount').textContent = list.length + ' products';

  const total = list.length;
  const pages = Math.ceil(total / ITEMS_PER_PAGE);
  const start = (state.productPage-1) * ITEMS_PER_PAGE;
  const slice = list.slice(start, start+ITEMS_PER_PAGE);

  const tbody = document.getElementById('productTableBody');
  if (!slice.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="icon">🔍</div><h3>No products found</h3><p>Try a different search</p></div></td></tr>';
  } else {
    tbody.innerHTML = slice.map(p => {
      const profit = p.sellPrice - p.costPrice;
      const isLow = p.stock <= p.minStock;
      const statusBadge = p.stock === 0
        ? '<span class="badge badge-red">Out of Stock</span>'
        : isLow
        ? '<span class="badge badge-orange">Low Stock</span>'
        : '<span class="badge badge-green">In Stock</span>';
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:10px">${p.imageBase64 ? `<img src="${p.imageBase64}" style="width:36px;height:36px;border-radius:8px;object-fit:cover;flex-shrink:0;">` : `<span style="font-size:20px">${esc(p.emoji||'📦')}</span>`}<div><div class="td-name">${esc(p.name)}</div></div></div></td>
        <td><span class="badge badge-gray">${esc(p.category)}</span></td>
        <td class="td-mono">₹${p.costPrice.toLocaleString('en-IN')}</td>
        <td class="td-mono" style="font-weight:700">₹${p.sellPrice.toLocaleString('en-IN')}</td>
        <td class="td-mono" style="color:var(--success);font-weight:700">₹${profit.toLocaleString('en-IN')}</td>
        <td><div style="display:flex;align-items:center;gap:8px"><span class="td-mono" style="font-weight:700">${p.stock}</span><div class="stock-bar-wrap" style="width:60px;display:inline-block"><div class="stock-bar" style="width:${Math.min(100,Math.round(p.stock/Math.max(1,p.minStock*2)*100))}%;background:${p.stock==0?'var(--danger)':isLow?'var(--warning)':'var(--success)'}"></div></div></div></td>
        <td>${statusBadge}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-sm" onclick="openProductModal(${p.id})" title="Edit">✏️</button>
            <button class="btn btn-ghost btn-sm" onclick="showPriceHistory(${p.id})" title="Price History">📊</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteProduct(${p.id})" title="Delete">🗑️</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // Pagination
  document.getElementById('prodPaginInfo').textContent = `Showing ${Math.min(start+1,total)}–${Math.min(start+ITEMS_PER_PAGE,total)} of ${total}`;
  const btns = document.getElementById('prodPaginBtns');
  btns.innerHTML = '';
  for (let i=1; i<=pages; i++) {
    const b = document.createElement('button');
    b.className = 'page-btn' + (i===state.productPage?' active':'');
    b.textContent = i;
    b.onclick = () => renderProducts(undefined, undefined, i);
    btns.appendChild(b);
  }
}

function searchProducts(q) { renderProducts(q); }
function filterProducts(f) { renderProducts(undefined, f); }

function openProductModal(id=null) {
  state.editingProductId = id;
  document.getElementById('prodModalTitle').textContent = id ? 'Edit Product' : 'Add Product';
  document.getElementById('dupWarning').style.display = 'none';
  if (id) {
    const p = state.products.find(x => x.id === id);
    document.getElementById('prodId').value = p.id;
    document.getElementById('prodName').value = p.name;
    document.getElementById('prodCategory').value = p.category || '';
    document.getElementById('prodCost').value = p.costPrice || '';
    document.getElementById('prodPrice').value = p.sellPrice;
    document.getElementById('prodStock').value = p.stock;
    document.getElementById('prodMinStock').value = p.minStock;
    if (p.imageBase64) {
      document.getElementById('imagePreview').src = p.imageBase64;
      document.getElementById('imagePreview').style.display = 'block';
      document.getElementById('imagePlaceholder').style.display = 'none';
      document.getElementById('removeImageBtn').style.display = 'inline-flex';
    } else {
      removeProductImage();
    }
  } else {
    ['prodId','prodName','prodCost','prodPrice','prodStock','prodMinStock'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('prodCategory').value = '';
    document.getElementById('profitPreview').style.display = 'none';
    removeProductImage();
  }
  calcProfitPreview();
  openModal('modalProduct');
}

function calcProfitPreview() {
  const cost = parseFloat(document.getElementById('prodCost').value)||0;
  const sell = parseFloat(document.getElementById('prodPrice').value)||0;
  const el = document.getElementById('profitPreview');
  if (cost>0 && sell>0) {
    const profit = sell-cost;
    const margin = Math.round((profit/sell)*100);
    el.style.display = 'block';
    el.textContent = `Profit: ₹${profit.toLocaleString('en-IN')} per unit (${margin}% margin)`;
    el.style.color = profit>0 ? 'var(--success)' : 'var(--danger)';
    el.style.background = profit>0 ? 'var(--success-bg)' : 'var(--danger-bg)';
  } else { el.style.display='none'; }
}

function checkDuplicate(name) {
  if (!name || name.length < 3) { document.getElementById('dupWarning').style.display='none'; return; }
  const results = state.fuseProducts.search(name);
  const match = results.find(r => r.item.id !== state.editingProductId && r.score < 0.25);
  if (match) {
    document.getElementById('dupMsg').textContent = `Similar product found: "${match.item.name}" — check for duplicates!`;
    document.getElementById('dupWarning').style.display = 'flex';
  } else {
    document.getElementById('dupWarning').style.display = 'none';
  }
}

function handleProductImage(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { toast('Image too large. Max 2MB', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('imagePreview').src = e.target.result;
    document.getElementById('imagePreview').style.display = 'block';
    document.getElementById('imagePlaceholder').style.display = 'none';
    document.getElementById('removeImageBtn').style.display = 'inline-flex';
  };
  reader.readAsDataURL(file);
}

function removeProductImage() {
  document.getElementById('imagePreview').src = '';
  document.getElementById('imagePreview').style.display = 'none';
  document.getElementById('imagePlaceholder').style.display = 'block';
  document.getElementById('removeImageBtn').style.display = 'none';
  document.getElementById('prodImageInput').value = '';
}

function getProductImage() {
  const img = document.getElementById('imagePreview');
  return (img && img.style.display !== 'none' && img.src) ? img.src : null;
}

async function saveProduct() {
  const name = document.getElementById('prodName').value.trim();
  const sell = parseFloat(document.getElementById('prodPrice').value);
  const stock = parseInt(document.getElementById('prodStock').value);
  if (!name || isNaN(sell) || isNaN(stock)) { toast('Please fill all required fields (Name, Selling Price, Stock)', 'error'); return; }

  const data = {
    name,
    category: document.getElementById('prodCategory').value || 'Other',
    costPrice: parseFloat(document.getElementById('prodCost').value) || 0,
    sellPrice: sell,
    stock,
    minStock: parseInt(document.getElementById('prodMinStock').value) || 5,
    imageBase64: getProductImage()
  };

  const id = state.editingProductId;
  if (id) {
    const saved = await api('PUT', `/products/${id}`, data);
    if (!saved) return;
    const idx = state.products.findIndex(p => p.id === id);
    if (idx >= 0) state.products[idx] = {...state.products[idx], ...data};
    toast('Product updated successfully ✓', 'success');
  } else {
    const result = await api('POST', '/products', data);
    if (!result || !result.id) return;
    state.products.push(result);
    toast('Product added successfully ✓', 'success');
  }

  closeModal('modalProduct');
  const freshProducts = await api('GET', '/products');
  if (freshProducts && Array.isArray(freshProducts)) {
    state.products = freshProducts;
  }
  buildFuseIndexes();
  renderProducts();
  updateNavBadges();
}

async function deleteProduct(id) {
  const p = state.products.find(x=>x.id===id);
  confirmAction({
    icon:'🗑️', iconColor:'red',
    title:'Delete Product?',
    msg:`"${p.name}" will be permanently deleted from inventory.`,
    okLabel:'Yes, Delete', okClass:'btn-danger',
    onOk: async () => {
      const del = await api('DELETE', `/products/${id}`);
      if (del === null) return;
      state.products = state.products.filter(x=>x.id!==id);
      buildFuseIndexes(); renderProducts(); updateNavBadges();
      toast('Product deleted','');
    }
  });
}

async function showPriceHistory(id) {
  const p = state.products.find(x=>x.id===id);
  const hist = await api('GET', `/products/${id}/price-history`) || p._priceHistory || [];
  const el = document.getElementById('priceHistoryContent');
  if (!hist.length) {
    el.innerHTML = `<div class="empty-state" style="padding:30px"><div class="icon">📊</div><h3>No price changes yet</h3><p>Price history will appear here after updates</p></div>`;
  } else {
    el.innerHTML = `<div style="margin-bottom:10px"><strong>${esc(p.name)}</strong> — Current: ₹${p.sellPrice.toLocaleString('en-IN')} (Cost: ₹${p.costPrice.toLocaleString('en-IN')})</div>
    ${hist.map(h=>`<div class="price-hist-item"><div><div style="font-size:13px;font-weight:600">${h.date}</div><div style="font-size:12px;color:var(--text3)">Before: ₹${h.oldSell||'-'} (Cost: ₹${h.oldCost||'-'})</div></div></div>`).join('')}`;
  }
  openModal('modalPriceHistory');
}

// ════════════════════════════════════════════════════════════
//  STOCK
// ════════════════════════════════════════════════════════════
function switchStockTab(tab, el) {
  state.stockTab = tab;
  document.querySelectorAll('#page-stock .tab-btn').forEach(b=>b.classList.remove('active'));
  if(el) el.classList.add('active');
  loadStock();
}
function refreshStock() { loadStock(); toast('Stock refreshed','success'); }

function loadStock() {
  const tab = state.stockTab;
  const el = document.getElementById('stockTabContent');
  let items = [];
  if (tab==='low') items = state.products.filter(p=>p.stock<=p.minStock);
  else if (tab==='slow') {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-30);
    items = state.products.filter(p => p.lastSold && new Date(p.lastSold)<cutoff);
  } else items = [...state.products].sort((a,b)=>a.stock-b.stock);

  if (!items.length) { el.innerHTML='<div class="empty-state"><div class="icon">✅</div><h3>All good!</h3><p>No items in this category</p></div>'; return; }

  el.innerHTML = `<div class="card" style="padding:0;overflow:hidden"><div class="table-wrap"><table>
    <thead><tr><th>Product</th><th>Stock</th><th>Min Level</th><th>Status</th><th>Last Sold</th><th>Actions</th></tr></thead>
    <tbody>${items.map(p=>{
      const isOut = p.stock===0, isLow = p.stock<=p.minStock;
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">${esc(p.emoji||'📦')}</span><span class="td-name">${esc(p.name)}</span></div></td>
        <td><span style="font-family:'JetBrains Mono',monospace;font-weight:700;color:${isOut?'var(--danger)':isLow?'var(--warning)':'var(--text)'}">${p.stock}</span></td>
        <td><span style="font-family:'JetBrains Mono',monospace;color:var(--text2)">${p.minStock}</span></td>
        <td>${isOut?'<span class="badge badge-red">Out of Stock</span>':isLow?'<span class="badge badge-orange">Low Stock</span>':'<span class="badge badge-green">OK</span>'}</td>
        <td style="font-size:12.5px;color:var(--text3)">${p.lastSold||'—'}</td>
        <td><button class="btn btn-outline btn-sm" onclick="quickRestockModal(${p.id})">+ Restock</button></td>
      </tr>`;
    }).join('')}</tbody>
  </table></div></div>`;
}

function quickRestockModal(id) {
  const p = state.products.find(x=>x.id===id);
  confirmAction({
    icon:'📦', iconColor:'blue',
    title:`Restock "${p.name}"`,
    msg:`Current stock: ${p.stock}. Enter qty to add in the prompt.`,
    okLabel:'Restock', okClass:'btn-primary',
    onOk: async () => {
      const qty = parseInt(prompt(`Add stock for "${p.name}" (current: ${p.stock}):`))||0;
      if (qty<=0) return;
      const result = await api('PUT',`/products/${id}`,{...p, stock: p.stock+qty});
      if (!result) return;
      const idx = state.products.findIndex(x=>x.id===id);
      if (idx>=0) state.products[idx].stock += qty;
      loadStock(); updateNavBadges();
      toast(`Added ${qty} units to ${esc(p.name)} ✓`,'success');
    }
  });
}

// ════════════════════════════════════════════════════════════
//  QUICK SALE
// ════════════════════════════════════════════════════════════
function renderSalePage() {
  const el = document.getElementById('saleProductGrid');
  el.innerHTML = state.products.map(p => `
    <div class="prod-card${p.stock===0?' out-stock':''}" onclick="addToCart(${p.id})">
      <div class="prod-card-emoji">${p.imageBase64 ? `<img src="${p.imageBase64}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;">` : (p.emoji||'📦')}</div>
      <div class="prod-card-name">${esc(p.name)}</div>
      <div class="prod-card-price">₹${p.sellPrice.toLocaleString('en-IN')}</div>
      <div class="prod-card-stock">${p.stock===0?'Out of stock':'Stock: '+p.stock}</div>
    </div>`).join('');
  renderCart();
}

function saleFuzzySearch(q) {
  const ac = document.getElementById('saleAC');
  if (!q) { ac.classList.remove('show'); return; }
  const results = state.fuseProducts.search(q).slice(0,7);
  if (!results.length) { ac.innerHTML='<div class="ac-no-result">No products found</div>'; ac.classList.add('show'); return; }
  ac.innerHTML = results.map(r=>r.item).map(p=>`
    <div class="ac-item" onclick="addToCart(${p.id});document.getElementById('saleSearch').value='';document.getElementById('saleAC').classList.remove('show')">
      <div class="ac-item-emoji">${esc(p.emoji||'📦')}</div>
      <div><div class="ac-item-name">${esc(p.name)}</div><div class="ac-item-meta">Stock: ${p.stock}</div></div>
      <span class="ac-item-price">₹${p.sellPrice.toLocaleString('en-IN')}</span>
    </div>`).join('');
  ac.classList.add('show');
}

function addToCart(pid) {
  const p = state.products.find(x=>x.id===pid);
  if (!p || p.stock===0) { toast('Product out of stock','error'); return; }
  const ex = state.cart.find(c=>c.pid===pid);
  if (ex) {
    if (ex.qty >= p.stock) { toast('Not enough stock','error'); return; }
    ex.qty++;
  } else {
    state.cart.push({pid, name:p.name, price:p.sellPrice, cost:p.costPrice, emoji:p.emoji||CAT_EMOJIS[p.category]||'📦', qty:1});
  }
  renderCart();
}

function changeCartQty(pid, delta) {
  const item = state.cart.find(c=>c.pid===pid);
  const p = state.products.find(x=>x.id===pid);
  if (!item) return;
  const nq = item.qty + delta;
  if (nq <= 0) {
    confirmAction({icon:'🛒',iconColor:'red',title:'Remove Item?',msg:`Remove "${item.name}" from cart?`,okLabel:'Remove',okClass:'btn-danger',
      onOk:()=>{ state.cart=state.cart.filter(c=>c.pid!==pid); renderCart(); }
    });
  } else if (p && nq > p.stock) {
    toast('Not enough stock','error');
  } else {
    item.qty = nq; renderCart();
  }
}

function renderCart() {
  const el = document.getElementById('cartItemsEl');
  const footer = document.getElementById('cartFooterEl');
  const total = state.cart.reduce((a,c)=>a+c.price*c.qty,0);
  const count = state.cart.reduce((a,c)=>a+c.qty,0);
  document.getElementById('cartCountBadge').textContent = count + ' item' + (count!==1?'s':'');

  if (!state.cart.length) {
    el.innerHTML = '<div class="cart-empty-state"><div class="icon">🛒</div><p>Tap a product to add it</p></div>';
    footer.style.display = 'none'; return;
  }
  el.innerHTML = state.cart.map(c=>`
    <div class="cart-item">
      <div class="cart-item-icon">${esc(c.emoji)}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${esc(c.name)}</div>
        <div class="cart-item-breakdown">
          <span class="bd-unit">₹${c.price.toLocaleString('en-IN')}</span>
          <span class="bd-x">×</span>
          <span class="bd-qty">${c.qty}</span>
          <span class="bd-eq">=</span>
          <span class="bd-total">₹${(c.price*c.qty).toLocaleString('en-IN')}</span>
        </div>
      </div>
      <div class="cart-item-right">
        <span class="cart-item-total">₹${(c.price*c.qty).toLocaleString('en-IN')}</span>
        <div style="display:flex;align-items:center;gap:4px">
          <div class="stepper">
            <button class="step-btn" onclick="changeCartQty(${c.pid},-1)">−</button>
            <span class="step-val">${c.qty}</span>
            <button class="step-btn" onclick="changeCartQty(${c.pid},1)">+</button>
          </div>
          <button class="cart-remove" onclick="changeCartQty(${c.pid},-999)">
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>
          </button>
        </div>
      </div>
    </div>`).join('');
  footer.style.display = 'block';
  document.getElementById('cartTotalEl').textContent = '₹'+total.toLocaleString('en-IN');
  updateCartDue();
}

function updateCartDue() {
  const total = state.cart.reduce((a,c)=>a+c.price*c.qty,0);
  const paid = parseFloat(document.getElementById('cartPaidEl').value)||0;
  const due = Math.max(0, total-paid);
  const el = document.getElementById('cartDueBadgeEl');
  if (paid===0) el.innerHTML='';
  else if (due>0) el.innerHTML=`<div class="cart-due-badge">Due: ₹${due.toLocaleString('en-IN')}</div>`;
  else el.innerHTML='<div class="cart-paid-badge">✓ Fully Paid</div>';
}

function clearCart() {
  if (!state.cart.length) return;
  confirmAction({icon:'🛒',iconColor:'orange',title:'Clear Cart?',msg:'Remove all items from the cart?',okLabel:'Clear',okClass:'btn-danger',
    onOk:()=>{ state.cart=[]; state.selectedCustomer=null; document.getElementById('selectedCustomerBanner').style.display='none'; document.getElementById('custSearch').value=''; renderCart(); }
  });
}

function searchCustomerForSale(q) {
  const ac = document.getElementById('custAC');
  if (!q) { ac.classList.remove('show'); return; }
  const results = state.fuseCustomers.search(q).slice(0,5);
  if (!results.length) { ac.innerHTML='<div class="ac-no-result">No customer found — <a style="color:var(--accent);cursor:pointer;font-weight:600" onclick="openCustomerModal()">Add new?</a></div>'; ac.classList.add('show'); return; }
  ac.innerHTML = results.map(r=>r.item).map(c=>`
    <div class="ac-item" onclick="selectCustomerForSale(${c.id})">
      <div class="ac-item-emoji">${c.name.slice(0,2).toUpperCase()}</div>
      <div><div class="ac-item-name">${esc(c.name)}</div><div class="ac-item-meta">${esc(c.phone||'No phone')}</div></div>
      ${c.totalDue>0?`<span class="badge badge-red">Due ₹${c.totalDue.toLocaleString('en-IN')}</span>`:'<span class="badge badge-green">Clear</span>'}
    </div>`).join('');
  ac.classList.add('show');
}

function selectCustomerForSale(id) {
  const c = state.customers.find(x=>x.id===id);
  state.selectedCustomer = c;
  document.getElementById('custSearch').value = c.name;
  document.getElementById('custAC').classList.remove('show');
  const banner = document.getElementById('selectedCustomerBanner');
  banner.style.display = 'block';
  banner.innerHTML = `
    <div style="background:${c.totalDue>0?'var(--danger-bg)':'var(--success-bg)'};border-radius:var(--radius-sm);padding:10px 14px;display:flex;align-items:center;gap:10px">
      <div class="cust-avatar" style="width:36px;height:36px;font-size:13px">${c.name.slice(0,2).toUpperCase()}</div>
      <div>
        <div style="font-size:13.5px;font-weight:700">${esc(c.name)}</div>
        <div style="font-size:12px;color:var(--text2)">${esc(c.phone||'')}${c.totalDue>0?` · <span style="color:var(--danger);font-weight:700">Previous Due: ₹${c.totalDue.toLocaleString('en-IN')}</span>`:' · All clear'}</div>
      </div>
      <button style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--text3)" onclick="clearSelectedCustomer()">✕</button>
    </div>
    ${c.totalDue>0?`<div class="alert alert-red" style="margin-top:8px;margin-bottom:0"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg><strong>⚠️ This customer has a pending due of ₹${c.totalDue.toLocaleString('en-IN')}. Please collect before new sale.</strong></div>`:''}`;
}

function clearSelectedCustomer() {
  state.selectedCustomer = null;
  document.getElementById('custSearch').value = '';
  document.getElementById('selectedCustomerBanner').style.display = 'none';
}

function askCompleteSale() {
  if (!state.cart.length) { toast('Cart is empty','error'); return; }
  const total = state.cart.reduce((a,c)=>a+c.price*c.qty,0);
  const count = state.cart.reduce((a,c)=>a+c.qty,0);
  confirmAction({
    icon:'✅', iconColor:'green',
    title:'Complete Sale?',
    msg:`${count} item(s) · Total ₹${total.toLocaleString('en-IN')}${state.selectedCustomer?' for '+state.selectedCustomer.name:''}`,
    okLabel:'Complete Sale', okClass:'btn-success',
    onOk: completeSale
  });
}

async function completeSale() {
  const total = state.cart.reduce((a,c)=>a+c.price*c.qty,0);
  const profit = state.cart.reduce((a,c)=>a+(c.price-c.cost)*c.qty,0);
  const paid = parseFloat(document.getElementById('cartPaidEl').value)||0;
  const due = Math.max(0, total-paid);
  const saleDate = new Date();

  const saleData = {
    customerId: state.selectedCustomer?.id || null,
    items: state.cart.map(c=>({productId:c.pid,quantity:c.qty,price:c.price,cost:c.cost})),
    totalAmount: total, amountPaid: paid, dueAmount: due, profit,
    saleDate: saleDate.toISOString()
  };

  const result = await api('POST','/sales',saleData);
  if (!result || !result.id) return;   // sale was NOT saved — keep the cart
  const saleId = result.id;

  // Update local stock
  state.cart.forEach(c => {
    const p = state.products.find(x=>x.id===c.pid);
    if (p) p.stock = Math.max(0, p.stock-c.qty);
  });

  // Update customer due
  if (state.selectedCustomer && due > 0) {
    const cu = state.customers.find(x=>x.id===state.selectedCustomer.id);
    if (cu) cu.totalDue += due;
  }

  // Show bill
  showBill({saleId, items:[...state.cart], total, paid, due, profit, customer:state.selectedCustomer, date:saleDate});

  state.cart = [];
  state.selectedCustomer = null;
  document.getElementById('cartPaidEl').value = '';
  document.getElementById('custSearch').value = '';
  document.getElementById('selectedCustomerBanner').style.display = 'none';

  const freshProducts = await api('GET', '/products');
  if (freshProducts && Array.isArray(freshProducts)) state.products = freshProducts;

  const freshCustomers = await api('GET', '/customers');
  if (freshCustomers && Array.isArray(freshCustomers)) state.customers = freshCustomers;

  renderCart();
  renderSalePage();
  buildFuseIndexes();
  updateNavBadges();
  toast('Sale completed! ₹'+total.toLocaleString('en-IN'),'success');
}

function showBill({saleId, items, total, paid, due, profit, customer, date}) {
  const billNo = 'BILL-'+String(saleId).padStart(5,'0');
  const dateStr = date.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  document.getElementById('billContent').innerHTML = `
    <div class="bill-header-section">
      <div style="font-size:28px;margin-bottom:6px">⚡</div>
      <h2>ElectroShop</h2>
      <p>Electronics Shop · Tax Invoice</p>
    </div>
    <div class="bill-content">
      <div class="bill-meta">
        <div class="bill-meta-item"><label>Bill No</label><span style="font-family:'JetBrains Mono',monospace">${billNo}</span></div>
        <div class="bill-meta-item"><label>Date & Time</label><span>${dateStr}</span></div>
        <div class="bill-meta-item"><label>Customer</label><span>${esc(customer?.name||'Walk-in Customer')}</span></div>
        <div class="bill-meta-item"><label>Phone</label><span>${esc(customer?.phone||'—')}</span></div>
      </div>
      <table class="bill-table">
        <thead><tr><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${items.map(c=>`<tr><td>${esc(c.name)}</td><td style="text-align:right;font-family:'JetBrains Mono',monospace">${c.qty}</td><td style="text-align:right;font-family:'JetBrains Mono',monospace">₹${c.price.toLocaleString('en-IN')}</td><td style="text-align:right;font-family:'JetBrains Mono',monospace;font-weight:700">₹${(c.price*c.qty).toLocaleString('en-IN')}</td></tr>`).join('')}</tbody>
      </table>
      <div class="bill-totals">
        <div class="bill-totals-row grand"><span>Grand Total</span><span>₹${total.toLocaleString('en-IN')}</span></div>
        <div class="bill-totals-row"><span>Amount Paid</span><span style="color:var(--success);font-weight:700">₹${paid.toLocaleString('en-IN')}</span></div>
        ${due>0?`<div class="bill-totals-row due"><span>Due Amount</span><span>₹${due.toLocaleString('en-IN')}</span></div>`:'<div class="bill-totals-row" style="color:var(--success)"><span>Balance</span><span>Paid in Full ✓</span></div>'}
      </div>
    </div>`;
  openModal('modalBill');
}

function printBill() { window.print(); }

// ════════════════════════════════════════════════════════════
//  CUSTOMERS
// ════════════════════════════════════════════════════════════
function renderCustomers(search='', filter='') {
  let list = state.customers;
  if (search) { const r = state.fuseCustomers.search(search); list = r.map(x=>x.item); }
  if (filter==='due') list = list.filter(c=>c.totalDue>0);
  if (filter==='paid') list = list.filter(c=>c.totalDue===0);
  document.getElementById('custCount').textContent = list.length + ' customers';
  const el = document.getElementById('customerListEl');
  if (!list.length) { el.innerHTML='<div class="empty-state"><div class="icon">👥</div><h3>No customers found</h3></div>'; return; }
  el.innerHTML = list.map(c=>`
    <div class="customer-card" style="flex-direction:column;gap:12px;padding:16px;">
      <div style="display:flex;align-items:center;gap:12px;width:100%;">
        <div class="cust-avatar">${c.name.slice(0,2).toUpperCase()}</div>
        <div style="flex:1;min-width:0;">
          <div class="cust-name">${esc(c.name)}</div>
          <div class="cust-phone">${esc(c.phone||'No phone')}</div>
        </div>
        ${c.totalDue>0
          ? `<div style="text-align:right;">
               <div style="font-size:20px;font-weight:800;color:var(--danger);font-family:'JetBrains Mono',monospace;">₹${c.totalDue.toLocaleString('en-IN')}</div>
               <div style="font-size:10px;color:var(--text3);">pending due</div>
             </div>`
          : `<div style="text-align:right;">
               <div style="font-size:13px;font-weight:700;color:var(--success);">✓ Clear</div>
             </div>`
        }
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span class="badge ${c.totalDue>0?'badge-red':'badge-green'}">
          ${c.totalDue>0?'Total Due: ₹'+c.totalDue.toLocaleString('en-IN'):'✓ All Paid'}
        </span>
        <span class="badge badge-gray">${c.totalPurchases||0} purchases</span>
        ${c.totalDue>0?'<span style="font-size:11px;color:var(--text3);">Can still purchase</span>':''}
      </div>
      <div style="display:flex;align-items:center;gap:8px;width:100%;">
        <button class="btn btn-ghost btn-sm" onclick="showCustHistory(${c.id})" title="History">📋 History</button>
        ${c.totalDue>0
          ? `<button class="btn btn-success btn-sm" onclick="collectDuePayment(${c.id})" title="Collect Due">💳 Collect Due</button>`
          : ''}
        <div style="margin-left:auto;display:flex;gap:6px;">
          <button class="btn btn-ghost btn-sm" onclick="openCustomerModal(${c.id})" title="Edit">✏️</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteCustomer(${c.id})" title="Delete">🗑️</button>
        </div>
      </div>
    </div>`).join('');
}


function collectDuePayment(id) {
  const c = state.customers.find(x => x.id === id);
  if (!c || c.totalDue <= 0) { toast('No due amount for this customer', 'error'); return; }

  const amountStr = prompt(`Collect payment from ${c.name}\nTotal due: ₹${c.totalDue.toLocaleString('en-IN')}\n\nEnter amount received:`);
  if (!amountStr) return;

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) { toast('Enter a valid amount', 'error'); return; }
  if (amount > c.totalDue) { toast(`Amount cannot exceed total due ₹${c.totalDue.toLocaleString('en-IN')}`, 'error'); return; }

  const remaining = c.totalDue - amount;

  confirmAction({
    icon: '💳', iconColor: 'green',
    title: 'Collect Payment?',
    msg: remaining > 0
      ? `Collecting ₹${amount.toLocaleString('en-IN')} from ${c.name}. Remaining due will be ₹${remaining.toLocaleString('en-IN')}.`
      : `Collecting ₹${amount.toLocaleString('en-IN')} from ${c.name}. All dues will be cleared!`,
    okLabel: 'Yes, Collect',
    okClass: 'btn-success',
    onOk: async () => {
      const newDue = Math.max(0, remaining);
      const payRes = await api('POST', '/payments', {
        customerId: id,
        amount: amount,
        note: `Due payment collected — ₹${amount.toLocaleString('en-IN')} received`
      });
      if (!payRes) return;
      const freshCustomers = await api('GET', '/customers');
      if (freshCustomers && Array.isArray(freshCustomers)) state.customers = freshCustomers;
      buildFuseIndexes();
      renderCustomers('');
      updateNavBadges();
      if (newDue === 0) {
        toast(`All dues cleared for ${esc(c.name)} ✓`, 'success');
      } else {
        toast(`₹${amount.toLocaleString('en-IN')} collected from ${esc(c.name)}. Remaining: ₹${newDue.toLocaleString('en-IN')} ✓`, 'success');
      }
    }
  });
}

function filterCust(val) { renderCustomers('', val); }

function openCustomerModal(id=null) {
  state.editingCustomerId = id;
  document.getElementById('custModalTitle').textContent = id ? 'Edit Customer' : 'Add Customer';
  if (id) {
    const c = state.customers.find(x=>x.id===id);
    document.getElementById('custId').value = c.id;
    document.getElementById('custName').value = c.name;
    document.getElementById('custPhone').value = c.phone||'';
    document.getElementById('custDue').value = c.totalDue||0;
  } else {
    ['custId','custName','custPhone','custDue'].forEach(i=>document.getElementById(i).value='');
  }
  openModal('modalCustomer');
}

async function saveCustomer() {
  const name = document.getElementById('custName').value.trim();
  if (!name) { toast('Enter customer name','error'); return; }
  const data = {
    name, phone: document.getElementById('custPhone').value.trim(),
    totalDue: parseFloat(document.getElementById('custDue').value)||0,
    totalPurchases: 0
  };
  const id = state.editingCustomerId;
  if (id) {
    const upd = await api('PUT',`/customers/${id}`,data);
    if (!upd) return;
    const idx = state.customers.findIndex(x=>x.id===id);
    if (idx>=0) state.customers[idx] = {...state.customers[idx],...data};
    toast('Customer updated ✓','success');
  } else {
    const result = await api('POST','/customers',data);
    if (!result || !result.id) return;
    state.customers.push(result);
    toast('Customer added ✓','success');
  }
  closeModal('modalCustomer');
  buildFuseIndexes();
  renderCustomers('');
  updateNavBadges();
}

async function deleteCustomer(id) {
  const c = state.customers.find(x=>x.id===id);
  confirmAction({icon:'👤',iconColor:'red',title:'Delete Customer?',msg:`"${c.name}" and all their data will be deleted.`,okLabel:'Delete',okClass:'btn-danger',
    onOk: async ()=>{
      const delC = await api('DELETE',`/customers/${id}`);
      if (delC === null) return;
      state.customers = state.customers.filter(x=>x.id!==id);
      buildFuseIndexes(); renderCustomers(''); updateNavBadges();
      toast('Customer deleted','');
    }
  });
}

async function showCustHistory(id) {
  const c = state.customers.find(x=>x.id===id);
  document.getElementById('custHistTitle').textContent = c.name + ' — Purchase History';
  const hist = await api('GET',`/customers/${id}/history`) || [];
  const payments = await api('GET',`/payments/customer/${id}`) || [];
  const el = document.getElementById('custHistContent');
  const totalSpent = hist.reduce((a,h)=>a+h.total,0);
  const totalDue = hist.reduce((a,h)=>a+h.due,0);
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
      <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px;text-align:center"><div style="font-size:11px;color:var(--text3);font-weight:600">TOTAL SPENT</div><div style="font-size:18px;font-weight:800;font-family:'JetBrains Mono',monospace;margin-top:4px">₹${totalSpent.toLocaleString('en-IN')}</div></div>
      <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px;text-align:center"><div style="font-size:11px;color:var(--text3);font-weight:600">PURCHASES</div><div style="font-size:18px;font-weight:800;font-family:'JetBrains Mono',monospace;margin-top:4px">${hist.length}</div></div>
      <div style="background:${totalDue>0?'var(--danger-bg)':'var(--success-bg)'};border-radius:var(--radius-sm);padding:12px;text-align:center"><div style="font-size:11px;color:${totalDue>0?'var(--danger)':'var(--success)'};font-weight:600">TOTAL DUE</div><div style="font-size:18px;font-weight:800;font-family:'JetBrains Mono',monospace;margin-top:4px;color:${totalDue>0?'var(--danger)':'var(--success)'}">₹${totalDue.toLocaleString('en-IN')}</div></div>
    </div>
    ${hist.length===0?'<div class="empty-state"><div class="icon">📋</div><h3>No purchases yet</h3></div>':
    hist.map(h=>`
      <div style="border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
          <div><div style="font-size:13px;font-weight:700">${h.date}</div><div style="font-size:12.5px;color:var(--text2);margin-top:2px">${esc(h.items)}</div></div>
          <span class="badge ${h.due>0?'badge-red':'badge-green'}">${h.due>0?'Due ₹'+h.due.toLocaleString('en-IN'):'Paid'}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--text2)">
          <span>Total: <strong>₹${h.total.toLocaleString('en-IN')}</strong></span>
          <span>Paid: <strong style="color:var(--success)">₹${h.paid.toLocaleString('en-IN')}</strong></span>
        </div>
      </div>`).join('')}`;
  if (payments.length > 0) {
    const paymentHtml = `
      <div style="margin-top:16px;padding-top:16px;border-top:2px solid var(--border)">
        <div style="font-size:13px;font-weight:700;margin-bottom:10px;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px">Payment History</div>
        ${payments.map(p => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-size:13.5px;font-weight:700;color:var(--success)">₹${(p.amount||0).toLocaleString('en-IN')} received</div>
              <div style="font-size:11.5px;color:var(--text3);margin-top:2px">${p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—'} · ${esc(p.note||'Payment collected')}</div>
            </div>
            <span class="badge badge-green">Paid</span>
          </div>`).join('')}
      </div>`;
    document.getElementById('custHistContent').innerHTML += paymentHtml;
  }
  openModal('modalCustHistory');
}

// ════════════════════════════════════════════════════════════
//  REPORTS
// ════════════════════════════════════════════════════════════
function switchReportTab(tab, el) {
  state.reportTab = tab;
  document.querySelectorAll('#page-reports .tab-btn').forEach(b=>b.classList.remove('active'));
  if(el) el.classList.add('active');
  loadReports();
}

async function loadReports() {
  const tab = state.reportTab;
  const from = document.getElementById('reportFrom').value;
  const to = document.getElementById('reportTo').value;
  const el = document.getElementById('reportTabContent');

  if (tab==='daily') {
    const d = await api('GET',`/sales/daily?date=${to}`) || EMPTY_SUMMARY;
    const todaySales = await api('GET', `/sales?from=${to}&to=${to}`) || [];
    el.innerHTML = `
      <div class="stat-grid" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-label">Total Sales</div><div class="stat-value rupee">${d.total.toLocaleString('en-IN')}</div><div class="stat-sub">${d.count} transactions</div></div>
        <div class="stat-card green"><div class="stat-label">Total Profit</div><div class="stat-value rupee">${d.profit.toLocaleString('en-IN')}</div><div class="stat-sub">${Math.round((d.profit/Math.max(1,d.total))*100)}% margin</div></div>
      </div>
      <div class="card"><div class="card-title">Today's Transactions</div>
        <div class="table-wrap"><table><thead><tr><th>Time</th><th>Customer</th><th>Total</th><th>Paid</th><th>Due</th><th>Profit</th></tr></thead>
        <tbody>${todaySales.length === 0
          ? '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text3)">No transactions today yet</td></tr>'
          : todaySales.map(s => `<tr>
              <td style="font-size:12.5px">${s.saleDate ? new Date(s.saleDate).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '—'}</td>
              <td>${esc(s.customer ? s.customer.name : 'Walk-in')}</td>
              <td class="td-mono">₹${(s.totalAmount||0).toLocaleString('en-IN')}</td>
              <td class="td-mono" style="color:var(--success)">₹${(s.amountPaid||0).toLocaleString('en-IN')}</td>
              <td class="td-mono" style="color:${(s.dueAmount||0)>0?'var(--danger)':'var(--text3)'}">₹${(s.dueAmount||0).toLocaleString('en-IN')}</td>
              <td class="td-mono" style="color:var(--success);font-weight:700">₹${(s.profit||0).toLocaleString('en-IN')}</td>
            </tr>`).join('')
        }</tbody></table></div>
      </div>`;
  } else if (tab==='monthly') {
    const m = await api('GET',`/sales/monthly?from=${from}&to=${to}`) || EMPTY_SUMMARY;
    el.innerHTML = `
      <div class="stat-grid" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-label">Period Sales</div><div class="stat-value rupee">${m.total.toLocaleString('en-IN')}</div><div class="stat-sub">${m.count} transactions</div></div>
        <div class="stat-card green"><div class="stat-label">Period Profit</div><div class="stat-value rupee">${m.profit.toLocaleString('en-IN')}</div><div class="stat-sub">${Math.round((m.profit/Math.max(1,m.total))*100)}% margin</div></div>
      </div>
      <div class="card"><div class="card-title">Monthly Trend</div><div class="chart-wrap"><canvas id="monthlyChart"></canvas></div></div>`;
    setTimeout(drawMonthlyChart, 100);
  } else if (tab==='products') {
    const prodRep = state.products.map(p=>({...p, profit:(p.sellPrice-p.costPrice), totalProfit:(p.sellPrice-p.costPrice)*Math.max(0,20-p.stock)})).sort((a,b)=>b.totalProfit-a.totalProfit);
    el.innerHTML = `<div class="card" style="padding:0;overflow:hidden"><div class="table-wrap"><table>
      <thead><tr><th>Product</th><th>Cost</th><th>Price</th><th>Profit/Unit</th><th>Margin</th><th>Stock</th></tr></thead>
      <tbody>${prodRep.map(p=>`<tr>
        <td><div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">${esc(p.emoji||'📦')}</span><span class="td-name">${esc(p.name)}</span></div></td>
        <td class="td-mono">₹${p.costPrice.toLocaleString('en-IN')}</td>
        <td class="td-mono">₹${p.sellPrice.toLocaleString('en-IN')}</td>
        <td class="td-mono" style="color:var(--success);font-weight:700">₹${p.profit.toLocaleString('en-IN')}</td>
        <td><span class="badge ${p.profit/p.sellPrice>0.3?'badge-green':p.profit/p.sellPrice>0.15?'badge-orange':'badge-red'}">${Math.round(p.profit/p.sellPrice*100)}%</span></td>
        <td class="td-mono">${p.stock}</td>
      </tr>`).join('')}</tbody>
    </table></div></div>`;
    } else if (tab==='sales') {
    const sales = await api('GET',`/sales?from=${from}&to=${to}`) || [];
    el.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:13px;font-weight:700;color:var(--text2);">${sales.length} sales found</div>
          <button class="btn btn-outline btn-sm" onclick="exportSales('monthly')">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            Export Excel
          </button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Bill</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Due</th>
                <th>Profit</th>
              </tr>
            </thead>
            <tbody>
              ${sales.length === 0
                ? '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3);">No sales in selected period</td></tr>'
                : sales.map(s => `
                  <tr>
                    <td style="font-size:12px;white-space:nowrap;">
                      ${s.saleDate ? new Date(s.saleDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}) : '—'}
                      <div style="font-size:11px;color:var(--text3);">${s.saleDate ? new Date(s.saleDate).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : ''}</div>
                    </td>
                    <td style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--accent);">BILL-${String(s.id||'').padStart(5,'0')}</td>
                    <td>
                      <div style="font-size:13px;font-weight:600;">${esc(s.customer ? s.customer.name : 'Walk-in')}</div>
                      <div style="font-size:11px;color:var(--text3);">${esc(s.customer ? (s.customer.phone||'') : '')}</div>
                    </td>
                    <td style="font-size:11px;max-width:120px;">
                      ${s.items && s.items.length > 0
                        ? s.items.map(i => `<div>${esc(i.product ? i.product.name : 'Unknown')} ×${i.quantity}</div>`).join('')
                        : '—'}
                    </td>
                    <td class="td-mono" style="font-weight:700;">₹${(s.totalAmount||0).toLocaleString('en-IN')}</td>
                    <td class="td-mono" style="color:var(--success);">₹${(s.amountPaid||0).toLocaleString('en-IN')}</td>
                    <td class="td-mono" style="color:${(s.dueAmount||0)>0?'var(--danger)':'var(--text3)'};">₹${(s.dueAmount||0).toLocaleString('en-IN')}</td>
                    <td class="td-mono" style="color:var(--success);font-weight:700;">₹${(s.profit||0).toLocaleString('en-IN')}</td>
                  </tr>`).join('')
              }
            </tbody>
          </table>
        </div>
        ${sales.length > 0 ? `
          <div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:16px;font-size:13px;flex-wrap:wrap;">
            <span>Sales: <strong>₹${sales.reduce((a,s)=>a+(s.totalAmount||0),0).toLocaleString('en-IN')}</strong></span>
            <span>Profit: <strong style="color:var(--success);">₹${sales.reduce((a,s)=>a+(s.profit||0),0).toLocaleString('en-IN')}</strong></span>
            <span>Due: <strong style="color:var(--danger);">₹${sales.reduce((a,s)=>a+(s.dueAmount||0),0).toLocaleString('en-IN')}</strong></span>
          </div>` : ''}
      </div>`;
}
}

function drawMonthlyChart() {
  const ctx = document.getElementById('monthlyChart');
  if (!ctx) return;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const sales = months.map(()=>Math.floor(Math.random()*50000+10000));
  const profits = sales.map(s=>Math.floor(s*0.28));
  if (state.charts.monthly) state.charts.monthly.destroy();
  state.charts.monthly = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: { labels:months, datasets:[
      {label:'Sales ₹',data:sales,backgroundColor:'rgba(37,99,235,0.7)',borderRadius:6},
      {label:'Profit ₹',data:profits,backgroundColor:'rgba(22,163,74,0.7)',borderRadius:6}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:10}}},scales:{y:{beginAtZero:true,grid:{color:'rgba(148,163,184,0.1)'},ticks:{callback:v=>'₹'+v.toLocaleString('en-IN'),font:{size:10}}},x:{grid:{display:false}}}}
  });
}

// ════════════════════════════════════════════════════════════
//  EXCEL IMPORT / EXPORT
// ════════════════════════════════════════════════════════════
function dragOver(e) { e.preventDefault(); document.getElementById('dropZone').style.borderColor='var(--accent)'; }
function dropFile(e) { e.preventDefault(); document.getElementById('dropZone').style.borderColor=''; handleExcelImport({files:e.dataTransfer.files}); }

function handleExcelImport(input) {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, {type:'binary'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);
    showImportPreview(rows);
  };
  reader.readAsBinaryString(file);
}

function showImportPreview(rows) {
  const el = document.getElementById('importPreview');
  if (!rows.length) { el.innerHTML='<div class="alert alert-red">No data found in file</div>'; return; }
  el.innerHTML = `
    <div class="alert alert-green"><strong>${rows.length} products</strong> found in file. Review and confirm import.</div>
    <div class="card" style="padding:0;overflow:hidden;max-height:300px;overflow-y:auto;margin-bottom:12px">
      <table><thead><tr><th>Name</th><th>Cost</th><th>Price</th><th>Stock</th></tr></thead>
      <tbody>${rows.slice(0,10).map(r=>`<tr><td>${esc(r.Name||r.name||'')}</td><td>₹${r.CostPrice||r.costPrice||0}</td><td>₹${r.SellPrice||r.sellPrice||0}</td><td>${r.Stock||r.stock||0}</td></tr>`).join('')}
      ${rows.length>10?`<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:8px">…and ${rows.length-10} more</td></tr>`:''}</tbody></table>
    </div>
    <button class="btn btn-success btn-full" onclick="confirmImport(${JSON.stringify(rows).replace(/"/g,'&quot;')})">
      Import ${rows.length} Products
    </button>`;
}

async function confirmImport(rows) {
  const newProds = rows.map(r => ({
    name: r.Name||r.name||'Unknown',
    category: r.Category||r.category||'other',
    emoji: CAT_EMOJIS[r.Category||r.category||'other']||'📦',
    costPrice: parseFloat(r.CostPrice||r.costPrice)||0,
    sellPrice: parseFloat(r.SellPrice||r.sellPrice)||0,
    stock: parseInt(r.Stock||r.stock)||0,
    minStock: parseInt(r.MinStock||r.minStock)||5,
  }));
  const result = await api('POST','/products/import',newProds);
  if (!Array.isArray(result)) return;
  state.products.push(...result);
  buildFuseIndexes(); updateNavBadges();
  toast(`Imported ${newProds.length} products ✓`,'success');
  document.getElementById('importPreview').innerHTML = `<div class="alert alert-green">✓ ${newProds.length} products imported successfully!</div>`;
}

function exportProducts() {
  const data = state.products.map(p=>({Name:p.name,Category:p.category,CostPrice:p.costPrice,SellPrice:p.sellPrice,Profit:p.sellPrice-p.costPrice,Stock:p.stock,MinStock:p.minStock}));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  XLSX.writeFile(wb, 'ElectroShop_Products_'+todayStr()+'.xlsx');
  toast('Products exported ✓','success');
}

async function exportSales(type) {
  const today = todayStr();
  let from, to;
  if (type === 'daily') {
    from = today; to = today;
  } else {
    const now = new Date();
    from = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-01';
    to = today;
  }
  const sales = await api('GET', `/sales?from=${from}&to=${to}`);
  if (!sales || sales.length === 0) { toast('No sales found for this period', 'error'); return; }
  const data = sales.map(s => ({
    Date: s.saleDate ? new Date(s.saleDate).toLocaleDateString('en-IN') : '—',
    Time: s.saleDate ? new Date(s.saleDate).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '—',
    BillNo: 'BILL-' + String(s.id).padStart(5,'0'),
    Customer: s.customer ? s.customer.name : 'Walk-in',
    Phone: s.customer ? (s.customer.phone||'—') : '—',
    Items: s.items ? s.items.map(i=>(i.product?i.product.name:'Unknown')+' x'+i.quantity).join(', ') : '—',
    Total: s.totalAmount||0,
    Paid: s.amountPaid||0,
    Due: s.dueAmount||0,
    Profit: s.profit||0
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sales');
  XLSX.writeFile(wb, `ElectroShop_Sales_${type}_${today}.xlsx`);
  toast(`${data.length} sales exported ✓`, 'success');
}

async function triggerBackup() {
  const [products, customers, sales] = await Promise.all([
    api('GET','/products'), api('GET','/customers'), api('GET','/sales')
  ]);
  if (!Array.isArray(products) || !Array.isArray(customers) || !Array.isArray(sales)) {
    toast('Backup failed — could not read data', 'error');
    return;
  }
  const blob = new Blob(
    [JSON.stringify({exportedAt: new Date().toISOString(), products, customers, sales}, null, 2)],
    {type:'application/json'}
  );
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'ElectroShop_Backup_' + todayStr() + '.json';
  link.click();
  URL.revokeObjectURL(link.href);
  const now = new Date().toLocaleString('en-IN');
  document.getElementById('lastBackupTime').textContent = 'Last backup: ' + now;
  localStorage.setItem('lastBackup', now);
  toast('Backup downloaded ✓','success');
}

// ════════════════════════════════════════════════════════════
//  GLOBAL SEARCH
// ════════════════════════════════════════════════════════════
function handleGlobalSearch(q) {
  if (!q) return;
  const prodResults = state.fuseProducts.search(q).slice(0,3).map(r=>r.item);
  const custResults = state.fuseCustomers.search(q).slice(0,2).map(r=>r.item);
  if (prodResults.length) navigate('products', null);
  state.productSearch = q;
  renderProducts(q);
}

// ════════════════════════════════════════════════════════════
//  CLOSE DROPDOWNS ON OUTSIDE CLICK
// ════════════════════════════════════════════════════════════
document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap')) {
    document.querySelectorAll('.autocomplete-dropdown').forEach(d=>d.classList.remove('show'));
  }
});

// ════════════════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ════════════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (e.key==='Escape') {
    document.querySelectorAll('.modal-backdrop.open').forEach(m=>m.classList.remove('open'));
    document.querySelectorAll('.autocomplete-dropdown').forEach(d=>d.classList.remove('show'));
  }
  if ((e.ctrlKey||e.metaKey) && e.key==='k') { e.preventDefault(); document.getElementById('globalSearch').focus(); }
  if ((e.ctrlKey||e.metaKey) && e.key==='n' && state.currentPage==='products') { e.preventDefault(); openProductModal(); }
});

// ════════════════════════════════════════════════════════════
//  BACKUP RESTORE
// ════════════════════════════════════════════════════════════
const saved = localStorage.getItem('lastBackup');
if (saved) document.getElementById('lastBackupTime').textContent = 'Last backup: '+saved;

// ════════════════════════════════════════════════════════════
//  AUTO REFRESH SYSTEM
// ════════════════════════════════════════════════════════════
let autoRefreshInterval = null;
let isRefreshing = false;

async function silentRefresh() {
  if (isRefreshing) return;
  isRefreshing = true;
  try {
    const [freshProducts, freshCustomers] = await Promise.all([
      api('GET', '/products'),
      api('GET', '/customers'),
    ]);
    if (freshProducts && Array.isArray(freshProducts)) state.products = freshProducts;
    if (freshCustomers && Array.isArray(freshCustomers)) state.customers = freshCustomers;
    buildFuseIndexes();
    updateNavBadges();
    if (state.currentPage === 'products') renderProducts();
    if (state.currentPage === 'customers') renderCustomers('');
    if (state.currentPage === 'stock') loadStock();
    if (state.currentPage === 'dashboard') loadDashboard();
    if (state.currentPage === 'sales') renderSalePage();
    updateRefreshIndicator(true);
  } catch(e) {
    updateRefreshIndicator(false);
  } finally {
    isRefreshing = false;
  }
}

function updateRefreshIndicator(success) {
  const dot = document.getElementById('refreshDot');
  if (!dot) return;
  dot.style.background = success ? 'var(--success)' : 'var(--danger)';
  dot.title = success
    ? 'Live — Last synced: ' + new Date().toLocaleTimeString('en-IN')
    : 'Sync failed — check connection';
}

function startAutoRefresh(seconds = 30) {
  stopAutoRefresh();
  autoRefreshInterval = setInterval(silentRefresh, seconds * 1000);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopAutoRefresh();
  } else {
    silentRefresh();
    startAutoRefresh(30);
  }
});

// ════════════════════════════════════════════════════════════
//  START
// ════════════════════════════════════════════════════════════
init();
startAutoRefresh(30);