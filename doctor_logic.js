// --- CONFIGURATION ---
const API_BASE = "https://smart-his-backend.onrender.com"; 

// GLOBAL STATE
const DOCTOR_ID = localStorage.getItem('smart_his_user_id');
const DOCTOR_NAME = localStorage.getItem('smart_his_name');
let currentApptId = null;
let currentPatientId = null;
let currentDrugsList = [];
let secondaryDiagnoses = []; // Stores real comorbidity objects

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Set Doctor Name
    const docNameEl = document.getElementById('doc-name-display');
    if (docNameEl && DOCTOR_NAME) docNameEl.textContent = DOCTOR_NAME;

    // 2. Start Clock (if element exists)
    if(document.getElementById('current-time')) startClock();

    // 3. Router
    if (document.getElementById('queue-container')) {
        initAppointmentsPage();
    } else if (document.getElementById('mainContent')) {
        // EMR Page detected by unique ID from your layout
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
    console.log("Initializing EMR UI...");
    
    // 1. Get Appointment ID
    const urlParams = new URLSearchParams(window.location.search);
    currentApptId = urlParams.get('id');
    if (!currentApptId) return alert("No Appointment ID provided.");

    setupEMRInteractions();

    // 2. Fetch Real Data
    try {
        const res = await fetch(`${API_BASE}/doctor/appointment/${currentApptId}`);
        if(!res.ok) throw new Error("Load failed");
        
        const data = await res.json();
        const p = data.patients || {};
        const t = (data.triage_notes && data.triage_notes.length) ? data.triage_notes[0] : {};
        
        currentPatientId = p.id;

        // 3. Populate Patient Info Card
        safeSetText('pt-name', p.full_name || 'Unknown');
        safeSetText('pt-details', `${calculateAge(p.dob)} years old | ${p.gender || 'Unknown'}`);
        safeSetText('pt-id', p.mrn || 'N/A');
        
        // 4. Populate Vitals Input (Pre-filled)
        safeSetValue('weight', t.weight_kg);
        safeSetValue('height', t.height_cm);
        safeSetValue('systolic', t.systolic);
        safeSetValue('diastolic', t.diastolic);
        safeSetValue('temperature', t.temperature);
        calculateBMI(); 

        // 5. Populate Nurse View (Read-Only)
        safeSetText('nurse-notes-text', t.chief_complaint || "No notes recorded.");
        safeSetText('pain-score', t.pain_score || '--');
        safeSetText('pain-location', t.pain_location || '--');

        // 6. Load History for Right Panel
        loadHistoryPanel(p.id);

    } catch (err) {
        console.error(err);
        alert("Failed to load patient data.");
    }
}

function setupEMRInteractions() {
    // --- VIEW TOGGLES ---
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

    // --- RIGHT PANEL TOGGLES ---
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

    // --- DDI CHECK ---
    const checkDDIBtn = document.getElementById('btnCheckDDI');
    if(checkDDIBtn) checkDDIBtn.onclick = runDDICheck;

    // --- ICD AUTOCOMPLETE (REAL DATA) ---
    setupAutocomplete('primaryICDInput', 'primaryICDSuggestions', (item) => {
        const icdInput = document.getElementById('primaryICDInput');
        const diagInput = document.getElementById('primaryDiagnosisInput');
        if(icdInput) icdInput.value = item.code;
        if(diagInput) diagInput.value = item.description;
    });

    // --- COMORBIDITY LOGIC ---
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

    // --- PRESCRIPTION LOGIC ---
    const addRxBtn = document.getElementById('addPrescription');
    if(addRxBtn) {
        addRxBtn.onclick = () => {
            const nameEl = document.getElementById('drugName');
            const doseEl = document.getElementById('dosage');
            const freqEl = document.getElementById('schedule');
            
            if(!nameEl || !doseEl || !freqEl) return;
            const name = nameEl.value; const dose = doseEl.value; const freq = freqEl.value;
            
            if(!name) return;
            currentDrugsList.push({ name, dosage: dose, frequency: freq });
            renderPrescriptions();
            
            nameEl.value = ''; doseEl.value = ''; freqEl.value = '';
            resetDDIStatus();
        };
    }

    // --- BULK INSERT LOGIC ---
    const parseBtn = document.getElementById('parseBulkBtn');
    if (parseBtn) {
        parseBtn.onclick = async () => {
            const input = document.getElementById('bulkDrugsInput');
            const text = input ? input.value : '';
            if(!text) return;
            
            const originalHtml = parseBtn.innerHTML;
            parseBtn.disabled = true;
            parseBtn.innerHTML = `<i data-feather="loader" class="w-3 h-3 mr-1 animate-spin"></i>`;
            if(window.feather) feather.replace();

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
                if(data.equipment) {
                    data.equipment.forEach(e => {
                        currentDrugsList.push({ name: "Equipment: " + e.name, dosage: "1", frequency: "Use as directed" });
                    });
                }

                renderPrescriptions();
                input.value = "";
                resetDDIStatus();
            } catch(e) {
                console.error(e);
                alert("Parsing error.");
            } finally {
                parseBtn.disabled = false;
                parseBtn.innerHTML = originalHtml;
                if(window.feather) feather.replace();
            }
        };
    }

    // --- SUBMIT BUTTONS ---
    const submitBtn1 = document.getElementById('submitDoctorView');
    if(submitBtn1) submitBtn1.onclick = submitConsultation;

    const submitBtn2 = document.getElementById('submitSummaryView');
    if(submitBtn2) submitBtn2.onclick = submitConsultation;
    
    const reviewBtn = document.getElementById('reviewBtn');
    if(reviewBtn) reviewBtn.onclick = () => window.switchView('summary');
}

