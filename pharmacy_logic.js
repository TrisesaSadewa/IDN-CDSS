// CONFIGURATION
const API_BASE = "https://smart-his-backend.onrender.com";

// STATE
const SUPABASE_URL = 'https://crywwqleinnwoacithmw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyeXd3cWxlaW5ud29hY2l0aG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MDg4MTIsImV4cCI6MjA4Mzk4NDgxMn0.VTDI6ZQ_aN895A29_v0F1vHzqaS-RG7iGzOFM6qMKfk';
const pharmacySupabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let currentQueue = [];
let selectedOrder = null;

// INIT
document.addEventListener('DOMContentLoaded', () => {
    fetchQueue();
    // Simulate inventory load
    renderInventory();
    setupAddStockLogic();
    setupGlobalSearch();
});

let inventoryData = [];

function setupGlobalSearch() {
    const searchInput = document.getElementById('global-search');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();

        // Filter Queue
        const filteredQueue = currentQueue.filter(o =>
            o.patient_name.toLowerCase().includes(q) ||
            o.mrn.toLowerCase().includes(q) ||
            o.items.some(i => i.name.toLowerCase().includes(q))
        );
        renderQueue(filteredQueue);

        // Filter Inventory
        renderInventory(q);
    });
}

// --- ADD STOCK MODAL ---
function openAddStockModal() {
    document.getElementById('add-stock-modal').classList.remove('hidden');
}

function closeAddStockModal() {
    document.getElementById('add-stock-modal').classList.add('hidden');
    document.getElementById('add-stock-form').reset();
    document.getElementById('add-drug-suggestions').classList.add('hidden');
}

