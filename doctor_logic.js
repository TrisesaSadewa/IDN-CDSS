// --- CONFIGURATION ---
const API_BASE = "https://smart-his-backend.onrender.com";

// GLOBAL STATE
const SUPABASE_URL = 'https://crywwqleinnwoacithmw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyeXd3cWxlaW5ud29hY2l0aG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MDg4MTIsImV4cCI6MjA4Mzk4NDgxMn0.VTDI6ZQ_aN895A29_v0F1vHzqaS-RG7iGzOFM6qMKfk';
let supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const DOCTOR_ID = localStorage.getItem('smart_his_user_id');
const DOCTOR_NAME = localStorage.getItem('smart_his_name');
let currentApptId = null;
let currentPatientId = null;
let currentDrugsList = [];
let secondaryDiagnoses = [];
let lastDDIResults = [];

document.addEventListener('DOMContentLoaded', () => {
    const docNameEl = document.getElementById('doc-name-display');
    if (docNameEl && DOCTOR_NAME) docNameEl.textContent = DOCTOR_NAME;
    if (document.getElementById('current-time')) startClock();

    if (document.getElementById('queue-container')) {
        initAppointmentsPage();
    } else if (document.getElementById('mainContent')) {
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
// ALGORITHMIC / DATA-DRIVEN SUGGESTIONS
// ==========================================

// 1. OpenFDA Indication Search
async function handleAlgorithmicSuggestGeneral() {
    const btn = document.getElementById('btnAlgorithmicSuggestRx');
    const box = document.getElementById('algorithmicSuggestionBox');
    const textEl = document.getElementById('algorithmicSuggestionText');

    // Use the primary diagnosis text (e.g. "hypertension")
    const diagnosis = getVal('primaryDiagnosisInput').trim();
    if (!diagnosis) {
        alert("Please enter a Primary Diagnosis to search the FDA database.");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<i data-feather="loader" class="w-3.5 h-3.5 mr-1.5 animate-spin"></i> Searching FDA...`;
    if (window.feather) feather.replace();

    try {
        const query = encodeURIComponent(diagnosis);
        // Hits the official US OpenFDA database for drug indications
        const res = await fetch(`https://api.fda.gov/drug/label.json?search=indications_and_usage:"${query}"&limit=5`);
        if (!res.ok) throw new Error("No specific indications found in FDA database for this term.");

        const data = await res.json();
        let suggestions = [];

        data.results.forEach(item => {
            if (item.openfda && item.openfda.generic_name) {
                suggestions.push(item.openfda.generic_name[0]);
            }
        });

        suggestions = [...new Set(suggestions)]; // Deduplicate generic names

        if (suggestions.length > 0) {
            textEl.innerHTML = `<strong class="block mb-2 text-indigo-800"><i data-feather="database" class="inline w-4 h-4 mr-1"></i> OpenFDA Approvals for "${diagnosis}":</strong><ul class="list-disc pl-5 space-y-1">` +
                suggestions.map(s => `<li class="capitalize font-medium">${s.toLowerCase()}</li>`).join('') +
                `</ul><p class="text-[10px] text-indigo-500 mt-3 italic">*Data sourced directly from US FDA Indications and Usage labels.</p>`;
        } else {
            textEl.innerHTML = `No standard generics found in FDA database for "${diagnosis}". Try a broader term.`;
        }
        box.classList.remove('hidden');
    } catch (e) {
        alert(e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i data-feather="database" class="w-3.5 h-3.5 mr-1.5"></i> FDA Indication Search`;
        if (window.feather) feather.replace();
    }
}

// 2. DDI Resolution Algorithm (Called from inside Sidebar Card)
window.askAlgorithmForAlternative = async function (drugA, drugB, btnElement) {
    const container = btnElement.nextElementSibling;

    btnElement.disabled = true;
    btnElement.innerHTML = `<i data-feather="loader" class="w-3 h-3 mr-1 animate-spin"></i> Running Algorithm...`;
    if (window.feather) feather.replace();

    try {
        const res = await fetch(`${API_BASE}/api/suggest-alternative`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ drug_to_replace: drugA, interacting_with: drugB })
        });

        const data = await res.json();

        if (data.alternatives && data.alternatives.length > 0) {
            let html = `<strong class="block mb-2 text-blue-700 border-b border-blue-200 pb-1">Algorithmic Alternatives for ${drugA}:</strong><ul class="list-disc pl-4 space-y-2">`;
            data.alternatives.forEach(alt => {
                html += `<li><b class="text-gray-800">${alt.generic_name}</b> <span class="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ml-1">${alt.class}</span></li>`;
            });
            html += `</ul><p class="text-[10px] mt-3 italic text-gray-500 bg-white p-2 rounded border border-gray-100"><i data-feather="check-circle" class="inline w-3 h-3 text-green-500 mr-1"></i> These classes have been cross-checked to ensure they do not trigger a known interaction rule with ${drugB}.</p>`;
            container.innerHTML = html;
        } else {
            container.innerHTML = `<span class="text-red-600 font-medium text-xs"><i data-feather="alert-circle" class="inline w-3 h-3 mr-1"></i> No algorithmic alternative class mapped in the local database for ${drugA}.</span>`;
        }
        container.classList.remove('hidden');
        btnElement.classList.add('hidden');
    } catch (e) {
        alert("Failed to run algorithm: " + e.message);
        btnElement.disabled = false;
        btnElement.innerHTML = `<i data-feather="database" class="w-3 h-3 mr-1"></i> Suggest Alternative`;
    }
    if (window.feather) feather.replace();
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
        if (!res.ok) throw new Error("Load failed");

        const data = await res.json();
        const p = data.patients || {};

        // Grab the most recent triage note attached to this appointment
        const t = (data.triage_notes && data.triage_notes.length > 0)
            ? data.triage_notes[data.triage_notes.length - 1]
            : {};

        currentPatientId = p.id;
        safeSetText('pt-name', p.full_name || 'Unknown');
        safeSetText('pt-details', `${calculateAge(p.dob)} years old | ${p.gender || 'Unknown'}`);
        safeSetText('pt-id', p.mrn || 'N/A');

        const allergies = p.allergies || "None Known";
        safeSetText('pt-allergies', allergies);

        const alEl = document.getElementById('pt-allergies');
        if (alEl) {
            alEl.classList.add('cursor-pointer', 'hover:bg-red-200');
            if (allergies === "None Known") {
                alEl.className = "text-xs font-medium text-gray-400 bg-gray-50 border border-gray-200 px-2 py-1 rounded text-right cursor-pointer hover:bg-red-100";
            }

            alEl.onclick = async () => {
                const newAllergy = prompt("Update Patient Allergies:", alEl.innerText);
                if (newAllergy !== null && supabaseClient) {
                    const { error } = await supabaseClient
                        .from('patients')
                        .update({ allergies: newAllergy })
                        .eq('id', currentPatientId);

                    if (!error) {
                        alEl.innerText = newAllergy || "None Known";
                        alEl.className = (!newAllergy || newAllergy === "None")
                            ? "text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 px-2 py-1 rounded text-right"
                            : "text-xs font-bold text-red-700 bg-red-100 border border-red-200 px-2 py-1 rounded shadow-sm text-right";
                    }
                }
            };
        }

        // Populate Vitals from Nurse Triage
        safeSetValue('weight', t.weight_kg);
        safeSetValue('height', t.height_cm);
        safeSetValue('systolic', t.systolic);
        safeSetValue('diastolic', t.diastolic);
        safeSetValue('temperature', t.temperature);
        calculateBMI();

        // --- Populate the "Nurse Notes" UI from Nurse Triage ---
        safeSetText('nurse-notes-text', t.chief_complaint || "No notes recorded by nurse.");
        safeSetText('pain-score', t.pain_score !== null && t.pain_score !== undefined ? t.pain_score : '--');
        safeSetText('pain-location', t.pain_location || '--');

        loadHistoryPanel(p.id);

    } catch (err) {
        console.error(err);
        alert("Failed to load patient data.");
    }
}

window.togglePanel = (type) => {
    const rightPanel = document.getElementById('rightPanel');
    if (!rightPanel) return;

    const isClosed = rightPanel.classList.contains('translate-x-full');

    if (isClosed) rightPanel.classList.remove('translate-x-full');
    else if (rightPanel.dataset.type === type) rightPanel.classList.add('translate-x-full');

    rightPanel.dataset.type = type;
    const lab = document.getElementById('labContent');
    const hist = document.getElementById('historyContent');
    const ddi = document.getElementById('ddiContent');
    const title = document.getElementById('rightPanelTitle');

    if (lab) lab.classList.add('hidden');
    if (hist) hist.classList.add('hidden');
    if (ddi) ddi.classList.add('hidden');

    if (type === 'lab' && lab) {
        lab.classList.remove('hidden');
        if (title) title.textContent = "Recent Lab Results";
    } else if (type === 'history' && hist) {
        hist.classList.remove('hidden');
        if (title) title.textContent = "Past Medical History";
    } else if (type === 'ddi' && ddi) {
        ddi.classList.remove('hidden');
        if (title) title.textContent = "Interaction Report";
    }
};

function setupEMRInteractions() {
    const checkDDIBtn = document.getElementById('btnCheckDDI');
    if (checkDDIBtn) checkDDIBtn.onclick = runDDICheck;

    const suggestBtn = document.getElementById('btnAlgorithmicSuggestRx');
    if (suggestBtn) suggestBtn.onclick = handleAlgorithmicSuggestGeneral;

    window.switchView = function (viewName) {
        ['nurseView', 'doctorView', 'summaryView'].forEach(id => document.getElementById(id).classList.add('hidden-view'));
        document.querySelectorAll('.view-toggle-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(viewName + 'View').classList.remove('hidden-view');
        if (viewName === 'summary') updateSummary();
        const btnMap = { 'nurse': 0, 'doctor': 1, 'summary': 2 };
        document.querySelectorAll('.view-toggle-btn')[btnMap[viewName]].classList.add('active');
    };

    const rightPanelBtnLab = document.getElementById('sidebarLabBtn');
    const rightPanelBtnHist = document.getElementById('sidebarHistoryBtn');
    const rightPanelBtnDDI = document.getElementById('sidebarDDIBtn');

    if (rightPanelBtnLab) rightPanelBtnLab.onclick = () => window.togglePanel('lab');
    if (rightPanelBtnHist) rightPanelBtnHist.onclick = () => window.togglePanel('history');
    if (rightPanelBtnDDI) rightPanelBtnDDI.onclick = () => window.togglePanel('ddi');

    const closeBtn = document.getElementById('closeRightPanel');
    if (closeBtn) closeBtn.onclick = () => document.getElementById('rightPanel').classList.add('translate-x-full');

    setupAutocomplete('primaryICDInput', 'primaryICDSuggestions', 'icd10', (item) => {
        document.getElementById('primaryICDInput').value = item.code;
        document.getElementById('primaryDiagnosisInput').value = item.description;
    });

    // ADDED: Allow searching by typing directly into the Diagnosis Description field
    setupAutocomplete('primaryDiagnosisInput', 'primaryICDSuggestions', 'icd10', (item) => {
        document.getElementById('primaryICDInput').value = item.code;
        document.getElementById('primaryDiagnosisInput').value = item.description;
    });

    setupAutocomplete('comorbidityInput', 'comorbiditySuggestions', 'icd10', (item) => {
        if (!secondaryDiagnoses.some(d => d.code === item.code)) { secondaryDiagnoses.push(item); renderComorbidities(); }
        document.getElementById('comorbidityInput').value = '';
    });

    // ADDED: Drug Search Optimization
    setupAutocomplete('drugName', null, 'drug', (item) => {
        const nameEl = document.getElementById('drugName');
        nameEl.value = item.local_term;
        nameEl.dataset.selectedDrug = JSON.stringify(item);
        document.getElementById('dosage').focus();
    });
    document.getElementById('addComorbidityBtn').onclick = () => {
        const val = document.getElementById('comorbidityInput').value.trim();
        if (val) { secondaryDiagnoses.push({ code: 'DX', description: val }); renderComorbidities(); document.getElementById('comorbidityInput').value = ''; }
    };

    document.getElementById('addPrescription').onclick = async () => {
        const nameEl = document.getElementById('drugName');
        const doseEl = document.getElementById('dosage');
        const freqEl = document.getElementById('schedule');
        const name = nameEl.value; const dose = doseEl.value; const freq = freqEl.value;
        if (!name) return;

        let drugClass = 'unknown';
        if (nameEl.dataset.selectedDrug) {
            try {
                const selected = JSON.parse(nameEl.dataset.selectedDrug);
                if (selected.local_term === name) drugClass = selected.drug_class || 'unknown';
            } catch (e) { }
        }

        // If still unknown, try resolving from backend (for manual types or unsynced results)
        if (drugClass === 'unknown') {
            try {
                const res = await fetch(`${API_BASE}/api/resolve-drug-class?q=${encodeURIComponent(name)}`);
                const classData = await res.json();
                drugClass = classData.drug_class || 'unknown';
            } catch (e) { console.error("Class resolution failed", e); }
        }

        currentDrugsList.push({ name, dosage: dose, frequency: freq, class: drugClass });
        renderPrescriptions();
        nameEl.value = ''; doseEl.value = ''; freqEl.value = '';
        delete nameEl.dataset.selectedDrug;
        resetDDIStatus();
    };

    const parseBtn = document.getElementById('parseBulkBtn');
    if (parseBtn) {
        parseBtn.onclick = async () => {
            const input = document.getElementById('bulkDrugsInput');
            const text = input.value;
            if (!text) return;
            parseBtn.disabled = true; parseBtn.innerHTML = `<i data-feather="loader" class="animate-spin"></i>`;
            try {
                const res = await fetch(`${API_BASE}/api/parse-prescription`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text })
                });
                if (!res.ok) throw new Error("Parsing Failed");
                const data = await res.json();
                if (data.separate_drugs) data.separate_drugs.forEach(d => currentDrugsList.push({ name: d.drugName, class: d.drugClass, dosage: d.dosage, frequency: d.frequency }));
                if (data.racikan) data.racikan.forEach(r => currentDrugsList.push({ name: "Compound (Racikan)", dosage: r.recipe_text, frequency: r.frequency, ingredients: r.ingredients }));
                renderPrescriptions();
                input.value = "";
                resetDDIStatus();
            } catch (e) { alert("Parsing error: " + e.message); }
            finally { parseBtn.disabled = false; parseBtn.innerHTML = "Parse"; feather.replace(); }
        };
    }

    const submitBtn = document.getElementById('submitDoctorView');
    if (submitBtn) submitBtn.onclick = () => switchView('summary');

    const finalSubmitBtn = document.getElementById('submitSummaryView');
    if (finalSubmitBtn) finalSubmitBtn.onclick = submitConsultation;
}

// ==========================================
// DDI LOGIC (SIDEBAR INTEGRATION)
// ==========================================
async function runDDICheck() {
    const btn = document.getElementById('btnCheckDDI');

    if (currentDrugsList.length < 2) {
        alert("Need at least 2 drugs to check for interactions.");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<i data-feather="loader" class="w-3.5 h-3.5 mr-1.5 animate-spin"></i> Checking...`;

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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ drugs: checkList })
        });

        const data = await res.json();
        const interactions = data.interactions;
        lastDDIResults = interactions;

        renderDDIResults(interactions, data.safe);

        const rightPanel = document.getElementById('rightPanel');
        if (rightPanel.classList.contains('translate-x-full') || rightPanel.dataset.type !== 'ddi') {
            window.togglePanel('ddi');
        }

    } catch (e) {
        console.error("DDI Error", e);
        alert("Could not check interactions.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i data-feather="shield" class="w-3.5 h-3.5 mr-1.5"></i> Check Interactions`;
        if (window.feather) feather.replace();
    }
}

function renderDDIResults(interactions, isSafe) {
    const container = document.getElementById('ddiContent');
    if (!container) return;

    container.innerHTML = '';

    const ddiSidebarBtn = document.getElementById('sidebarDDIBtn');
    const ddiSidebarIcon = document.getElementById('ddiSidebarIcon');

    if (ddiSidebarBtn) {
        ddiSidebarBtn.classList.remove('flash-major', 'text-gray-300', 'text-green-400', 'text-orange-400', 'text-red-400', 'bg-gray-700');

        if (isSafe) {
            ddiSidebarBtn.classList.add('text-green-400');
            if (ddiSidebarIcon) ddiSidebarIcon.setAttribute('data-feather', 'shield');
        } else {
            const hasMajor = interactions.some(i => i.severity === 'Major');
            if (hasMajor) {
                ddiSidebarBtn.classList.add('flash-major');
                if (ddiSidebarIcon) ddiSidebarIcon.setAttribute('data-feather', 'shield-alert');
            } else {
                ddiSidebarBtn.classList.add('text-orange-400');
                if (ddiSidebarIcon) ddiSidebarIcon.setAttribute('data-feather', 'alert-triangle');
            }
        }
    }

    try {
        if (isSafe) {
            container.innerHTML = `
                <div class="mt-2 p-4 bg-green-50 border border-green-200 rounded-xl flex items-start text-green-800 text-sm animate-fade-in shadow-sm">
                    <i data-feather="check-circle" class="w-6 h-6 mr-3 mt-0.5 text-green-600"></i> 
                    <div>
                        <h4 class="font-bold text-base mb-1">Prescription Safe</h4>
                        <p>No major interactions found in the current drug combination.</p>
                    </div>
                </div>`;
        } else {
            const list = document.createElement('div');
            list.className = "space-y-4 animate-fade-in pb-8";

            interactions.forEach(item => {
                if (!item || !item.pair) return;

                let colorClass = "bg-white border-gray-200";
                let badgeClass = "bg-gray-200 text-gray-700";
                let icon = "info";

                if (item.severity === "Major") {
                    colorClass = "bg-red-50 border-red-200";
                    badgeClass = "bg-red-600 text-white";
                    icon = "alert-octagon";
                } else if (item.severity === "Intermediate" || item.severity === "Moderate") {
                    colorClass = "bg-orange-50 border-orange-200";
                    badgeClass = "bg-orange-500 text-white";
                    icon = "alert-triangle";
                } else if (item.severity === "Minor") {
                    colorClass = "bg-yellow-50 border-yellow-200";
                    badgeClass = "bg-yellow-500 text-yellow-900";
                    icon = "alert-circle";
                }

                const card = document.createElement('div');
                card.className = `p-4 rounded-xl border ${colorClass} shadow-sm`;
                card.innerHTML = `
                    <div class="flex justify-between items-start mb-2 pb-2 border-b border-gray-200/50">
                        <div class="flex gap-2 items-center">
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded uppercase flex items-center shadow-sm ${badgeClass}">
                                <i data-feather="${icon}" class="w-3 h-3 mr-1"></i> ${item.severity}
                            </span>
                        </div>
                    </div>
                    
                    <h4 class="font-bold text-gray-800 text-sm mb-3 leading-tight">${item.pair[0]} <span class="text-gray-400 mx-1">+</span> ${item.pair[1]}</h4>
                    
                    <div class="space-y-3 text-xs">
                        <div>
                            <p class="font-bold text-gray-500 uppercase tracking-wide mb-1 text-[10px]">Reason / Mechanism</p>
                            <p class="text-gray-700 leading-relaxed">${item.description}</p>
                        </div>
                        <div class="bg-white/80 p-3 rounded-lg border border-gray-200 shadow-sm mb-2">
                            <p class="font-bold text-blue-600 uppercase tracking-wide mb-1 text-[10px] flex items-center">
                                <i data-feather="activity" class="w-3 h-3 mr-1"></i> Recommendation
                            </p>
                            <p class="text-gray-900 font-medium leading-relaxed">${item.advice}</p>
                        </div>
                        
                        <!-- Algorithmic Suggest Alternative Button -->
                        <div class="mt-3 pt-3 border-t border-gray-200/50 flex flex-col">
                            <button onclick="askAlgorithmForAlternative('${item.pair[0]}', '${item.pair[1]}', this)" class="self-start text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-3 py-2 rounded hover:bg-blue-100 transition-colors flex items-center shadow-sm">
                                <i data-feather="database" class="w-3 h-3 mr-1.5"></i> Find Safe Alternative
                            </button>
                            <div class="ai-response-box hidden mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs text-blue-900 whitespace-pre-wrap leading-relaxed shadow-inner"></div>
                        </div>
                    </div>
                `;

                highlightInteractingDrugs(item.pair);
                list.appendChild(card);
            });
            container.appendChild(list);
        }
    } catch (renderError) {
        console.error("Failed building DDI DOM", renderError);
        container.innerHTML = `<div class="p-4 bg-red-50 text-red-500 rounded border border-red-200">Error rendering report UI. Check console.</div>`;
    }

    if (window.feather) feather.replace();
}

function highlightInteractingDrugs(pair) {
    const listItems = document.getElementById('prescriptionList').children;
    Array.from(listItems).forEach(item => {
        const drugNameEl = item.querySelector('.font-bold');
        if (!drugNameEl) return;

        const rawText = drugNameEl.innerText.split('\n')[0].toLowerCase();
        const isMatch = pair.some(p => rawText.includes(p.toLowerCase()));

        if (isMatch) {
            item.classList.add('bg-red-50');
            const oldIcon = item.querySelector('.ddi-warning-icon');
            if (oldIcon) oldIcon.remove();

            const icon = document.createElement('i');
            icon.setAttribute('data-feather', 'alert-circle');
            icon.className = "w-4 h-4 text-red-500 ml-2 ddi-warning-icon inline";
            drugNameEl.appendChild(icon);
        }
    });
}

function resetDDIStatus() {
    const container = document.getElementById('ddiContent');
    if (container) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-gray-400">
                <i data-feather="shield" class="w-12 h-12 mb-3 opacity-50"></i>
                <p class="text-sm font-medium">Click 'Check Interactions' to run safety analysis.</p>
            </div>
        `;
    }

    const ddiBtn = document.getElementById('sidebarDDIBtn');
    const ddiIcon = document.getElementById('ddiSidebarIcon');
    if (ddiBtn) {
        ddiBtn.classList.remove('flash-major', 'text-red-400', 'text-green-400', 'text-orange-400');
        ddiBtn.classList.add('text-gray-300');
        if (ddiIcon) ddiIcon.setAttribute('data-feather', 'shield');
    }

    const rightPanel = document.getElementById('rightPanel');
    if (rightPanel && rightPanel.dataset.type === 'ddi') {
        rightPanel.classList.add('translate-x-full');
    }

    const listItems = document.getElementById('prescriptionList').children;
    Array.from(listItems).forEach(item => {
        item.classList.remove('bg-red-50');
        const icon = item.querySelector('.ddi-warning-icon');
        if (icon) icon.remove();
    });
    if (window.feather) feather.replace();
}

function setupAutocomplete(inputId, suggestionsId, type, onSelect) {
    const input = document.getElementById(inputId);
    let suggestions = document.getElementById(suggestionsId);

    if (!input) return;

    // Create suggestions div if it doesn't exist (e.g. for drugs)
    if (!suggestions && inputId === 'drugName') {
        suggestions = document.createElement('div');
        suggestions.id = 'drugSuggestions';
        suggestions.className = 'autocomplete-list hidden';
        input.parentNode.style.position = 'relative';
        input.parentNode.appendChild(suggestions);
    }

    if (!suggestions) return;

    input.addEventListener('input', async (e) => {
        const q = e.target.value;
        if (q.length < 2) { suggestions.classList.add('hidden'); return; }

        try {
            // Lazy initialization of supabaseClient
            if (!supabaseClient && window.supabase) {
                supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            }

            let results = [];

            if (type === 'icd10') {
                if (supabaseClient) {
                    const { data } = await supabaseClient
                        .from('icd10_mit')
                        .select('icd10_code, who_full_desc')
                        .or(`who_full_desc.ilike.%${q}%,icd10_code.ilike.${q}%`)
                        .limit(15);
                    results = (data || []).map(d => ({ code: d.icd10_code, description: d.who_full_desc }));
                } else {
                    const res = await fetch(`${API_BASE}/api/icd/search?q=${q}`);
                    results = await res.json();
                }
            } else if (type === 'drug') {
                if (supabaseClient) {
                    const { data } = await supabaseClient
                        .from('knowledge_map')
                        .select(`id, local_term, pharmacy_inventory ( stock_level )`)
                        .ilike('local_term', `%${q}%`)
                        .limit(15);

                    const uniqueMap = new Map();
                    (data || []).forEach(d => {
                        const name = (d.local_term || d.name || 'Drug (No Name)').trim();
                        const key = name.toLowerCase();

                        let stock = 0;
                        const inv = d.pharmacy_inventory;
                        if (Array.isArray(inv)) {
                            stock = inv.reduce((sum, i) => sum + (i.stock_level || 0), 0);
                        } else if (inv && typeof inv === 'object') {
                            stock = inv.stock_level || 0;
                        }

                        if (!uniqueMap.has(key)) {
                            uniqueMap.set(key, { id: d.id, local_term: name, stock: stock });
                        } else {
                            uniqueMap.get(key).stock += stock;
                        }
                    });

                    // ENRICHMENT: Resolve classes for the unique results using the backend
                    // We do this in parallel to keep it snappy
                    results = await Promise.all(Array.from(uniqueMap.values()).map(async (item) => {
                        try {
                            const res = await fetch(`${API_BASE}/api/resolve-drug-class?q=${encodeURIComponent(item.local_term)}`);
                            const classData = await res.json();
                            return { ...item, drug_class: classData.drug_class || 'unknown' };
                        } catch (e) {
                            return { ...item, drug_class: 'unknown' };
                        }
                    }));
                } else {
                    results = []; // No fallback for drugs if Supabase is missing
                }
            }

            suggestions.innerHTML = '';
            if (results.length > 0) {
                suggestions.classList.remove('hidden');
                results.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'px-4 py-2 cursor-pointer hover:bg-blue-50 text-sm border-b border-gray-100 transition-colors';

                    if (type === 'icd10') {
                        div.innerHTML = `<span class="font-bold text-blue-600 w-12 inline-block">${item.code}</span> <span class="text-gray-700">${item.description}</span>`;
                        div.onclick = () => { onSelect(item); suggestions.classList.add('hidden'); };
                    } else if (type === 'drug') {
                        const stockColor = item.stock > 10 ? 'text-emerald-600' : (item.stock > 0 ? 'text-orange-500' : 'text-red-500');
                        div.innerHTML = `
                            <div class="flex justify-between items-center px-1">
                                <div class="flex items-center">
                                    <div class="p-1.5 bg-gray-100 rounded mr-3 text-gray-500">
                                        <i data-feather="package" class="w-3.5 h-3.5"></i>
                                    </div>
                                    <span class="font-bold text-gray-800">${item.local_term}</span>
                                    ${item.drug_class && item.drug_class !== 'unknown' ? `<span class="ml-2 text-[9px] font-black bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded border border-emerald-100 uppercase tracking-tighter shadow-sm">${item.drug_class}</span>` : ''}
                                </div>
                                <div class="flex flex-col items-end">
                                    <span class="text-[10px] font-bold uppercase tracking-tighter text-gray-400">Inventory</span>
                                    <span class="text-xs font-black ${stockColor}">${item.stock}</span>
                                </div>
                            </div>`;
                        div.onclick = () => { onSelect(item); suggestions.classList.add('hidden'); };
                    }

                    suggestions.appendChild(div);
                });
                if (window.feather) feather.replace();
            } else { suggestions.classList.add('hidden'); }
        } catch (e) { console.error("Search Error:", e); }
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !suggestions.contains(e.target)) suggestions.classList.add('hidden');
    });
}

function renderComorbidities() {
    const list = document.getElementById('comorbidityList');
    if (!list) return;
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
    if (window.feather) feather.replace();
}

window.removeComorbidity = (idx) => { secondaryDiagnoses.splice(idx, 1); renderComorbidities(); }

function renderPrescriptions() {
    const list = document.getElementById('prescriptionList');
    if (!list) return;
    list.innerHTML = '';
    if (currentDrugsList.length === 0) {
        list.innerHTML = '<div class="px-4 py-3 text-gray-500 text-sm">No drugs added.</div>';
        return;
    }
    currentDrugsList.forEach((d, idx) => {
        const div = document.createElement('div');
        div.className = 'px-4 py-3 flex justify-between items-start border-b border-gray-100 last:border-0 transition-colors duration-200';

        let detailsHtml = '';
        if (d.ingredients && d.ingredients.length > 0) {
            const ingList = d.ingredients.map(i => `<span class="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[10px] mr-1 border border-blue-100">${i.name || 'Unknown'} ${i.strength || ''}</span>`).join('');
            detailsHtml = `<div class="mt-1"><p class="text-xs text-gray-500 font-medium mb-1">Contains:</p><div class="flex flex-wrap gap-1">${ingList}</div><p class="text-xs text-gray-500 mt-1 italic">${d.dosage || '--'} • ${d.frequency || '--'}</p></div>`;
        } else {
            detailsHtml = `<p class="text-xs text-gray-500">${d.dosage || '--'} • ${d.frequency || '--'}</p>`;
        }

        let classBadge = '';
        if (d.class && d.class !== 'unknown') {
            classBadge = `<span class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase tracking-wider">${d.class.replace(/_/g, ' ')}</span>`;
        } else if (d.class === 'unknown') {
            classBadge = `<span class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500 border border-gray-200 uppercase tracking-wider">Unknown Class</span>`;
        }

        div.innerHTML = `
            <div>
                <p class="font-bold text-gray-800 text-sm flex items-center flex-wrap gap-y-1">${d.name} ${classBadge}</p>
                ${detailsHtml}
            </div>
            <button onclick="removeDrug(${idx})" class="text-red-500 hover:text-red-700 mt-1"><i data-feather="trash-2" class="w-4 h-4"></i></button>
        `;
        list.appendChild(div);
    });
    if (window.feather) feather.replace();
}

