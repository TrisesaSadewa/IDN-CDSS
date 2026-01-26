// --- CONFIGURATION ---
const API_BASE = "https://smart-his-backend.onrender.com"; 

// GLOBAL STATE
const DOCTOR_ID = localStorage.getItem('smart_his_user_id');
const DOCTOR_NAME = localStorage.getItem('smart_his_name');
let currentApptId = null;
let currentPatientId = null;
let currentDrugsList = [];
let secondaryDiagnoses = [];

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
    if(!timeEl) return;
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
    if (!currentApptId) return alert("No Appointment ID found.");

    setupEMRInteractions();

    try {
        const res = await fetch(`${API_BASE}/doctor/appointment/${currentApptId}`);
        if(!res.ok) throw new Error("Load failed");
        
        const data = await res.json();
        const p = data.patients || {};
        const t = (data.triage_notes && data.triage_notes.length) ? data.triage_notes[0] : {};
        
        currentPatientId = p.id;

        safeSetText('pt-name', p.full_name || 'Unknown');
        safeSetText('pt-details', `${calculateAge(p.dob)} years old | ${p.gender || 'Unknown'}`);
        safeSetText('pt-id', p.mrn || 'N/A');
        
        safeSetValue('weight', t.weight_kg);
        safeSetValue('height', t.height_cm);
        safeSetValue('systolic', t.systolic);
        safeSetValue('diastolic', t.diastolic);
        safeSetValue('temperature', t.temperature);
        calculateBMI(); 

        safeSetText('nurse-notes-text', t.chief_complaint || "No notes recorded.");
        safeSetText('pain-score', t.pain_score || '--');
        safeSetText('pain-location', t.pain_location || '--');
        
        loadHistoryPanel(p.id);

    } catch (err) {
        console.error(err);
        alert("Failed to load patient data.");
    }
}

