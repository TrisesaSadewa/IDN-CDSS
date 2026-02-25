// --- CONFIGURATION ---
const SUPABASE_URL = 'https://crywwqleinnwoacithmw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyeXd3cWxlaW5ud29hY2l0aG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MDg4MTIsImV4cCI6MjA4Mzk4NDgxMn0.VTDI6ZQ_aN895A29_v0F1vHzqaS-RG7iGzOFM6qMKfk';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// LOINC Database Mapping
const LOINC_DB = {
    'Hematology': [
        { name: 'Hemoglobin', code: '718-7' },
        { name: 'WBC (Leukocytes)', code: '6690-2' },
        { name: 'Platelets', code: '777-3' },
        { name: 'Hematocrit', code: '4544-3' }
    ],
    'Biochemistry': [
        { name: 'Glucose (Random)', code: '2345-7' },
        { name: 'Glucose (Fasting)', code: '14771-0' },
        { name: 'Creatinine', code: '2160-0' },
        { name: 'BUN (Blood Urea Nitrogen)', code: '3094-0' },
        { name: 'Cholesterol (Total)', code: '2093-3' }
    ],
    'Immunology': [
        { name: 'H. Pylori Antigen', code: '13006-2' },
        { name: 'Dengue NS1 Ag', code: '56475-7' },
        { name: 'COVID-19 RT-PCR', code: '94500-6' }
    ],
    'Microbiology': [
        { name: 'Blood Culture', code: '600-7' },
        { name: 'Urine Culture', code: '630-4' }
    ]
};

// State
let allPatients = [];
let currentPatientId = null;
let currentView = 'queue';
let labQueue = [];
let inventoryItems = [];

// Auth check
function checkAuth() {
    const token = localStorage.getItem('smart_his_token');
    const role = localStorage.getItem('smart_his_role');
    const name = localStorage.getItem('smart_his_name');

    if (!token || (role !== 'lab_tech' && role !== 'admin')) {
        alert("Access denied. Please log in as a Laboratory Technician.");
        window.location.href = 'index.html';
    }

    const n = document.getElementById('userNameDisplay');
    if (n) n.textContent = name;

    // Set initial
    if (name) {
        document.getElementById('userInitial').textContent = name.substring(0, 2).toUpperCase();
    }
}

// Init
window.onload = () => {
    checkAuth();
    if (window.feather) feather.replace();

    // Initial data load
    loadQueue();
    loadPatients();
    loadInventory();

    // Search bar event
    const s = document.getElementById('patientSearch');
    if (s) {
        s.addEventListener('input', (e) => {
            renderPatientList(e.target.value);
        });
    }
};

function switchView(viewId) {
    // UI State
    document.querySelectorAll('section[id^="view-"]').forEach(s => s.classList.add('hidden'));
    document.getElementById(`view-${viewId}`).classList.remove('hidden');

    document.querySelectorAll('button[id^="nav-"]').forEach(b => {
        b.classList.remove('nav-active');
        b.classList.add('text-slate-600');
    });
    const activeNav = document.getElementById(`nav-${viewId}`);
    activeNav.classList.add('nav-active');
    activeNav.classList.remove('text-slate-600');

    currentView = viewId;

    // Trigger specific loads
    if (viewId === 'queue') loadQueue();
    if (viewId === 'inventory') loadInventory();
    if (viewId === 'history') loadFullHistory();

    if (window.feather) feather.replace();
}

function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

// --- QUEUE LOGIC ---
async function loadQueue() {
    const { data, error } = await supabaseClient
        .from('lab_results')
        .select('*, patients(full_name, mrn, dob, gender)')
        .in('status', ['requested', 'processing', 'cancelled'])
        .order('created_at', { ascending: true });

    if (error) {
        console.error("Queue Load Error:", error);
        return;
    }

    labQueue = data || [];
    document.getElementById('queueCount').textContent = labQueue.filter(q => q.status === 'requested').length;
    renderQueue();
}

