// --- CONFIGURATION ---
// Change to "http://127.0.0.1:8000" if testing locally
const API_BASE = "https://smart-his-backend.onrender.com"; 

// GLOBAL STATE
const DOCTOR_ID = localStorage.getItem('smart_his_user_id');
const DOCTOR_NAME = localStorage.getItem('smart_his_name');
let currentDrugsList = []; // Stores prescriptions temporarily for EMR page
let currentPatientId = null;
let currentApptId = null;

// --- PAGE ROUTER ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Update UI Name
    const docNameEl = document.getElementById('doc-name-display');
    if (docNameEl && DOCTOR_NAME) {
        docNameEl.textContent = DOCTOR_NAME;
    }

    // 2. Start Clock
    startClock();

    // 3. Route based on which page elements exist
    if (document.getElementById('queue-container')) {
        initAppointmentsPage();
    } else if (document.getElementById('soap-subjective')) {
        initEMRPage();
    }
});

function startClock() {
    const timeEl = document.getElementById('current-time');
    if (!timeEl) return;
    function update() {
        const now = new Date();
        timeEl.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    update();
    setInterval(update, 1000);
}

// ==========================================
// 1. APPOINTMENTS DASHBOARD LOGIC
// ==========================================

async function initAppointmentsPage() {
    const container = document.getElementById('queue-container');
    const heroCard = document.getElementById('active-patient-card');
    const emptyState = document.getElementById('empty-state');
    
    if (!container) return;

    try {
        console.log(`Fetching Queue for Doctor: ${DOCTOR_ID}`);
        const res = await fetch(`${API_BASE}/doctor/queue?doctor_id=${DOCTOR_ID}`);
        
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        
        const appointments = await res.json();
        console.log("Appointments fetched:", appointments);
        
        // --- 1. SAFELY UPDATE STATS ---
        safeSetText('stat-total', appointments.length);
        safeSetText('stat-waiting', Math.max(0, appointments.length - 1));
        
        // --- 2. CLEAR LOADING STATE ---
        container.innerHTML = ''; 

        if (appointments.length === 0) {
            if(heroCard) heroCard.classList.add('hidden');
            if(emptyState) emptyState.classList.remove('hidden');
            safeSetText('stat-now-serving', "--");
            return;
        }

        if(emptyState) emptyState.classList.add('hidden');

        // --- 3. RENDER HERO CARD (FIRST IN LINE) ---
        if (heroCard) {
            const activeAppt = appointments[0];
            
            // Handle Supabase Array/Object quirk for joined data
            let activeP = activeAppt.patients;
            if (Array.isArray(activeP)) activeP = activeP[0];
            if (!activeP) activeP = { full_name: "Unknown", mrn: "N/A" };

            let activeT = activeAppt.triage_notes;
            if (Array.isArray(activeT)) activeT = activeT[0];
            if (!activeT) activeT = {};

            heroCard.classList.remove('hidden');
            safeSetText('stat-now-serving', `A-${activeAppt.queue_number}`);
            safeSetText('active-queue-no', `A-${activeAppt.queue_number}`);
            safeSetText('active-name', activeP.full_name);
            safeSetText('active-details', `MRN: ${activeP.mrn || 'N/A'} • ${calculateAge(activeP.dob)} yrs • ${activeP.gender || '--'}`);
            safeSetText('active-triage', `BP: ${activeT.systolic || '--'}/${activeT.diastolic || '--'}`);
            
            // Bind Button
            const heroBtn = document.getElementById('open-active-emr-btn');
            if(heroBtn) heroBtn.onclick = () => openEMR(activeAppt.id, activeP.full_name);
        }

        // --- 4. RENDER QUEUE LIST (REMAINING ITEMS) ---
        const waitingList = appointments.slice(1);
        
        if (waitingList.length === 0) {
            container.innerHTML = `<div class="text-center text-sm text-gray-400 py-4">No other patients waiting.</div>`;
        } else {
            waitingList.forEach(appt => {
                let p = appt.patients;
                if (Array.isArray(p)) p = p[0];
                if (!p) p = { full_name: "Unknown", mrn: "?" };
                
                const row = document.createElement('div');
                row.className = "queue-card bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between group cursor-pointer hover:border-blue-300 transition-all";
                row.onclick = () => openEMR(appt.id, p.full_name);

                row.innerHTML = `
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                            ${appt.queue_number}
                        </div>
                        <div>
                            <h4 class="font-semibold text-slate-800">${p.full_name}</h4>
                            <p class="text-xs text-slate-500">${calculateAge(p.dob)} yrs • ${p.gender || 'Unknown'}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="block text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">Waiting</span>
                    </div>
                `;
                container.appendChild(row);
            });
        }

        if (window.feather) feather.replace();

    } catch (err) {
        console.error("Queue Error:", err);
        container.innerHTML = `<div class="text-red-500 text-sm p-4 bg-red-50 rounded-lg">Error: ${err.message}</div>`;
    }
}

// ==========================================
// 2. EMR & CONSULTATION LOGIC
// ==========================================

async function initEMRPage() {
    console.log("Initializing EMR...");
    
    // 1. Get Appointment ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    currentApptId = urlParams.get('id');

    if (!currentApptId) {
        alert("No Appointment ID provided!");
        window.location.href = 'APPOINTMENTS.html';
        return;
    }

    // 2. Fetch Data (Patient Info + Triage)
    try {
        const res = await fetch(`${API_BASE}/doctor/appointment/${currentApptId}`);
        if (!res.ok) throw new Error("Failed to load appointment");
        
        const appt = await res.json();
        
        // Handle Supabase Array/Object quirks
        let p = appt.patients;
        if (Array.isArray(p)) p = p[0];
        
        let t = appt.triage_notes;
        if (Array.isArray(t)) t = t.length > 0 ? t[0] : {};
        else if (!t) t = {};
        
        currentPatientId = p.id;

        // 3. Populate Header Info
        safeSetText('emr-patient-name', p.full_name);
        safeSetText('emr-patient-mrn', `MRN: ${p.mrn || 'N/A'}`);
        safeSetText('emr-patient-age', `${calculateAge(p.dob)} yrs`);
        safeSetText('emr-patient-gender', p.gender || '--');
        
        // 4. Populate Triage Bar
        safeSetText('triage-bp', `${t.systolic || '--'}/${t.diastolic || '--'}`);
        safeSetText('triage-hr', `${t.heart_rate || '--'}`);
        safeSetText('triage-temp', `${t.temperature || '--'}°C`);
        safeSetText('triage-weight', `${t.weight_kg || '--'} kg`);
        safeSetText('triage-notes', t.chief_complaint || "No complaints recorded.");

        // 5. Load History
        loadPatientHistory(p.id);

    } catch (err) {
        console.error("EMR Load Error:", err);
        alert("Error loading patient data.");
    }

    // 6. Setup Prescription UI
    const addDrugBtn = document.getElementById('add-rx-btn');
    if (addDrugBtn) {
        addDrugBtn.addEventListener('click', addPrescriptionToUI);
    }

    // 7. Setup Submit
    const submitBtn = document.getElementById('submit-consultation-btn');
    if (submitBtn) {
        submitBtn.addEventListener('click', submitConsultation);
    }
}

async function loadPatientHistory(patientId) {
    const container = document.getElementById('patient-history-list');
    if (!container) return;

    try {
        const res = await fetch(`${API_BASE}/patient/history?patient_id=${patientId}`);
        const history = await res.json();

        container.innerHTML = '';
        if (history.length === 0) {
            container.innerHTML = `<div class="text-xs text-gray-400 text-center py-4">No past history.</div>`;
            return;
        }

        history.forEach(rec => {
            const dateStr = new Date(rec.created_at).toLocaleDateString();
            const diagnosis = rec.assessment || "No Diagnosis";
            
            const div = document.createElement('div');
            div.className = "p-3 bg-gray-50 rounded-lg border border-gray-100 text-sm";
            div.innerHTML = `
                <div class="flex justify-between font-bold text-gray-700">
                    <span>${dateStr}</span>
                    <span class="text-blue-600 cursor-pointer hover:underline">View</span>
                </div>
                <p class="text-gray-600 mt-1 line-clamp-2">${diagnosis}</p>
            `;
            container.appendChild(div);
        });

    } catch (e) {
        console.error("History Error", e);
    }
}

function addPrescriptionToUI() {
    const nameInput = document.getElementById('rx-name');
    const dosageInput = document.getElementById('rx-dosage');
    const freqInput = document.getElementById('rx-freq');
    const list = document.getElementById('rx-list');

    if (!nameInput.value) return alert("Enter drug name");

    const drug = {
        name: nameInput.value,
        dosage: dosageInput.value,
        frequency: freqInput.value
    };

    currentDrugsList.push(drug);

    // Add to Visual List
    const row = document.createElement('div');
    row.className = "flex justify-between items-center p-3 bg-white border border-gray-200 rounded-lg shadow-sm mb-2";
    row.innerHTML = `
        <div>
            <p class="font-bold text-gray-800 text-sm">${drug.name}</p>
            <p class="text-xs text-gray-500">${drug.dosage} • ${drug.frequency}</p>
        </div>
        <button class="text-red-500 hover:text-red-700 text-xs font-bold" onclick="removeDrug(this, '${drug.name}')">Remove</button>
    `;
    list.appendChild(row);

    // Clear Inputs
    nameInput.value = '';
    dosageInput.value = '';
}

// Expose to window for inline onclick
window.removeDrug = function(btn, name) {
    btn.closest('div').remove();
    currentDrugsList = currentDrugsList.filter(d => d.name !== name);
}

async function submitConsultation() {
    if (!confirm("Submit Consultation? This cannot be undone.")) return;

    const btn = document.getElementById('submit-consultation-btn');
    btn.disabled = true;
    btn.textContent = "Processing...";

    const payload = {
        doctor_id: DOCTOR_ID,
        appointment_id: currentApptId,
        subjective: document.getElementById('soap-subjective').value,
        objective: document.getElementById('soap-objective').value,
        assessment: document.getElementById('soap-assessment').value,
        plan: document.getElementById('soap-plan').value,
        prescription_items: currentDrugsList
    };

    try {
        const res = await fetch(`${API_BASE}/doctor/submit-consultation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error("Submission failed");

        alert("Consultation Completed Successfully!");
        window.location.href = "APPOINTMENTS.html";

    } catch (err) {
        alert("Error: " + err.message);
        btn.disabled = false;
        btn.textContent = "Complete & Sign";
    }
}

// --- HELPER FUNCTIONS ---

function safeSetText(elementId, text) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = text;
}

function openEMR(apptId, patientName) {
    window.location.href = `EMR.html?id=${apptId}&patient=${encodeURIComponent(patientName)}`;
}

function calculateAge(dobStr) {
    if (!dobStr) return '--';
    const dob = new Date(dobStr);
    const diff_ms = Date.now() - dob.getTime();
    const age_dt = new Date(diff_ms); 
    return Math.abs(age_dt.getUTCFullYear() - 1970);
}

function getInitials(name) {
    return name ? name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase() : '??';
}

function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function getStatusColor(status) {
    switch(status) {
        case 'scheduled': return 'bg-blue-50 text-blue-600';
        case 'checked_in': return 'bg-yellow-50 text-yellow-600';
        case 'triage': return 'bg-purple-50 text-purple-600';
        case 'consultation': return 'bg-green-50 text-green-600';
        default: return 'bg-gray-50 text-gray-500';
    }
}