window.removeDrug = (idx) => { currentDrugsList.splice(idx, 1); renderPrescriptions(); resetDDIStatus(); }

async function loadHistoryPanel(patientId) {
    const container = document.getElementById('historyContent');
    if (!container) return;
    try {
        const res = await fetch(`${API_BASE}/patient/history?patient_id=${patientId}`);
        const history = await res.json();
        container.innerHTML = '';
        if (history.length === 0) { container.innerHTML = '<div class="p-4 text-sm text-gray-400">No history found.</div>'; return; }

        history.forEach(h => {
            const date = new Date(h.created_at).toLocaleDateString();
            let title = h.assessment;
            if (h.assessment && h.assessment.includes("PRIMARY:")) {
                title = h.assessment.split('\n')[0].replace('PRIMARY:', '').trim();
            }
            const div = document.createElement('div');
            div.className = "p-4 bg-gray-50 border border-gray-200 rounded-lg mb-3 cursor-pointer hover:shadow-md transition-all";
            div.innerHTML = `<div class="flex justify-between mb-1"><span class="text-sm font-bold text-blue-700">${date}</span><span class="text-xs text-gray-500">Dr. ${h.doctors ? h.doctors.full_name : 'Unknown'}</span></div><h4 class="font-semibold text-gray-800 text-sm">${title || 'No Diagnosis'}</h4>`;
            container.appendChild(div);
        });
    } catch (e) { }
}

