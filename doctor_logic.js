// --- CONFIGURATION ---
const API_BASE = "https://smart-his-backend.onrender.com"; 

// GLOBAL STATE
const DOCTOR_ID = localStorage.getItem('smart_his_user_id');
const DOCTOR_NAME = localStorage.getItem('smart_his_name');
let currentApptId = null;
let currentPatientId = null;
let currentDrugsList = [];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    const docNameEl = document.getElementById('doc-name-display');
    if (docNameEl && DOCTOR_NAME) docNameEl.textContent = DOCTOR_NAME;
    if(document.getElementById('current-time')) startClock();

    if (document.getElementById('queue-container')) {
        initAppointmentsPage();
    } else if (document.getElementById('mainContent')) {
        initEMRPage();
    }
});

function startClock() {
    const timeEl = document.getElementById('current-time');
    function update() {
        const now = new Date();
        timeEl.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    update();
    setInterval(update, 1000);
}

// ==========================================
// EMR PAGE LOGIC
// ==========================================

async function initEMRPage() {
    const urlParams = new URLSearchParams(window.location.search);
    currentApptId = urlParams.get('id');
    if (!currentApptId) return alert("No Appointment ID.");

    setupEMRInteractions();

    try {
        const res = await fetch(`${API_BASE}/doctor/appointment/${currentApptId}`);
        if(!res.ok) throw new Error("Load failed");
        
        const data = await res.json();
        const p = data.patients || {};
        const t = (data.triage_notes && data.triage_notes.length) ? data.triage_notes[0] : {};
        
        currentPatientId = p.id;

        // Info Card
        safeSetText('pt-name', p.full_name || 'Unknown');
        safeSetText('pt-details', `${calculateAge(p.dob)} years old | ${p.gender || 'Unknown'}`);
        safeSetText('pt-id', p.mrn || 'N/A');
        
        // Vitals (Pre-fill for reference)
        safeSetValue('weight', t.weight_kg);
        safeSetValue('height', t.height_cm);
        safeSetValue('systolic', t.systolic);
        safeSetValue('diastolic', t.diastolic);
        safeSetValue('temperature', t.temperature);
        calculateBMI(); 

        // Nurse Notes
        safeSetText('nurse-notes-text', t.chief_complaint || "No notes recorded.");

        // Load History
        loadHistoryPanel(p.id);

    } catch (err) {
        console.error(err);
        alert("Failed to load patient data.");
    }
}

function setupEMRInteractions() {
    // Toggles
    window.switchView = function(viewName) {
        ['nurseView', 'doctorView', 'summaryView'].forEach(id => document.getElementById(id).classList.add('hidden-view'));
        document.querySelectorAll('.view-toggle-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(viewName + 'View').classList.remove('hidden-view');
        
        if(viewName === 'summary') updateSummary();
        
        // Button State Logic (Simple mapping)
        const btnMap = { 'nurse': 0, 'doctor': 1, 'summary': 2 };
        document.querySelectorAll('.view-toggle-btn')[btnMap[viewName]].classList.add('active');
    };

    // Right Panel
    const rightPanel = document.getElementById('rightPanel');
    const togglePanel = (type) => {
        const isClosed = rightPanel.classList.contains('translate-x-full');
        if(isClosed) rightPanel.classList.remove('translate-x-full');
        else if (rightPanel.dataset.type === type) rightPanel.classList.add('translate-x-full');
        
        rightPanel.dataset.type = type;
        document.getElementById('labContent').classList.add('hidden');
        document.getElementById('historyContent').classList.add('hidden');
        
        if(type === 'lab') {
            document.getElementById('labContent').classList.remove('hidden');
            document.getElementById('rightPanelTitle').textContent = "Recent Lab Results";
        } else {
            document.getElementById('historyContent').classList.remove('hidden');
            document.getElementById('rightPanelTitle').textContent = "Past Medical History";
        }
    };

    document.getElementById('sidebarLabBtn').onclick = () => togglePanel('lab');
    document.getElementById('sidebarHistoryBtn').onclick = () => togglePanel('history');
    document.getElementById('closeRightPanel').onclick = () => rightPanel.classList.add('translate-x-full');

    // Prescription Add
    document.getElementById('addPrescription').onclick = () => {
        const name = document.getElementById('drugName').value;
        const dose = document.getElementById('dosage').value;
        const freq = document.getElementById('schedule').value;
        if(!name) return;
        currentDrugsList.push({ name, dosage: dose, frequency: freq });
        renderPrescriptions();
        document.getElementById('drugName').value = '';
        document.getElementById('dosage').value = '';
        document.getElementById('schedule').value = '';
    };

    // Submit
    document.getElementById('submitEMRBtn').onclick = submitConsultation;
}

function renderPrescriptions() {
    const list = document.getElementById('prescriptionList');
    list.innerHTML = '';
    currentDrugsList.forEach((d, idx) => {
        const div = document.createElement('div');
        div.className = 'px-4 py-3 flex justify-between items-center border-b border-gray-100 last:border-0';
        div.innerHTML = `
            <div><p class="font-bold text-gray-800 text-sm">${d.name}</p><p class="text-xs text-gray-500">${d.dosage} • ${d.frequency}</p></div>
            <button onclick="removeDrug(${idx})" class="text-red-500 hover:text-red-700"><i data-feather="trash-2" class="w-4 h-4"></i></button>
        `;
        list.appendChild(div);
    });
    feather.replace();
}

window.removeDrug = (idx) => {
    currentDrugsList.splice(idx, 1);
    renderPrescriptions();
}

async function loadHistoryPanel(patientId) {
    const container = document.getElementById('historyContent');
    try {
        const res = await fetch(`${API_BASE}/patient/history?patient_id=${patientId}`);
        const history = await res.json();
        container.innerHTML = '';
        history.forEach(h => {
            const date = new Date(h.created_at).toLocaleDateString();
            const div = document.createElement('div');
            div.className = "p-4 bg-gray-50 border border-gray-200 rounded-lg mb-3";
            div.innerHTML = `
                <div class="flex justify-between mb-1"><span class="text-sm font-bold text-blue-700">${date}</span></div>
                <h4 class="font-semibold text-gray-800 text-sm">${h.assessment || 'No Diagnosis'}</h4>
            `;
            container.appendChild(div);
        });
    } catch(e) {}
}

function updateSummary() {
    safeSetText('summaryCC', document.getElementById('chiefComplaintInput').value);
    safeSetText('summaryHistory', document.getElementById('historyInput').value);
    safeSetText('summaryBP', `${document.getElementById('systolic').value}/${document.getElementById('diastolic').value}`);
    safeSetText('summaryDiagnosis', document.getElementById('primaryDiagnosisInput').value);
    safeSetText('summaryInstructions', document.getElementById('therapyInput').value);
}

async function submitConsultation() {
    if(!confirm("Finalize EMR?")) return;
    const btn = document.getElementById('submitEMRBtn');
    btn.textContent = "Processing...";
    btn.disabled = true;

    // Use specific fields from the new UI
    const payload = {
        doctor_id: DOCTOR_ID,
        appointment_id: currentApptId,
        chief_complaint: getVal('chiefComplaintInput'),
        history_illness: getVal('historyInput'),
        primary_diagnosis: getVal('primaryDiagnosisInput'),
        icd10_code: getVal('primaryICDInput'),
        clinical_notes: getVal('analysisNotesInput'),
        therapy_instructions: getVal('therapyInput'),
        prescription_items: currentDrugsList
    };

    try {
        const res = await fetch(`${API_BASE}/doctor/submit-consultation`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        if(!res.ok) throw new Error("Error");
        alert("Consultation Saved!");
        window.location.href = "APPOINTMENTS.html";
    } catch(e) {
        alert("Submit failed: " + e.message);
        btn.textContent = "Finalize & Submit";
        btn.disabled = false;
    }
}

// --- QUEUE LOGIC (Retained) ---
async function initAppointmentsPage() {
    const container = document.getElementById('queue-container');
    const heroCard = document.getElementById('active-patient-card');
    const emptyState = document.getElementById('empty-state');
    if (!container) return;

    try {
        const res = await fetch(`${API_BASE}/doctor/queue?doctor_id=${DOCTOR_ID}`);
        const appointments = await res.json();
        
        safeSetText('stat-total', appointments.length);
        safeSetText('stat-waiting', Math.max(0, appointments.length - 1));
        
        container.innerHTML = ''; 

        if (appointments.length === 0) {
            if(heroCard) heroCard.classList.add('hidden');
            if(emptyState) emptyState.classList.remove('hidden');
            safeSetText('stat-now-serving', "--");
            return;
        }

        if(emptyState) emptyState.classList.add('hidden');

        // Hero Card
        if (heroCard) {
            const activeAppt = appointments[0];
            let activeP = activeAppt.patients || { full_name: "Unknown", mrn: "N/A" };
            let activeT = (activeAppt.triage_notes && activeAppt.triage_notes.length > 0) ? activeAppt.triage_notes[0] : {};

            heroCard.classList.remove('hidden');
            safeSetText('stat-now-serving', `A-${activeAppt.queue_number}`);
            safeSetText('active-queue-no', `A-${activeAppt.queue_number}`);
            safeSetText('active-name', activeP.full_name);
            safeSetText('active-details', `MRN: ${activeP.mrn || 'N/A'} • ${calculateAge(activeP.dob)} yrs • ${activeP.gender || '--'}`);
            safeSetText('active-triage', `BP: ${activeT.systolic || '--'}/${activeT.diastolic || '--'}`);
            
            const heroBtn = document.getElementById('open-active-emr-btn');
            if(heroBtn) heroBtn.onclick = () => window.location.href = `EMR.html?id=${activeAppt.id}`;
        }

        // Queue List
        const waitingList = appointments.slice(1);
        if (waitingList.length === 0) {
            container.innerHTML = `<div class="text-center text-sm text-gray-400 py-4">No other patients waiting.</div>`;
        } else {
            waitingList.forEach(appt => {
                let p = appt.patients || {full_name: 'Unknown'};
                const div = document.createElement('div');
                div.className = "queue-card bg-white p-4 rounded-xl border border-slate-200 cursor-pointer mb-2";
                div.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600">${appt.queue_number}</div>
                            <div>
                                <h4 class="font-bold text-sm text-slate-800">${p.full_name}</h4>
                                <p class="text-xs text-slate-500">${calculateAge(p.dob)} yrs</p>
                            </div>
                        </div>
                        <span class="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">Waiting</span>
                    </div>`;
                div.onclick = () => window.location.href = `EMR.html?id=${appt.id}`;
                container.appendChild(div);
            });
        }
    } catch(e) {}
}

// --- HELPERS ---
function safeSetText(id, val) { const el = document.getElementById(id); if(el) el.textContent = val || '--'; }
function safeSetValue(id, val) { const el = document.getElementById(id); if(el && val) el.value = val; }
function getVal(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function calculateBMI() {
    const w = parseFloat(document.getElementById('weight').value);
    const h = parseFloat(document.getElementById('height').value) / 100;
    if(w && h) document.getElementById('bmi').textContent = (w/(h*h)).toFixed(1);
}
function calculateAge(dob) { if(!dob) return '--'; return Math.floor((new Date() - new Date(dob))/31557600000); }