function renderQueue() {
    const reqList = document.getElementById('queue-requested');
    const procList = document.getElementById('queue-processing');

    reqList.innerHTML = '';
    procList.innerHTML = '';

    const requested = labQueue.filter(i => i.status === 'requested');
    const processing = labQueue.filter(i => i.status === 'processing');

    if (requested.length === 0) {
        reqList.innerHTML = `<div class="p-6 text-center text-slate-400 text-xs italic">No new requests</div>`;
    } else {
        requested.forEach(item => {
            reqList.appendChild(createQueueCard(item));
        });
    }

    if (processing.length === 0) {
        procList.innerHTML = `<div class="p-6 text-center text-slate-400 text-xs italic">Nothing in processing</div>`;
    } else {
        processing.forEach(item => {
            procList.appendChild(createQueueCard(item));
        });
    }

    if (window.feather) feather.replace();
}

function createQueueCard(item) {
    const p = item.patients || { full_name: 'Unknown', mrn: 'N/A' };
    const date = new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const div = document.createElement('div');
    div.className = "bg-white p-4 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-indigo-500 hover:shadow-md transition-all animate-fade-in";
    div.onclick = () => viewOrderDetail(item.id);
    div.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <span class="text-[9px] font-black bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase tracking-tighter">${item.test_category}</span>
            <span class="text-[9px] font-bold text-slate-400 italic">${date}</span>
        </div>
        <p class="text-sm font-black text-slate-800 truncate">${p.full_name}</p>
        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">${item.test_name}</p>
        <div class="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
            <span class="text-[9px] font-bold text-indigo-600">MRN: ${p.mrn}</span>
            <i data-feather="chevron-right" class="w-3 h-3 text-slate-300"></i>
        </div>
    `;
    return div;
}

function viewOrderDetail(orderId) {
    const item = labQueue.find(q => q.id === orderId);
    if (!item) return;

    const placeholder = document.getElementById('queue-detail-placeholder');
    const detailCard = document.getElementById('queue-detail-card');

    placeholder.classList.add('hidden');
    detailCard.classList.remove('hidden');

    const p = item.patients || {};
    const age = calculateAge(p.dob);

    detailCard.innerHTML = `
        <div class="p-8 bg-slate-50 border-b border-slate-100">
            <div class="flex justify-between items-start mb-6">
                <div>
                    <h3 class="text-2xl font-black text-slate-800">${p.full_name}</h3>
                    <p class="text-sm text-slate-500 font-medium">MRN: ${p.mrn} | ${age}y | ${p.gender}</p>
                </div>
                <button onclick="closeOrderDetail()" class="p-2 hover:bg-slate-200 rounded-lg transition-colors"><i data-feather="x" class="w-5 h-5 text-slate-400"></i></button>
            </div>
            
            <div class="flex flex-wrap gap-3">
                <div class="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                    <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Test Category</p>
                    <p class="text-xs font-bold text-indigo-600">${item.test_category}</p>
                </div>
                <div class="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                    <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Standard (LOINC)</p>
                    <p class="text-xs font-bold text-slate-700">${item.test_name} (${item.loinc_code || '---'})</p>
                </div>
            </div>
        </div>
        
        <div class="p-8 flex-grow space-y-6">
            <div class="bg-orange-50 border border-orange-100 p-4 rounded-xl">
                 <p class="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-2">Clinical Indication / Notes</p>
                 <p class="text-sm text-orange-800 leading-relaxed italic">${item.clinical_notes || 'No specific clinical notes provided by clinician.'}</p>
            </div>
            
            ${item.status === 'processing' ? `
                <div class="space-y-4 animate-fade-in">
                    <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Laboratory Observation (Measure)</label>
                    <div class="flex gap-3">
                        <input type="text" id="orderResult" placeholder="Result Value" class="flex-grow p-4 border border-slate-200 rounded-2xl text-lg font-black text-indigo-600 focus:ring-4 focus:ring-indigo-100 outline-none shadow-inner bg-slate-50">
                        <input type="text" id="orderUnits" placeholder="Units" class="w-32 p-4 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 focus:ring-4 focus:ring-indigo-100 outline-none shadow-inner bg-slate-50">
                    </div>

                    <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Inventory Consumption</p>
                        <div class="flex gap-2">
                             <select id="itemToConsume" class="flex-grow p-2 text-xs border border-slate-200 rounded-lg outline-none bg-white font-semibold">
                                <option value="">-- No Item Used --</option>
                                ${inventoryItems.map(inv => `<option value="${inv.id}">${inv.item_name} (Stock: ${inv.stock_level})</option>`).join('')}
                             </select>
                             <input type="number" id="itemQty" value="1" min="1" class="w-16 p-2 text-xs border border-slate-200 rounded-lg outline-none bg-white font-bold">
                        </div>
                    </div>

                    <button onclick="finalizeOrder('${item.id}')" class="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2">
                        <i data-feather="check-circle" class="w-5 h-5"></i> Finalize & Publish to EMR
                    </button>
                    <button onclick="updateOrderStatus('${item.id}', 'requested')" class="w-full py-2 text-slate-400 text-xs font-bold hover:text-slate-600 transition-all">Move back to Requested</button>
                </div>
            ` : `
                <div class="flex flex-col items-center justify-center py-10 space-y-4">
                    <div class="bg-blue-50 p-6 rounded-full text-blue-600 mb-2">
                        <i data-feather="play-circle" class="w-12 h-12"></i>
                    </div>
                    <p class="text-slate-600 font-bold">Ready to process sample?</p>
                    <p class="text-xs text-slate-400 text-center max-w-[250px]">Marking this as processing will notify the clinician that the technical analysis has begun.</p>
                    <button onclick="updateOrderStatus('${item.id}', 'processing')" class="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">
                        Begin Technical Analysis
                    </button>
                </div>
            `}
        </div>
    `;
    if (window.feather) feather.replace();
}

function closeOrderDetail() {
    document.getElementById('queue-detail-placeholder').classList.remove('hidden');
    document.getElementById('queue-detail-card').classList.add('hidden');
}

async function updateOrderStatus(orderId, newStatus) {
    const { error } = await supabaseClient
        .from('lab_results')
        .update({ status: newStatus })
        .eq('id', orderId);

    if (error) {
        alert("Status update failed.");
        return;
    }

    await loadQueue();
    if (newStatus === 'processing' || newStatus === 'requested') {
        viewOrderDetail(orderId);
    } else {
        closeOrderDetail();
    }
}

async function finalizeOrder(orderId) {
    const resVal = document.getElementById('orderResult').value.trim();
    const units = document.getElementById('orderUnits').value.trim();
    const itemId = document.getElementById('itemToConsume').value;
    const itemQty = parseInt(document.getElementById('itemQty').value) || 0;

    if (!resVal) return alert("Result value is required.");

    const finalVal = units ? `${resVal} ${units}` : resVal;

    try {
        // 1. Update Lab Result
        const { error: resError } = await supabaseClient
            .from('lab_results')
            .update({
                result_value: finalVal,
                status: 'final'
            })
            .eq('id', orderId);

        if (resError) throw resError;

        // 2. Consume Inventory if selected
        if (itemId) {
            const item = inventoryItems.find(i => i.id === itemId);
            if (item) {
                const newStock = Math.max(0, item.stock_level - itemQty);
                const { error: invError } = await supabaseClient
                    .from('lab_inventory')
                    .update({ stock_level: newStock })
                    .eq('id', itemId);
                if (invError) console.error("Inventory deduction failed:", invError);
            }
        }

        alert("Results published successfully.");
        await loadQueue();
        await loadInventory(); // Sync inventory counts
        closeOrderDetail();
    } catch (err) {
        alert("Failed to finalize results: " + err.message);
    }
}

// --- PATIENT SEARCH & MANUAL ENTRY ---
async function loadPatients() {
    const list = document.getElementById('patientList');
    list.innerHTML = `<div class="p-8 text-center text-slate-400"><i data-feather="loader" class="animate-spin w-6 h-6 mx-auto mb-2 opacity-50"></i></div>`;
    if (window.feather) feather.replace();

    const { data, error } = await supabaseClient
        .from('patients')
        .select('*')
        .order('full_name', { ascending: true });

    if (error) {
        list.innerHTML = `<div class="text-red-500 text-xs p-4 font-bold">Protocol fail: Database unreachable</div>`;
        return;
    }

    allPatients = data || [];
    renderPatientList();
}

function renderPatientList(query = '') {
    const list = document.getElementById('patientList');
    list.innerHTML = '';

    const term = query.toLowerCase().trim();
    const filtered = allPatients.filter(p =>
        p.full_name.toLowerCase().includes(term) ||
        (p.mrn && p.mrn.toLowerCase().includes(term))
    );

    if (filtered.length === 0) {
        list.innerHTML = `<div class="p-8 text-center text-slate-400 text-xs font-bold">No clinical record matches.</div>`;
        return;
    }

    filtered.forEach(p => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-4 bg-white border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/50 rounded-2xl cursor-pointer transition-all mb-2 animate-fade-in";
        div.onclick = () => selectPatient(p);
        div.innerHTML = `
            <div>
                <p class="text-sm font-black text-slate-800">${p.full_name}</p>
                <div class="flex gap-2 text-[9px] uppercase font-black text-slate-400 mt-1">
                    <span class="bg-white/80 px-2 py-0.5 rounded-lg shadow-sm border border-slate-100">MRN: ${p.mrn || 'N/A'}</span>
                    <span class="bg-white/80 px-2 py-0.5 rounded-lg shadow-sm border border-slate-100 text-indigo-500">${calculateAge(p.dob)}Y</span>
                </div>
            </div>
            <i data-feather="chevron-right" class="w-4 h-4 text-slate-300"></i>
        `;
        list.appendChild(div);
    });
    if (window.feather) feather.replace();
}

function calculateAge(dobStr) {
    if (!dobStr) return '--';
    const dob = new Date(dobStr);
    const diff = Date.now() - dob.getTime();
    return Math.abs(new Date(diff).getUTCFullYear() - 1970);
}

function selectPatient(patient) {
    currentPatientId = patient.id;

    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('labEntryCard').classList.remove('hidden');

    document.getElementById('entryPtName').textContent = patient.full_name;
    document.getElementById('entryPtDetails').textContent = `MRN: ${patient.mrn || 'Unknown'} | Age: ${calculateAge(patient.dob)} | Gender: ${patient.gender || 'Unknown'}`;

    resetLabForm();
    loadRecentLabs(patient.id);
}

function updateTestOptions() {
    const catEl = document.getElementById('testCategory');
    const nameEl = document.getElementById('testName');
    const cat = catEl.value;

    nameEl.innerHTML = '<option value="">-- Choose Technical Test --</option>';

    if (!cat || !LOINC_DB[cat]) {
        nameEl.disabled = true;
        return;
    }

    nameEl.disabled = false;
    LOINC_DB[cat].forEach(test => {
        const opt = document.createElement('option');
        opt.value = test.name;
        opt.dataset.loinc = test.code;
        opt.textContent = `${test.name} (LOINC: ${test.code})`;
        nameEl.appendChild(opt);
    });
}

function resetLabForm() {
    document.getElementById('testCategory').value = '';
    document.getElementById('testName').innerHTML = '<option value="">-- Choose Category First --</option>';
    document.getElementById('testName').disabled = true;
    document.getElementById('testResult').value = '';
    document.getElementById('testUnits').value = '';
}

async function submitLabResult() {
    if (!currentPatientId) return alert("Select a patient.");

    const catEl = document.getElementById('testCategory');
    const nameEl = document.getElementById('testName');
    const resEl = document.getElementById('testResult');
    const unitsEl = document.getElementById('testUnits');
    const btn = document.getElementById('submitLabBtn');

    if (!catEl.value || !nameEl.value || !resEl.value) {
        return alert("Validation fail: Category, test, and magnitude required.");
    }

    const selectedOption = nameEl.options[nameEl.selectedIndex];
    const loincCode = selectedOption.dataset.loinc || null;
    let finalValue = resEl.value.trim();
    if (unitsEl.value.trim()) {
        finalValue += ` ${unitsEl.value.trim()}`;
    }

    btn.innerHTML = '<i data-feather="loader" class="animate-spin w-4 h-4"></i> Publishing...';
    btn.disabled = true;
    if (window.feather) feather.replace();

    try {
        const payload = {
            patient_id: currentPatientId,
            test_category: catEl.value,
            test_name: nameEl.value,
            result_value: finalValue,
            loinc_code: loincCode,
            status: 'final'
        };

        const { error } = await supabaseClient.from('lab_results').insert([payload]);
        if (error) throw error;

        alert(`Clinical record finalized. LOINC: ${loincCode || 'N/A'}`);
        resetLabForm();
        loadRecentLabs(currentPatientId);
    } catch (err) {
        console.error(err);
        alert("Fatal Error: Laboratory system ledger unreachable.");
    } finally {
        btn.innerHTML = '<i data-feather="save" class="w-4 h-4"></i> Finalize & Publish';
        btn.disabled = false;
        if (window.feather) feather.replace();
    }
}

async function loadRecentLabs(patientId) {
    const container = document.getElementById('recentLabsContainer');
    container.innerHTML = '<p class="text-xs text-slate-400 italic px-4">Recalling records...</p>';

    const { data, error } = await supabaseClient
        .from('lab_results')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(5);

    if (error || !data) {
        container.innerHTML = '<p class="text-xs text-red-400 px-4 font-bold">History retrieval failed.</p>';
        return;
    }

    if (data.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-400 p-8 border-2 border-dashed border-slate-100 bg-white rounded-2xl text-center italic">No prior laboratory transactions recorded for this patient.</p>';
        return;
    }

    container.innerHTML = '';
    data.forEach(l => {
        const date = new Date(l.created_at).toLocaleDateString([], { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-indigo-100 transition-all";
        div.innerHTML = `
            <div>
                <p class="text-xs font-black text-slate-700">${l.test_name} <span class="bg-indigo-50 text-indigo-600 text-[9px] px-1.5 py-0.5 rounded ml-2 tracking-widest font-mono">LOINC: ${l.loinc_code || 'N/A'}</span></p>
                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">${l.test_category} &bull; ${date}</p>
            </div>
            <div class="text-right">
                <p class="text-sm font-black text-indigo-600">${l.result_value || 'PENDING'}</p>
                <p class="text-[9px] font-black ${l.status === 'final' ? 'text-emerald-500' : 'text-orange-500'} uppercase tracking-widest">${l.status}</p>
            </div>
        `;
        container.appendChild(div);
    });
}

// --- INVENTORY LOGIC ---
async function loadInventory() {
    const list = document.getElementById('inventoryList');
    list.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400"><i data-feather="loader" class="animate-spin w-6 h-6 mx-auto mb-2 opacity-30"></i></td></tr>`;
    if (window.feather) feather.replace();

    const { data, error } = await supabaseClient
        .from('lab_inventory')
        .select('*')
        .order('item_name', { ascending: true });

    if (error) {
        console.error("Inventory Load Error:", error);
        list.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-400 font-bold">Technical inventory ledger failure.</td></tr>`;
        return;
    }

    inventoryItems = data || [];
    document.getElementById('invTotalSKUs').textContent = inventoryItems.length;
    document.getElementById('invLowStock').textContent = inventoryItems.filter(i => i.stock_level <= i.min_threshold).length;

    list.innerHTML = '';
    inventoryItems.forEach(item => {
        const statusClass = item.stock_level <= item.min_threshold ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700';
        const row = document.createElement('tr');
        row.className = "hover:bg-slate-50 transition-colors";
        row.innerHTML = `
            <td class="px-6 py-4">
                <p class="text-sm font-black text-slate-800">${item.item_name}</p>
                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">${item.unit}</p>
            </td>
            <td class="px-6 py-4">
                <span class="text-[10px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded uppercase tracking-tighter">${item.category}</span>
            </td>
            <td class="px-6 py-4">
                <span class="px-3 py-1 rounded-full text-xs font-black ${statusClass}">${item.stock_level}</span>
            </td>
            <td class="px-6 py-4 text-xs font-bold text-slate-400">${item.min_threshold}</td>
            <td class="px-6 py-4">
                <div class="flex gap-2">
                    <button onclick="editInventoryItem('${item.id}')" class="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><i data-feather="edit-2" class="w-4 h-4"></i></button>
                    <button onclick="deleteInventoryItem('${item.id}')" class="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"><i data-feather="trash-2" class="w-4 h-4"></i></button>
                </div>
            </td>
        `;
        list.appendChild(row);
    });
    if (window.feather) feather.replace();
}