// ==========================================
// DDI LOGIC (Time-Aware)
// ==========================================
async function runDDICheck() {
    const btn = document.getElementById('btnCheckDDI');
    const statusDiv = document.getElementById('ddi-status-area');
    
    if (currentDrugsList.length < 2) {
        alert("Need at least 2 drugs to check for interactions.");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<i data-feather="loader" class="w-4 h-4 mr-2 animate-spin"></i> Checking...`;
    
    // Gather lists
    let drugNames = [];
    
    currentDrugsList.forEach(d => {
        if (d.ingredients && Array.isArray(d.ingredients)) {
            d.ingredients.forEach(i => drugNames.push(i.name));
        } else {
            drugNames.push(d.name);
        }
    });

    try {
        const res = await fetch(`${API_BASE}/api/check-ddi`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ drugs: drugNames })
        });
        
        const data = await res.json();
        const warnings = data.warnings; 
        
        statusDiv.classList.remove('hidden');
        statusDiv.innerHTML = ''; 

        if (data.safe) {
            statusDiv.className = "mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center text-green-700 text-sm";
            statusDiv.innerHTML = `<i data-feather="check-circle" class="w-4 h-4 mr-2"></i> <strong>Safe:</strong> No overlapping interactions found.`;
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

// ==========================================
// HELPER FUNCTIONS (RESTORED)
// ==========================================

function setupAutocomplete(inputId, suggestionsId, onSelect) {
    const input = document.getElementById(inputId);
    const suggestions = document.getElementById(suggestionsId);
    if (!input || !suggestions) return;
    
    input.addEventListener('input', async (e) => {
        const q = e.target.value;
        if(q.length < 2) { suggestions.classList.add('hidden'); return; }
        try {
            const res = await fetch(`${API_BASE}/api/icd/search?q=${q}`);
            const results = await res.json();
            suggestions.innerHTML = '';
            if(results.length > 0) {
                suggestions.classList.remove('hidden');
                results.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'px-4 py-2 cursor-pointer hover:bg-gray-100 text-sm border-b border-gray-100';
                    div.innerHTML = `<span class="font-bold text-blue-600 w-12 inline-block">${item.code}</span> ${item.description}`;
                    div.onclick = () => { onSelect(item); suggestions.classList.add('hidden'); };
                    suggestions.appendChild(div);
                });
            } else { suggestions.classList.add('hidden'); }
        } catch(e) { console.error(e); }
    });
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !suggestions.contains(e.target)) suggestions.classList.add('hidden');
    });
}

function renderComorbidities() {
    const list = document.getElementById('comorbidityList');
    if(!list) return;
    list.innerHTML = '';
    if (secondaryDiagnoses.length === 0) {
        list.innerHTML = '<span class="text-xs text-gray-400 self-center italic px-2">No secondary diagnoses added.</span>';
        return;
    }
    secondaryDiagnoses.forEach((item, idx) => {
        const tag = document.createElement('div');
        tag.className = 'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 border border-indigo-200';
        tag.innerHTML = `<span class="mr-1 font-bold">${item.code}</span><span class="mr-2 truncate max-w-[150px]">${item.description}</span><button class="text-indigo-500 hover:text-red-600 ml-1" onclick="removeComorbidity(${idx})"><i data-feather="x" class="w-3 h-3"></i></button>`;
        list.appendChild(tag);
    });
    if(window.feather) feather.replace();
}

window.removeComorbidity = (idx) => { secondaryDiagnoses.splice(idx, 1); renderComorbidities(); }

function renderPrescriptions() {
    const list = document.getElementById('prescriptionList');
    if(!list) return;
    list.innerHTML = '';
    if(currentDrugsList.length === 0) {
        list.innerHTML = '<div class="px-4 py-3 text-gray-500 text-sm">No drugs added.</div>';
        return;
    }
    currentDrugsList.forEach((d, idx) => {
        const div = document.createElement('div');
        div.className = 'px-4 py-3 flex justify-between items-start border-b border-gray-100 last:border-0';
        
        let detailsHtml = '';
        if (d.ingredients && d.ingredients.length > 0) {
            const ingList = d.ingredients.map(i => `<span class="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[10px] mr-1 border border-blue-100">${i.name} ${i.strength}</span>`).join('');
            detailsHtml = `<div class="mt-1"><p class="text-xs text-gray-500 font-medium mb-1">Contains:</p><div class="flex flex-wrap gap-1">${ingList}</div><p class="text-xs text-gray-500 mt-1 italic">${d.dosage} • ${d.frequency}</p></div>`;
        } else {
            detailsHtml = `<p class="text-xs text-gray-500">${d.dosage} • ${d.frequency}</p>`;
        }

        div.innerHTML = `
            <div><p class="font-bold text-gray-800 text-sm">${d.name}</p>${detailsHtml}</div>
            <button onclick="removeDrug(${idx})" class="text-red-500 hover:text-red-700 mt-1"><i data-feather="trash-2" class="w-4 h-4"></i></button>
        `;
        list.appendChild(div);
    });
    if(window.feather) feather.replace();
}

window.removeDrug = (idx) => { currentDrugsList.splice(idx, 1); renderPrescriptions(); resetDDIStatus(); }

async function loadHistoryPanel(patientId) {
    const container = document.getElementById('historyContent');
    if(!container) return;
    try {
        const res = await fetch(`${API_BASE}/patient/history?patient_id=${patientId}`);
        const history = await res.json();
        container.innerHTML = '';
        if(history.length === 0) { container.innerHTML = '<div class="p-4 text-sm text-gray-400">No history found.</div>'; return; }
        
        history.forEach(h => {
            const date = new Date(h.created_at).toLocaleDateString();
            let title = h.assessment;
            if(h.assessment && h.assessment.includes("PRIMARY:")) {
                title = h.assessment.split('\n')[0].replace('PRIMARY:', '').trim();
            }
            const div = document.createElement('div');
            div.className = "p-4 bg-gray-50 border border-gray-200 rounded-lg mb-3 cursor-pointer hover:shadow-md transition-all";
            div.innerHTML = `<div class="flex justify-between mb-1"><span class="text-sm font-bold text-blue-700">${date}</span><span class="text-xs text-gray-500">Dr. ${h.doctors ? h.doctors.full_name : 'Unknown'}</span></div><h4 class="font-semibold text-gray-800 text-sm">${title || 'No Diagnosis'}</h4>`;
            container.appendChild(div);
        });
    } catch(e) {}
}

function updateSummary() {
    safeSetText('summaryCC', getVal('chiefComplaintInput'));
    safeSetText('summaryHistory', getVal('historyInput'));
    safeSetText('summaryBP', `${getVal('systolic')}/${getVal('diastolic')}`);
    safeSetText('summaryDiagnosis', getVal('primaryDiagnosisInput'));
    safeSetText('summaryInstructions', getVal('therapyInput'));
    
    const summaryMeds = document.getElementById('summaryMeds');
    if(summaryMeds) {
        if(currentDrugsList.length > 0) {
            summaryMeds.innerHTML = '<ul class="list-disc pl-4 space-y-1">' + currentDrugsList.map(d => `<li><strong>${d.name}</strong> - ${d.dosage}</li>`).join('') + '</ul>';
        } else {
            summaryMeds.textContent = "No medications.";
        }
    }
}

async function submitConsultation() {
    if(!confirm("Finalize EMR?")) return;
    const btn = document.getElementById('submitEMRBtn');
    if(btn) { btn.textContent = "Processing..."; btn.disabled = true; }

    const payload = {
        doctor_id: DOCTOR_ID,
        appointment_id: currentApptId,
        chief_complaint: getVal('chiefComplaintInput'),
        history_illness: getVal('historyInput'),
        primary_diagnosis: getVal('primaryDiagnosisInput'),
        icd10_code: getVal('primaryICDInput'),
        secondary_diagnoses: secondaryDiagnoses.map(d => `${d.description} (${d.code})`),
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
        
        const responseData = await res.json();
        if (responseData.warnings && responseData.warnings.length > 0) {
            alert("Consultation Saved with DDI Warnings:\n" + responseData.warnings.join("\n"));
        } else {
            alert("Consultation Saved Successfully!");
        }
        window.location.href = "APPOINTMENTS.html";
    } catch(e) {
        alert("Submit failed: " + e.message);
        if(btn) { btn.textContent = "Finalize & Submit EMR"; btn.disabled = false; }
    }
}

// --- QUEUE LOGIC ---
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

        const waitingList = appointments.slice(1);
        if (waitingList.length === 0) {
            container.innerHTML = `<div class="text-center text-sm text-gray-400 py-4">No other patients waiting.</div>`;
        } else {
            waitingList.forEach(appt => {
                let p = appt.patients || {full_name: 'Unknown'};
                const div = document.createElement('div');
                div.className = "queue-card bg-white p-4 rounded-xl border border-slate-200 cursor-pointer mb-2";
                div.innerHTML = `<div class="flex justify-between items-center"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600">${appt.queue_number}</div><div><h4 class="font-bold text-sm text-slate-800">${p.full_name}</h4><p class="text-xs text-slate-500">${calculateAge(p.dob)} yrs</p></div></div><span class="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">Waiting</span></div>`;
                div.onclick = () => window.location.href = `EMR.html?id=${appt.id}`;
                container.appendChild(div);
            });
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