function updateSummary() {
    safeSetText('summaryCC', getVal('chiefComplaintInput'));
    safeSetText('summaryHistory', getVal('historyInput'));
    safeSetText('summaryBP', `${getVal('systolic')}/${getVal('diastolic')}`);
    safeSetText('summaryDiagnosis', getVal('primaryDiagnosisInput'));
    safeSetText('summaryInstructions', getVal('therapyInput'));
    const summaryMeds = document.getElementById('summaryMeds');
    if (summaryMeds) {
        if (currentDrugsList.length > 0) {
            summaryMeds.innerHTML = '<ul class="list-disc pl-4 space-y-1">' + currentDrugsList.map(d => `<li><strong>${d.name}</strong> - ${d.dosage}</li>`).join('') + '</ul>';
        } else {
            summaryMeds.textContent = "No medications.";
        }
    }
}

async function submitConsultation() {
    if (!confirm("Finalize EMR?")) return;
    const btn = document.getElementById('submitSummaryView');
    if (btn) { btn.textContent = "Processing..."; btn.disabled = true; }

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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("Error");

        const responseData = await res.json();
        if (responseData.interactions && responseData.interactions.length > 0) {
            alert("Consultation Saved with DDI Warnings:\n" + responseData.interactions.map(i => i.pair.join(' + ')).join("\n"));
        } else {
            alert("Consultation Saved Successfully!");
        }
        window.location.href = "APPOINTMENTS.html";
    } catch (e) {
        alert("Submit failed: " + e.message);
        if (btn) { btn.textContent = "Finalize & Submit EMR"; btn.disabled = false; }
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
            if (heroCard) heroCard.classList.add('hidden');
            if (emptyState) emptyState.classList.remove('hidden');
            safeSetText('stat-now-serving', "--");
            return;
        }
        if (emptyState) emptyState.classList.add('hidden');
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
            if (heroBtn) heroBtn.onclick = () => window.location.href = `EMR.html?id=${activeAppt.id}`;
        }
        appointments.slice(1).forEach(appt => {
            let p = appt.patients || { full_name: 'Unknown' };
            const div = document.createElement('div');
            div.className = "queue-card bg-white p-4 rounded-xl border border-slate-200 cursor-pointer mb-2";
            div.innerHTML = `<div class="flex justify-between items-center"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600">${appt.queue_number}</div><div><h4 class="font-bold text-sm text-slate-800">${p.full_name}</h4><p class="text-xs text-slate-500">${calculateAge(p.dob)} yrs</p></div></div><span class="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">Waiting</span></div>`;
            div.onclick = () => window.location.href = `EMR.html?id=${appt.id}`;
            container.appendChild(div);
        });
    } catch (e) { }
}

function safeSetText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val || '--'; }
function safeSetValue(id, val) { const el = document.getElementById(id); if (el && val) el.value = val; }
function getVal(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function calculateBMI() {
    const wEl = document.getElementById('weight');
    const hEl = document.getElementById('height');
    if (wEl && hEl) {
        const w = parseFloat(wEl.value);
        const h = parseFloat(hEl.value) / 100;
        if (w && h) {
            const bmiEl = document.getElementById('bmi');
            if (bmiEl) bmiEl.textContent = (w / (h * h)).toFixed(1);
        }
    }
}
function calculateAge(dob) { if (!dob) return '--'; return Math.floor((new Date() - new Date(dob)) / 31557600000); }