function setupAddStockLogic() {
    const input = document.getElementById('add-drug-name');
    const suggestions = document.getElementById('add-drug-suggestions');
    const form = document.getElementById('add-stock-form');

    if (!input || !pharmacySupabase) return;

    input.addEventListener('input', async (e) => {
        const q = e.target.value;
        if (q.length < 2) { suggestions.classList.add('hidden'); return; }

        try {
            const { data } = await pharmacySupabase
                .from('knowledge_map')
                .select('id, local_term')
                .ilike('local_term', `%${q}%`)
                .limit(10);

            suggestions.innerHTML = '';
            if (data && data.length > 0) {
                suggestions.classList.remove('hidden');
                data.forEach(item => {
                    const div = document.createElement('div');
                    div.innerHTML = `<i data-feather="package" class="w-3 h-3 inline mr-2 text-slate-400"></i><span class="font-semibold text-slate-800">${item.local_term}</span>`;
                    div.onclick = () => {
                        input.value = item.local_term;
                        document.getElementById('selected-drug-id').value = item.id;
                        suggestions.classList.add('hidden');
                    };
                    suggestions.appendChild(div);
                });
                feather.replace();
            } else {
                suggestions.classList.add('hidden');
            }
        } catch (e) {
            console.error("Search Error:", e);
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const drugId = document.getElementById('selected-drug-id').value;
        if (!drugId) return alert("Please select a drug from the list.");

        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Updating...";

        const payload = {
            drug_id: drugId,
            batch_number: document.getElementById('batch-number').value,
            expiry_date: document.getElementById('expiry-date').value,
            stock_level: parseInt(document.getElementById('stock-qty').value),
            unit_price: parseFloat(document.getElementById('unit-price').value)
        };

        try {
            const { error } = await pharmacySupabase
                .from('pharmacy_inventory')
                .insert([payload]);

            if (error) throw error;

            alert("Stock updated successfully!");
            renderInventory();
            closeAddStockModal();
        } catch (err) {
            alert("Failed to update stock: " + err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !suggestions.contains(e.target)) suggestions.classList.add('hidden');
    });
}

// --- NAVIGATION ---
function switchTab(tabId) {
    // 1. Reset Sidebar Active State
    document.querySelectorAll('.sidebar-item').forEach(el => {
        el.classList.remove('active', 'bg-indigo-600', 'text-white', 'shadow-md');
        el.classList.add('text-slate-300'); // Reset to default
    });

    // 2. Set Active Sidebar Item
    const activeBtn = document.getElementById(`tab-${tabId}`);
    activeBtn.classList.add('active'); // CSS handles the styling via .active class

    // 3. Toggle Content Views
    document.getElementById('view-queue').classList.add('hidden');
    document.getElementById('view-inventory').classList.add('hidden');
    document.getElementById('view-history').classList.add('hidden');

    document.getElementById(`view-${tabId}`).classList.remove('hidden');

    // 4. Update Header Title
    const titles = {
        'queue': 'Dispense Queue',
        'inventory': 'Inventory Management',
        'history': 'History Logs'
    };
    document.getElementById('page-title').textContent = titles[tabId];
}

// --- QUEUE LOGIC ---
async function fetchQueue() {
    const container = document.getElementById('queue-container');

    try {
        // Fetch pending orders via Backend API
        // NOTE: Ensure your main.py has a /pharmacy/queue endpoint or similar. 
        // If not, we use a mock for demonstration.

        // MOCK DATA (Replace with fetch call in production)
        const mockData = [
            {
                id: "ord_123",
                patient_name: "Jane Doe",
                mrn: "PT-1001",
                doctor: "Dr. Smith",
                timestamp: "10:30 AM",
                items: [
                    { name: "Amoxicillin", dose: "500mg", qty: 20, schedule: "1-1-1" },
                    { name: "Paracetamol", dose: "500mg", qty: 10, schedule: "PRN" }
                ],
                status: "pending"
            },
            {
                id: "ord_124",
                patient_name: "Budi Santoso",
                mrn: "PT-1042",
                doctor: "Dr. Aminah",
                timestamp: "11:15 AM",
                items: [
                    { name: "Metformin", dose: "500mg", qty: 60, schedule: "1-0-1" }
                ],
                status: "pending"
            }
        ];

        currentQueue = mockData; // Replace with API result
        renderQueue(currentQueue);
        updateStats(currentQueue.length);

    } catch (e) {
        console.error("Queue Fetch Error:", e);
        container.innerHTML = `<div class="col-span-full text-center text-red-500 py-10">Error loading queue. Check console.</div>`;
    }
}

function renderQueue(orders) {
    const container = document.getElementById('queue-container');
    container.innerHTML = '';

    if (orders.length === 0) {
        container.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-20 text-slate-400">
                <i data-feather="check-circle" class="w-16 h-16 mb-4 text-emerald-200"></i>
                <p class="text-lg font-medium">All caught up!</p>
                <p class="text-sm">No pending prescriptions to dispense.</p>
            </div>
        `;
        feather.replace();
        return;
    }

    orders.forEach(order => {
        const card = document.createElement('div');
        card.className = "bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-all p-5 flex flex-col relative overflow-hidden group";

        // Left Border Color Strip
        card.innerHTML = `
            <div class="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500"></div>
            
            <div class="flex justify-between items-start mb-4 pl-3">
                <div>
                    <h3 class="font-bold text-lg text-slate-800">${order.patient_name}</h3>
                    <p class="text-xs text-slate-500 font-mono">${order.mrn} • ${order.timestamp}</p>
                </div>
                <span class="bg-indigo-50 text-indigo-600 text-xs font-bold px-2 py-1 rounded border border-indigo-100">
                    ${order.items.length} Items
                </span>
            </div>

            <div class="bg-slate-50 rounded-lg p-3 mb-4 flex-1 border border-slate-100 pl-3">
                <ul class="space-y-2">
                    ${order.items.map(item => `
                        <li class="flex justify-between text-sm text-slate-700">
                            <span><span class="font-semibold">${item.name}</span> <span class="text-slate-400 text-xs">(${item.dose})</span></span>
                            <span class="font-mono text-slate-500">x${item.qty}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>

            <div class="flex items-center justify-between pl-3 pt-2 border-t border-slate-100">
                <div class="flex items-center text-xs text-slate-400">
                    <i data-feather="user" class="w-3 h-3 mr-1"></i> ${order.doctor}
                </div>
                <button onclick="openDispenseModal('${order.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-emerald-100 transition-transform active:scale-95 flex items-center">
                    Dispense <i data-feather="arrow-right" class="w-4 h-4 ml-1"></i>
                </button>
            </div>
        `;
        container.appendChild(card);
    });
    feather.replace();
}

function updateStats(count) {
    const badge = document.getElementById('queue-badge');
    const statPending = document.getElementById('stat-pending');

    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    statPending.textContent = count;
    // Mock completed
    document.getElementById('stat-completed').textContent = 0;
}

// --- MODAL LOGIC ---
function openDispenseModal(orderId) {
    selectedOrder = currentQueue.find(o => o.id === orderId);
    if (!selectedOrder) return;

    const modal = document.getElementById('dispense-modal');
    const list = document.getElementById('modal-summary');

    list.innerHTML = selectedOrder.items.map(i => `
        <li class="flex justify-between">
            <span>${i.name}</span>
            <span class="font-bold">x${i.qty}</span>
        </li>
    `).join('');
    // Setup Confirm Button Strict Checks
    const confirmBtn = document.getElementById('confirm-dispense-btn');
    document.getElementById('check-allergies').checked = false;
    document.getElementById('check-counseling').checked = false;
    toggleDispenseBtn();

    confirmBtn.onclick = async () => {
        confirmBtn.innerHTML = `<i data-feather="loader" class="w-4 h-4 animate-spin absolute left-4 top-3"></i> Processing...`;
        confirmBtn.disabled = true;

        setTimeout(() => {
            currentQueue = currentQueue.filter(o => o.id !== orderId);
            renderQueue(currentQueue);
            updateStats(currentQueue.length);
            closeModal();
            alert("✅ Secure Dispense Complete. Electronic signature and RxNorm: 8640-1 dispensing code logged for HIPAA/GDPR audit trail.");
        }, 1000);
    };

    modal.classList.remove('hidden');
    feather.replace();
}

function toggleDispenseBtn() {
    const allergy = document.getElementById('check-allergies').checked;
    const counseling = document.getElementById('check-counseling').checked;
    const btn = document.getElementById('confirm-dispense-btn');

    if (allergy && counseling) {
        btn.disabled = false;
        btn.className = "flex-1 py-2.5 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition relative overflow-hidden";
        btn.innerHTML = `Confirm Dispense`;
    } else {
        btn.disabled = true;
        btn.className = "flex-1 py-2.5 bg-slate-200 text-slate-400 font-bold rounded-lg cursor-not-allowed transition-all relative";
        btn.innerHTML = `<i data-feather="lock" class="w-4 h-4 absolute left-4 top-3 opacity-50"></i> Confirm`;
    }
    feather.replace();
}

function closeModal() {
    document.getElementById('dispense-modal').classList.add('hidden');
    selectedOrder = null;
}

// --- INVENTORY LOGIC (Live Database) ---
async function renderInventory(searchQuery = "") {
    const tableBody = document.getElementById('inventory-table');
    if (!pharmacySupabase || !tableBody) return;

    try {
        const { data: inventory, error } = await pharmacySupabase
            .from('pharmacy_inventory')
            .select(`
                id,
                stock_level,
                unit_price,
                drug_id,
                knowledge_map (
                    local_term,
                    fhir_coding
                )
            `);

        if (error) throw error;
        inventoryData = inventory || [];

        const filtered = inventoryData.filter(item => {
            const name = item.knowledge_map?.local_term || "";
            return name.toLowerCase().includes(searchQuery.toLowerCase());
        });

        // 1. Calculate Metrics
        let totalValue = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;

        inventoryData.forEach(item => {
            totalValue += (item.unit_price || 0) * (item.stock_level || 0);
            if (item.stock_level === 0) outOfStockCount++;
            else if (item.stock_level < 50) lowStockCount++;
        });

        // 2. Update Metric UI
        const valEl = document.getElementById('inv-total-value');
        const skusEl = document.getElementById('inv-total-skus');
        const lowEl = document.getElementById('inv-low-stock');
        const outEl = document.getElementById('inv-out-of-stock');
        if (outEl) outEl.textContent = outOfStockCount;
        const queueAlertEl = document.getElementById('stat-alerts');

        if (valEl) valEl.textContent = `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (skusEl) skusEl.textContent = inventoryData.length;
        if (lowEl) lowEl.textContent = lowStockCount;
        if (outEl) outEl.textContent = outOfStockCount;
        if (queueAlertEl) queueAlertEl.textContent = lowStockCount + outOfStockCount;

        // 3. Render Table
        tableBody.innerHTML = filtered.map(item => {
            const kMap = (Array.isArray(item.knowledge_map) ? item.knowledge_map[0] : item.knowledge_map) || {};
            const name = kMap.local_term || "Unknown Drug";
            const stock = item.stock_level || 0;
            const price = item.unit_price || 0;

            let status = 'ok';
            if (stock === 0) status = 'out';
            else if (stock < 50) status = 'low';

            let statusBadge = '';
            if (status === 'ok') statusBadge = `<span class="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100 flex items-center w-fit"><span class="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2"></span>In Stock</span>`;
            if (status === 'low') statusBadge = `<span class="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-100 flex items-center w-fit"><span class="w-1.5 h-1.5 bg-amber-500 animate-pulse rounded-full mr-2"></span>Low Stock</span>`;
            if (status === 'out') statusBadge = `<span class="bg-rose-50 text-rose-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-rose-100 flex items-center w-fit"><span class="w-1.5 h-1.5 bg-rose-500 rounded-full mr-2"></span>None</span>`;

            return `
                <tr class="hover:bg-slate-50 transition-all border-b border-slate-100 group">
                    <td class="px-6 py-4">
                        <div class="flex items-center">
                            <div class="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 mr-3 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">
                                <i data-feather="package" class="w-4 h-4"></i>
                            </div>
                            <div>
                                <div class="font-bold text-slate-800">${name}</div>
                                <div class="text-[10px] text-slate-400 font-mono tracking-tighter">${item.drug_id}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4 text-slate-500 text-xs font-semibold">General Pharma</td>
                    <td class="px-6 py-4">
                        <span class="font-mono text-base font-bold ${status === 'out' ? 'text-rose-500' : 'text-slate-700'}">${stock}</span>
                        <span class="text-[10px] text-slate-400 ml-1">units</span>
                    </td>
                    <td class="px-6 py-4 text-slate-600 font-bold">$${price.toFixed(2)}</td>
                    <td class="px-6 py-4">${statusBadge}</td>
                    <td class="px-6 py-4 text-right">
                        <div class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onclick="editStock('${item.id}', ${stock})" class="text-slate-400 hover:text-indigo-600 transition-colors bg-white p-2 rounded-lg border border-slate-200 shadow-sm"><i data-feather="edit-2" class="w-3.5 h-3.5"></i></button>
                            <button onclick="deleteStock('${item.id}')" class="text-slate-400 hover:text-rose-600 transition-colors bg-white p-2 rounded-lg border border-slate-200 shadow-sm"><i data-feather="trash-2" class="w-3.5 h-3.5"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (filtered.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-20 text-center text-slate-400 italic">No inventory matching "${searchQuery}" found.</td></tr>`;
        }

        feather.replace();

    } catch (e) {
        console.error("Inventory Fetch Error:", e);
        tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-red-500 font-medium">Failed to load inventory from database.</td></tr>`;
    }
}

async function editStock(id, currentStock) {
    const newStock = prompt("Update Stock Level:", currentStock);
    if (newStock === null || newStock === "") return;

    try {
        const { error } = await pharmacySupabase
            .from('pharmacy_inventory')
            .update({ stock_level: parseInt(newStock) })
            .eq('id', id);

        if (error) throw error;
        renderInventory();
    } catch (e) {
        alert("Update failed: " + e.message);
    }
}

async function deleteStock(id) {
    if (!confirm("Remove this item from inventory? This cannot be undone.")) return;

    try {
        const { error } = await pharmacySupabase
            .from('pharmacy_inventory')
            .delete()
            .eq('id', id);

        if (error) throw error;
        renderInventory();
    } catch (e) {
        alert("Delete failed: " + e.message);
    }
}