function setupEMRInteractions() {
    // 1. DDI Check Button
    const checkDDIBtn = document.getElementById('btnCheckDDI');
    if(checkDDIBtn) checkDDIBtn.onclick = runDDICheck;

    // 2. View Toggles
    window.switchView = function(viewName) {
        ['nurseView', 'doctorView', 'summaryView'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.classList.add('hidden-view');
        });
        document.querySelectorAll('.view-toggle-btn').forEach(btn => btn.classList.remove('active'));
        
        const target = document.getElementById(viewName + 'View');
        if(target) target.classList.remove('hidden-view');
        
        if(viewName === 'summary') updateSummary();
        
        const btnMap = { 'nurse': 0, 'doctor': 1, 'summary': 2 };
        const buttons = document.querySelectorAll('.view-toggle-btn');
        if(buttons[btnMap[viewName]]) buttons[btnMap[viewName]].classList.add('active');
    };

    // 3. Right Panel Toggles
    const rightPanel = document.getElementById('rightPanel');
    const togglePanel = (type) => {
        if(!rightPanel) return;
        const isClosed = rightPanel.classList.contains('translate-x-full');
        if(isClosed) rightPanel.classList.remove('translate-x-full');
        else if (rightPanel.dataset.type === type) rightPanel.classList.add('translate-x-full');
        
        rightPanel.dataset.type = type;
        const labContent = document.getElementById('labContent');
        const historyContent = document.getElementById('historyContent');
        const title = document.getElementById('rightPanelTitle');

        if(labContent) labContent.classList.add('hidden');
        if(historyContent) historyContent.classList.add('hidden');
        
        if(type === 'lab' && labContent) {
            labContent.classList.remove('hidden');
            if(title) title.textContent = "Recent Lab Results";
        } else if (type === 'history' && historyContent) {
            historyContent.classList.remove('hidden');
            if(title) title.textContent = "Past Medical History";
        }
    };

    const labBtn = document.getElementById('sidebarLabBtn');
    if(labBtn) labBtn.onclick = () => togglePanel('lab');

    const histBtn = document.getElementById('sidebarHistoryBtn');
    if(histBtn) histBtn.onclick = () => togglePanel('history');

    const closeBtn = document.getElementById('closeRightPanel');
    if(closeBtn) closeBtn.onclick = () => rightPanel.classList.add('translate-x-full');

    // 4. Search & Tags
    setupAutocomplete('primaryICDInput', 'primaryICDSuggestions', (item) => {
        const codeInput = document.getElementById('primaryICDInput');
        const diagInput = document.getElementById('primaryDiagnosisInput');
        if(codeInput) codeInput.value = item.code;
        if(diagInput) diagInput.value = item.description;
    });

    setupAutocomplete('comorbidityInput', 'comorbiditySuggestions', (item) => {
        if (!secondaryDiagnoses.some(d => d.code === item.code)) {
            secondaryDiagnoses.push(item);
            renderComorbidities();
        }
        const input = document.getElementById('comorbidityInput');
        if(input) input.value = '';
    });

    const addComorbBtn = document.getElementById('addComorbidityBtn');
    if(addComorbBtn) {
        addComorbBtn.onclick = () => {
            const input = document.getElementById('comorbidityInput');
            const val = input ? input.value.trim() : '';
            if(val) {
                secondaryDiagnoses.push({ code: 'DX', description: val });
                renderComorbidities();
                input.value = '';
            }
        };
    }

    // 5. Prescriptions
    const addRxBtn = document.getElementById('addPrescription');
    if(addRxBtn) {
        addRxBtn.onclick = () => {
            const nameEl = document.getElementById('drugName');
            const doseEl = document.getElementById('dosage');
            const freqEl = document.getElementById('schedule');
            const name = nameEl.value;
            const dose = doseEl.value;
            const freq = freqEl.value;
            if(!name) return;
            currentDrugsList.push({ name, dosage: dose, frequency: freq });
            renderPrescriptions();
            nameEl.value = ''; doseEl.value = ''; freqEl.value = '';
            resetDDIStatus();
        };
    }

    // 6. Bulk Insert
    const parseBtn = document.getElementById('parseBulkBtn');
    if (parseBtn) {
        parseBtn.onclick = async () => {
            const input = document.getElementById('bulkDrugsInput');
            const text = input ? input.value : '';
            if(!text) return;
            
            parseBtn.disabled = true;
            parseBtn.innerHTML = `<i data-feather="loader" class="animate-spin"></i>`;
            
            try {
                const res = await fetch(`${API_BASE}/api/parse-prescription`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ text: text })
                });

                if(!res.ok) throw new Error("Parsing Failed");
                const data = await res.json();
                
                if(data.separate_drugs) {
                    data.separate_drugs.forEach(d => {
                        currentDrugsList.push({
                            name: d.drugName, 
                            dosage: d.dosage, 
                            frequency: d.frequency
                        });
                    });
                }
                
                if(data.racikan) {
                    data.racikan.forEach(r => {
                        currentDrugsList.push({
                            name: "Compound (Racikan)",
                            dosage: r.recipe_text,
                            frequency: r.frequency,
                            ingredients: r.ingredients 
                        });
                    });
                }
                
                renderPrescriptions();
                input.value = "";
                resetDDIStatus();
            } catch(e) {
                alert("Parsing error");
            } finally {
                parseBtn.disabled = false;
                parseBtn.innerHTML = "Parse";
                feather.replace();
            }
        };
    }

    const submitBtn = document.getElementById('submitEMRBtn');
    if(submitBtn) submitBtn.onclick = submitConsultation;
}

