// CONFIGURATION
const API_BASE = "https://smart-his-backend.onrender.com";

// STATE
let currentQueue = [];
let selectedOrder = null;

// INIT
document.addEventListener('DOMContentLoaded', () => {
    fetchQueue();
    // Simulate inventory load
    renderInventory(); 
});

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
    document.getElementById('stat-completed').textContent = 14; 
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

    // Setup Confirm Button
    const confirmBtn = document.getElementById('confirm-dispense-btn');
    confirmBtn.onclick = () => confirmDispense(orderId);

    modal.classList.remove('hidden');
    // Simple animation logic could go here
}

function closeModal() {
    document.getElementById('dispense-modal').classList.add('hidden');
    selectedOrder = null;
}

async function confirmDispense(orderId) {
    const btn = document.getElementById('confirm-dispense-btn');
    const originalText = btn.innerHTML;
    
    btn.innerHTML = `<i data-feather="loader" class="animate-spin w-4 h-4 inline"></i> Processing...`;
    feather.replace();
    
    // Simulate API Call delay
    setTimeout(() => {
        // Remove from local state
        currentQueue = currentQueue.filter(o => o.id !== orderId);
        
        // Update UI
        renderQueue(currentQueue);
        updateStats(currentQueue.length);
        
        closeModal();
        btn.innerHTML = originalText;
        
        // Optional: Show Toast Success
        alert("Order Dispensed Successfully!"); 
    }, 1000);
}

// --- INVENTORY LOGIC (Mock) ---
function renderInventory() {
    const tableBody = document.getElementById('inventory-table');
    const mockInventory = [
        { name: "Amoxicillin 500mg", cat: "Antibiotic", stock: 450, price: "$0.50", status: "ok" },
        { name: "Paracetamol 500mg", cat: "Analgesic", stock: 1200, price: "$0.10", status: "ok" },
        { name: "Metformin 500mg", cat: "Antidiabetic", stock: 45, price: "$0.30", status: "low" },
        { name: "Ibuprofen 400mg", cat: "NSAID", stock: 0, price: "$0.25", status: "out" },
    ];

    tableBody.innerHTML = mockInventory.map(item => {
        let statusBadge = '';
        if (item.status === 'ok') statusBadge = `<span class="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold">In Stock</span>`;
        if (item.status === 'low') statusBadge = `<span class="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs font-bold">Low Stock</span>`;
        if (item.status === 'out') statusBadge = `<span class="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">Out of Stock</span>`;

        return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4 font-medium text-slate-800">${item.name}</td>
                <td class="px-6 py-4 text-slate-500">${item.cat}</td>
                <td class="px-6 py-4 font-mono font-bold ${item.status === 'out' ? 'text-red-500' : 'text-slate-700'}">${item.stock}</td>
                <td class="px-6 py-4 text-slate-600">${item.price}</td>
                <td class="px-6 py-4">${statusBadge}</td>
                <td class="px-6 py-4 text-right">
                    <button class="text-slate-400 hover:text-indigo-600 transition-colors"><i data-feather="edit-2" class="w-4 h-4"></i></button>
                </td>
            </tr>
        `;
    }).join('');
    
    feather.replace();
}