function openInventoryModal() {
    document.getElementById('inventoryModal').classList.remove('hidden');
    if (window.feather) feather.replace();
}

function closeInventoryModal() {
    document.getElementById('inventoryModal').classList.add('hidden');
}

async function saveInventoryItem() {
    const name = document.getElementById('invItemName').value.trim();
    const cat = document.getElementById('invCategory').value;
    const unit = document.getElementById('invUnit').value.trim();
    const stock = parseInt(document.getElementById('invStock').value);
    const threshold = parseInt(document.getElementById('invThreshold').value);

    if (!name || !unit) return alert("Item name and unit are mandatory.");

    const payload = {
        item_name: name,
        category: cat,
        unit: unit,
        stock_level: stock,
        min_threshold: threshold
    };

    const { error } = await supabaseClient.from('lab_inventory').insert([payload]);

    if (error) {
        alert("Ledger commit failed.");
    } else {
        alert("Item added to inventory.");
        closeInventoryModal();
        loadInventory();
        // Clear form
        document.getElementById('invItemName').value = '';
        document.getElementById('invUnit').value = '';
        document.getElementById('invStock').value = 0;
    }
}

async function deleteInventoryItem(id) {
    if (!confirm("Are you sure? This item will be purged from the clinical inventory.")) return;
    const { error } = await supabaseClient.from('lab_inventory').delete().eq('id', id);
    if (error) alert("Purge failed.");
    else loadInventory();
}