// --- DDI LOGIC (Categorized) ---
async function runDDICheck() {
    const btn = document.getElementById('btnCheckDDI');
    const statusDiv = document.getElementById('ddi-status-area');
    
    if (currentDrugsList.length < 2) {
        alert("Need at least 2 drugs to check for interactions.");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<i data-feather="loader" class="w-4 h-4 mr-2 animate-spin"></i> Checking...`;
    
    let checkList = [];
    currentDrugsList.forEach(d => {
        if (d.ingredients && Array.isArray(d.ingredients)) {
            d.ingredients.forEach(i => checkList.push(i.name));
        } else {
            checkList.push(d.name);
        }
    });

    try {
        const res = await fetch(`${API_BASE}/api/check-ddi`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ drugs: checkList })
        });
        
        const data = await res.json();
        const warnings = data.warnings; // Expecting { high: [], medium: [], low: [] }
        
        statusDiv.classList.remove('hidden');
        statusDiv.innerHTML = ''; // Clear previous

        if (data.safe) {
            statusDiv.className = "mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center text-green-700 text-sm";
            statusDiv.innerHTML = `<i data-feather="check-circle" class="w-4 h-4 mr-2"></i> <strong>Safe:</strong> No interactions found.`;
        } else {
            // Render High Severity
            if (warnings.high && warnings.high.length > 0) {
                const div = document.createElement('div');
                div.className = "mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm mb-2";
                div.innerHTML = `
                    <div class="flex items-center mb-1 font-bold"><i data-feather="alert-octagon" class="w-4 h-4 mr-2"></i> HIGH SEVERITY (URGENT)</div>
                    <ul class="list-disc pl-5 space-y-1 text-xs">${warnings.high.map(w => `<li>${w}</li>`).join('')}</ul>
                `;
                statusDiv.appendChild(div);
            }

            // Render Medium Severity
            if (warnings.medium && warnings.medium.length > 0) {
                const div = document.createElement('div');
                div.className = "mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg text-orange-800 text-sm mb-2";
                div.innerHTML = `
                    <div class="flex items-center mb-1 font-bold"><i data-feather="alert-triangle" class="w-4 h-4 mr-2"></i> MODERATE SEVERITY</div>
                    <ul class="list-disc pl-5 space-y-1 text-xs">${warnings.medium.map(w => `<li>${w}</li>`).join('')}</ul>
                `;
                statusDiv.appendChild(div);
            }

            // Render Low Severity
            if (warnings.low && warnings.low.length > 0) {
                const div = document.createElement('div');
                div.className = "mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm";
                div.innerHTML = `
                    <div class="flex items-center mb-1 font-bold"><i data-feather="info" class="w-4 h-4 mr-2"></i> LOW SEVERITY (ADVISORY)</div>
                    <ul class="list-disc pl-5 space-y-1 text-xs">${warnings.low.map(w => `<li>${w}</li>`).join('')}</ul>
                `;
                statusDiv.appendChild(div);
            }
        }
        feather.replace();

    } catch (e) {
        console.error("DDI Error", e);
        alert("Could not check interactions.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `Check Interactions`;
    }
}

function resetDDIStatus() {
    const statusDiv = document.getElementById('ddi-status-area');
    if(statusDiv) statusDiv.classList.add('hidden');
}

// ... (Rest of Helpers & Queue Logic Same as Before) ...
async function initAppointmentsPage() {
    const container = document.getElementById('queue-container');
    if(!container) return;
    try {
        const res = await fetch(`${API_BASE}/doctor/queue?doctor_id=${DOCTOR_ID}`);
        const appointments = await res.json();
        safeSetText('stat-total', appointments.length);
        safeSetText('stat-waiting', Math.max(0, appointments.length - 1));
        container.innerHTML = ''; 
        if (appointments.length === 0) {
            container.innerHTML = `<div class="text-center text-sm text-gray-400 py-4">No patients.</div>`;
        } else {
            appointments.slice(1).forEach(appt => {
                let p = appt.patients || {full_name: 'Unknown'};
                const div = document.createElement('div');
                div.className = "queue-card bg-white p-4 rounded-xl border border-slate-200 cursor-pointer mb-2";
                div.innerHTML = `<div class="flex justify-between"><span class="font-bold">${p.full_name}</span></div>`;
                div.onclick = () => window.location.href = `EMR.html?id=${appt.id}`;
                container.appendChild(div);
            });
             const heroCard = document.getElementById('active-patient-card');
             if(heroCard && appointments.length > 0) {
                 heroCard.classList.remove('hidden');
                 const active = appointments[0];
                 const ap = active.patients || {};
                 safeSetText('active-name', ap.full_name);
                 const heroBtn = document.getElementById('open-active-emr-btn');
                 if(heroBtn) heroBtn.onclick = () => window.location.href = `EMR.html?id=${active.id}`;
             }
        }
    } catch(e) {}
}

function safeSetText(id, val) { const el = document.getElementById(id); if(el) el.textContent = val || '--'; }
function safeSetValue(id, val) { const el = document.getElementById(id); if(el && val) el.value = val; }
function getVal(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function calculateBMI() {
    const wEl = document.getElementById('weight');
    const hEl = document.getElementById('height');
    if(wEl && hEl) {
        const w = parseFloat(wEl.value);
        const h = parseFloat(hEl.value) / 100;
        if(w && h) {
            const bmiEl = document.getElementById('bmi');
            if(bmiEl) bmiEl.textContent = (w/(h*h)).toFixed(1);
        }
    }
}
function calculateAge(dob) { if(!dob) return '--'; return Math.floor((new Date() - new Date(dob))/31557600000); }
function renderComorbidities() {/*...*/}
function renderPrescriptions() {/*...*/}
function loadHistoryPanel() {/*...*/}
function updateSummary() {/*...*/}
function setupAutocomplete() {/*...*/}
