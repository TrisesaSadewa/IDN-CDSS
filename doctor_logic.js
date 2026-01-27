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
                
                // IMPORTANT: Save ingredients for DDI check
                if(data.racikan) {
                    data.racikan.forEach(r => {
                        currentDrugsList.push({
                            name: "Compound (Racikan)",
                            dosage: r.recipe_text,
                            frequency: r.frequency,
                            ingredients: r.ingredients // Save ingredients list
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

// --- DDI LOGIC (ACTIONABLE UI) ---
async function runDDICheck() {
    const btn = document.getElementById('btnCheckDDI');
    const statusDiv = document.getElementById('ddi-status-area');
    
    if (currentDrugsList.length < 2) {
        alert("Need at least 2 drugs to check for interactions.");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<i data-feather="loader" class="w-4 h-4 mr-2 animate-spin"></i> Checking...`;
    
    // Flatten Ingredients for DDI
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
        const interactions = data.interactions; // List of rich objects
        
        statusDiv.classList.remove('hidden');
        statusDiv.innerHTML = ''; 

        if (data.safe) {
            statusDiv.className = "mt-3 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center text-green-700 text-sm";
            statusDiv.innerHTML = `<i data-feather="check-circle" class="w-5 h-5 mr-3"></i> <div><strong>Safe:</strong> No major interactions found.</div>`;
        } else {
            statusDiv.className = "mt-4 space-y-3";
            
            // Header
            const header = document.createElement('div');
            header.className = "text-sm font-bold text-gray-700 flex items-center";
            header.innerHTML = `<i data-feather="alert-triangle" class="w-4 h-4 mr-2 text-orange-500"></i> ${interactions.length} Interactions Found`;
            statusDiv.appendChild(header);

            // Render each interaction card
            interactions.forEach(item => {
                const card = document.createElement('div');
                
                // Color coding
                let borderClass = "border-gray-200";
                let badgeClass = "bg-gray-100 text-gray-600";
                let icon = "info";
                
                if (item.severity === "Major") {
                    borderClass = "border-red-300 bg-red-50";
                    badgeClass = "bg-red-600 text-white";
                    icon = "alert-octagon";
                } else if (item.severity === "Moderate") {
                    borderClass = "border-orange-200 bg-orange-50";
                    badgeClass = "bg-orange-500 text-white";
                    icon = "alert-triangle";
                } else if (item.severity === "Minor") {
                    borderClass = "border-blue-200 bg-blue-50";
                    badgeClass = "bg-blue-500 text-white";
                    icon = "info";
                }

                card.className = `p-4 rounded-xl border ${borderClass} shadow-sm`;
                card.innerHTML = `
                    <div class="flex justify-between items-start mb-3">
                        <div class="flex gap-2 items-center">
                            <span class="text-xs font-bold px-2 py-1 rounded uppercase flex items-center ${badgeClass}">
                                <i data-feather="${icon}" class="w-3 h-3 mr-1"></i> ${item.severity}
                            </span>
                            <span class="font-bold text-gray-800 text-sm">${item.pair[0]} + ${item.pair[1]}</span>
                        </div>
                    </div>
                    
                    <div class="space-y-3">
                        <div>
                            <p class="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Reason / Mechanism</p>
                            <p class="text-xs text-gray-700 leading-relaxed">${item.description}</p>
                        </div>
                        
                        <div class="bg-white/60 p-3 rounded-lg border border-gray-200/50">
                            <p class="text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-1">Actionable Advice</p>
                            <p class="text-xs text-gray-800 font-medium leading-relaxed">
                                ${item.advice}
                            </p>
                        </div>
                    </div>
                `;
                
                // Highlight interacting drugs
                highlightInteractingDrugs(item.pair);
                
                statusDiv.appendChild(card);
            });
        }
        feather.replace();

    } catch (e) {
        console.error("DDI Error", e);
        alert("Could not check interactions.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i data-feather="shield" class="w-3 h-3 mr-1"></i> Check Interactions`;
    }
}

function highlightInteractingDrugs(pair) {
    const listItems = document.getElementById('prescriptionList').children;
    Array.from(listItems).forEach(item => {
        const drugNameEl = item.querySelector('.font-bold');
        if (!drugNameEl) return;
        const drugName = drugNameEl.textContent.toLowerCase();
        
        // Simple fuzzy check
        const isMatch = pair.some(p => drugName.includes(p.toLowerCase()));
        
        if (isMatch) {
            item.classList.add('bg-red-50');
            if (!item.querySelector('.ddi-warning-icon')) {
                const icon = document.createElement('i');
                icon.setAttribute('data-feather', 'alert-circle');
                icon.className = "w-4 h-4 text-red-500 ml-2 ddi-warning-icon inline";
                drugNameEl.parentNode.appendChild(icon);
            }
        }
    });
    feather.replace();
}

function resetDDIStatus() {
    const statusDiv = document.getElementById('ddi-status-area');
    if(statusDiv) statusDiv.classList.add('hidden');
    
    const listItems = document.getElementById('prescriptionList').children;
    Array.from(listItems).forEach(item => {
        item.classList.remove('bg-red-50');
        const icon = item.querySelector('.ddi-warning-icon');
        if(icon) icon.remove();
    });
}

// ... (Rest of Helpers & Queue Logic Same as Before) ...

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
        // Check for warnings in response (server-side check on submit)
        if (responseData.interactions && responseData.interactions.length > 0) {
            alert("Consultation Saved with DDI Warnings:\n" + responseData.interactions.map(i => i.pair.join(' + ')).join("\n"));
        } else {
            alert("Consultation Saved Successfully!");
        }
        window.location.href = "APPOINTMENTS.html";
    } catch(e) {
        alert("Submit failed: " + e.message);
        if(btn) { btn.textContent = "Finalize & Submit EMR"; btn.disabled = false; }
    }
}

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
