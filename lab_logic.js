// --- CONFIGURATION ---
const SUPABASE_URL = 'https://crywwqleinnwoacithmw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyeXd3cWxlaW5ud29hY2l0aG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MDg4MTIsImV4cCI6MjA4Mzk4NDgxMn0.VTDI6ZQ_aN895A29_v0F1vHzqaS-RG7iGzOFM6qMKfk';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// LOINC Database Mapping for International Standard Compliance
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
    if (n) n.textContent = `Lab Tech: ${name}`;
}

// Init
window.onload = () => {
    checkAuth();
    if (window.feather) feather.replace();
    loadPatients();

    // Search bar event
    const s = document.getElementById('patientSearch');
    if (s) {
        s.addEventListener('input', (e) => {
            renderPatientList(e.target.value);
        });
    }
};

function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

async function loadPatients() {
    const list = document.getElementById('patientList');
    list.innerHTML = `<div class="p-8 text-center"><i data-feather="loader" class="animate-spin w-6 h-6 mx-auto text-indigo-500"></i></div>`;
    if (window.feather) feather.replace();

    const { data, error } = await supabaseClient
        .from('patients')
        .select('*')
        .order('full_name', { ascending: true });

    if (error) {
        list.innerHTML = `<div class="text-red-500 text-sm p-4">Error loading patients</div>`;
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
        list.innerHTML = `<div class="p-8 text-center text-slate-400 text-sm">No patients found.</div>`;
        return;
    }

    filtered.forEach(p => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-3 border border-transparent hover:border-indigo-100 hover:bg-indigo-50 rounded-xl cursor-pointer transition-colors";
        div.onclick = () => selectPatient(p);
        div.innerHTML = `
            <div>
                <p class="text-sm font-bold text-slate-800">${p.full_name}</p>
                <div class="flex gap-2 text-[10px] uppercase font-bold text-slate-400 mt-1">
                    <span class="bg-white px-2 py-0.5 rounded shadow-sm border border-slate-200">MRN: ${p.mrn || 'N/A'}</span>
                    <span class="bg-white px-2 py-0.5 rounded shadow-sm border border-slate-200">${calculateAge(p.dob)}y</span>
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

    nameEl.innerHTML = '<option value="">-- Select Specific Test --</option>';

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
    document.getElementById('testName').innerHTML = '<option value="">-- Select Category First --</option>';
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
        return alert("Please fill in category, test name, and result value.");
    }

    const selectedOption = nameEl.options[nameEl.selectedIndex];
    const loincCode = selectedOption.dataset.loinc || null;
    let finalValue = resEl.value.trim();
    if (unitsEl.value.trim()) {
        finalValue += ` ${unitsEl.value.trim()}`;
    }

    btn.innerHTML = '<i data-feather="loader" class="animate-spin w-4 h-4"></i> Saving...';
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

        alert(`Successfully saved lab result with LOINC code: ${loincCode || 'None'}`);
        resetLabForm();
        loadRecentLabs(currentPatientId);
    } catch (err) {
        console.error(err);
        alert("Failed to save lab result.");
    } finally {
        btn.innerHTML = '<i data-feather="save" class="w-4 h-4"></i> Save Record (LOINC)';
        btn.disabled = false;
        if (window.feather) feather.replace();
    }
}

async function loadRecentLabs(patientId) {
    const container = document.getElementById('recentLabsContainer');
    container.innerHTML = '<p class="text-xs text-slate-400">Loading...</p>';

    const { data, error } = await supabaseClient
        .from('lab_results')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(5);

    if (error || !data) {
        container.innerHTML = '<p class="text-xs text-red-400">Error loading recent labs.</p>';
        return;
    }

    if (data.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-400 p-4 border border-dashed rounded-lg text-center">No recent labs for this patient.</p>';
        return;
    }

    container.innerHTML = '';
    data.forEach(l => {
        const date = new Date(l.created_at).toLocaleDateString([], { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-3 bg-white border border-slate-200 rounded-lg shadow-sm";
        div.innerHTML = `
            <div>
                <p class="text-xs font-bold text-slate-700">${l.test_name} <span class="bg-indigo-50 text-indigo-600 text-[9px] px-1 py-0.5 rounded ml-1 tracking-widest font-mono">LOINC: ${l.loinc_code || 'N/A'}</span></p>
                <p class="text-[10px] text-slate-400 mt-0.5">${l.test_category} &bull; ${date}</p>
            </div>
            <div class="text-right">
                <p class="text-sm font-black text-indigo-600">${l.result_value}</p>
                <p class="text-[9px] font-bold text-emerald-500 uppercase">${l.status}</p>
            </div>
        `;
        container.appendChild(div);
    });
}