// --- HISTORY LOGIC ---
async function loadFullHistory() {
    const container = document.getElementById('fullHistoryContainer');
    container.innerHTML = '<p class="p-10 text-center text-slate-400 text-sm">Loading whole system ledger...</p>';

    const { data, error } = await supabaseClient
        .from('lab_results')
        .select('*, patients(full_name, mrn)')
        .eq('status', 'final')
        .order('created_at', { ascending: false });

    if (error) {
        container.innerHTML = '<p class="p-10 text-center text-red-400 font-bold">Ledger access denied.</p>';
        return;
    }

    container.innerHTML = '';
    data.forEach(l => {
        const date = new Date(l.created_at).toLocaleDateString();
        const div = document.createElement('div');
        div.className = "bg-white p-6 rounded-3xl border border-slate-200 shadow-sm animate-fade-in";
        div.innerHTML = `
            <div class="flex justify-between items-start mb-4">
               <div>
                  <h4 class="font-black text-slate-800">${l.patients.full_name}</h4>
                  <p class="text-[10px] text-indigo-600 font-bold tracking-widest">MRN: ${l.patients.mrn}</p>
               </div>
               <span class="text-[9px] font-bold text-slate-400">${date}</span>
            </div>
            <div class="space-y-2">
                <div class="flex justify-between">
                    <span class="text-[10px] text-slate-400 font-black uppercase tracking-widest">${l.test_name}</span>
                    <span class="text-sm font-black text-indigo-600">${l.result_value}</span>
                </div>
                <div class="text-[9px] font-mono text-slate-300 bg-slate-50 px-2 py-0.5 rounded-lg inline-block">LOINC: ${l.loinc_code || '---'}</div>
            </div>
        `;
        container.appendChild(div);
    });
}
