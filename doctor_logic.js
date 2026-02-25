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
let requestedLabs = [];
let lastDDIResults = [];

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

document.addEventListener('DOMContentLoaded', () => {
    // Standardized Profile Loader
    if (DOCTOR_NAME) {
        const nameEls = ['doc-name', 'doc-name-display', 'doc-name-finder', 'doc-name-checker', 'welcome-name'];
        nameEls.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (id === 'welcome-name') el.textContent = DOCTOR_NAME.split(' ')[0];
                else el.textContent = DOCTOR_NAME;
            }
        });

        const avatarEls = ['doc-avatar', 'doc-avatar-finder', 'doc-avatar-checker'];
        avatarEls.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(DOCTOR_NAME)}&background=6366f1&color=fff`;
            }
        });
    }

    if (document.getElementById('live-time')) startClock();
    else if (document.getElementById('current-time')) startClock();

    if (document.getElementById('queue-container')) {
        initAppointmentsPage();
    } else if (document.getElementById('mainContent')) {
        initEMRPage();
    }
});

function startClock() {
    const timeEl = document.getElementById('live-time') || document.getElementById('current-time');
    const dateEl = document.getElementById('live-date');
    if (!timeEl) return;
    function update() {
        const now = new Date();
        timeEl.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: (dateEl ? '2-digit' : undefined) });
        if (dateEl) {
            dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', day: '2-digit', month: 'short' });
        }
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
    const container = btnElement.closest('.pt-3').querySelector('.ai-response-box');

    btnElement.disabled = true;
    const originalText = btnElement.innerHTML;
    btnElement.innerHTML = `<i data-feather="loader" class="w-3.5 h-3.5 mr-1.5 animate-spin"></i> Analyzing...`;
    if (window.feather) feather.replace();

    container.classList.remove('hidden');
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-6 text-blue-600 space-y-3 animate-pulse">
            <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <i data-feather="terminal" class="w-5 h-5"></i>
            </div>
            <p class="text-[10px] font-black uppercase tracking-widest">Running Safety Logic...</p>
        </div>`;
    if (window.feather) feather.replace();

    try {
        const res = await fetch(`${API_BASE}/api/suggest-alternative`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ drug_to_replace: drugA, interacting_with: drugB })
        });

        const data = await res.json();

        if (data.alternatives && data.alternatives.length > 0) {
            let html = `<div class="mb-3 flex items-center justify-between border-b border-blue-200/50 pb-2">
                            <span class="text-[10px] font-black text-blue-700 uppercase tracking-widest">Suggested Swaps</span>
                            <span class="text-[9px] text-blue-500 font-bold bg-blue-100 px-2 py-0.5 rounded-full">Safe with ${drugB}</span>
                        </div>
                        <div class="space-y-2">`;

            data.alternatives.forEach(alt => {
                const altClass = alt.class.toLowerCase().replace(/_/g, ' ');
                html += `
                <div class="group relative flex items-center justify-between p-2.5 bg-white/70 rounded-xl border border-transparent hover:border-emerald-200 hover:bg-emerald-50 transition-all shadow-sm">
                    <div>
                        <p class="text-[11px] font-black text-gray-800 leading-tight">${alt.generic_name}</p>
                        <p class="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">${altClass}</p>
                    </div>
                    <button onclick="replaceDrug('${drugA.replace(/'/g, "\\'")}', '${alt.generic_name.replace(/'/g, "\\'")}', '${alt.class}')" 
                            class="px-3 py-1.5 bg-emerald-600 text-white text-[9px] font-black rounded-lg hover:bg-emerald-700 hover:shadow-md transition-all active:scale-95 shadow-sm">
                        SWAP
                    </button>
                </div>`;
            });
            html += `</div>
                     <p class="mt-3 text-[9px] text-gray-500 italic leading-tight">*Substitution based on therapeutic drug class equivalence and validated safe cross-rules.</p>`;
            container.innerHTML = html;
        } else {
            container.innerHTML = `
                <div class="p-3 bg-red-50 rounded-xl border border-red-100 text-center">
                    <i data-feather="slash" class="w-5 h-5 text-red-400 mx-auto mb-2"></i>
                    <p class="text-[10px] font-bold text-red-700 uppercase tracking-tighter">No Safe Alternatives</p>
                    <p class="text-[9px] text-red-600 mt-1">Our engine couldn't find an immediate therapeutic swap that avoids this interaction. Manual override required.</p>
                </div>`;
        }
        btnElement.classList.add('hidden');
    } catch (e) {
        container.innerHTML = `<p class="text-[10px] text-red-500">Error: ${e.message}</p>`;
        btnElement.disabled = false;
        btnElement.innerHTML = originalText;
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

        // 🤰 Pregnancy Alert Sync
        const pregAlert = document.getElementById('pt-pregnancy-alert');
        if (pregAlert) {
            const isPregnant = t.pregnancy_status === 'pregnant' ||
                (t.nurse_notes && t.nurse_notes.toLowerCase().includes('pregnant')) ||
                (data.assessment && data.assessment.toLowerCase().includes('pregnant'));

            if (isPregnant) {
                pregAlert.classList.remove('hidden');
                // Extract term if mentioned in assessment
                if (data.assessment && data.assessment.includes('20 Weeks')) pregAlert.innerText = "🤰 Pregnant (20w)";
            }
        }

        // --- Populate the "Nurse Notes" UI from Nurse Triage ---
        safeSetText('nurse-notes-text', t.chief_complaint || t.nurse_notes || "No notes recorded by nurse.");
        safeSetText('pain-score', t.pain_score !== null && t.pain_score !== undefined ? t.pain_score : '--');
        safeSetText('pain-location', t.pain_location || '--');

        loadHistoryPanel(p.id);
        loadLabResults(p.id);

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

    const addLabBtn = document.getElementById('addLabRequestBtn');
    if (addLabBtn) addLabBtn.onclick = addLabRequest;

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

    // Sidebar indicator logic
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

    if (isSafe) {
        container.innerHTML = `
            <div class="mt-2 p-6 bg-emerald-50 border border-emerald-100 rounded-2xl flex flex-col items-center text-center text-emerald-800 animate-fade-in shadow-sm">
                <div class="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4 shadow-inner">
                    <i data-feather="check-circle" class="w-8 h-8 text-emerald-600"></i>
                </div>
                <h4 class="font-black text-lg mb-1 uppercase tracking-tight">Prescription Safe</h4>
                <p class="text-emerald-600/80 text-xs font-medium px-4">No major drug-drug interactions detected. You proceed with the current combination.</p>
            </div>`;
        if (window.feather) feather.replace();
        return;
    }

    // --- 1. DASHBOARD SUMMARY ---
    const majorCount = interactions.filter(i => i.severity === 'Major').length;
    const intermediateCount = interactions.filter(i => i.severity === 'Intermediate' || i.severity === 'Moderate').length;
    const minorCount = interactions.filter(i => i.severity === 'Minor' || i.severity === 'Info').length;

    const dashboard = document.createElement('div');
    dashboard.className = "mb-6 grid grid-cols-4 gap-1.5 sticky top-0 bg-gray-50 pt-2 pb-4 z-10 border-b border-gray-200";
    dashboard.innerHTML = `
        <button onclick="filterDDI('Major')" class="flex flex-col items-center p-2 rounded-xl border bg-white shadow-sm hover:border-red-500 transition-all group ${majorCount > 0 ? 'border-red-100' : 'opacity-50 grayscale border-gray-100'}">
            <span class="text-xs font-black text-red-600">${majorCount}</span>
            <span class="text-[8px] font-bold text-gray-400 uppercase tracking-tighter">Major</span>
        </button>
        <button onclick="filterDDI('Moderate')" class="flex flex-col items-center p-2 rounded-xl border bg-white shadow-sm hover:border-orange-500 transition-all group ${intermediateCount > 0 ? 'border-orange-100' : 'opacity-50 grayscale border-gray-100'}">
            <span class="text-xs font-black text-orange-500">${intermediateCount}</span>
            <span class="text-[8px] font-bold text-gray-400 uppercase tracking-tighter">Interm.</span>
        </button>
        <button onclick="filterDDI('Minor')" class="flex flex-col items-center p-2 rounded-xl border bg-white shadow-sm hover:border-amber-400 transition-all group ${minorCount > 0 ? 'border-amber-100' : 'opacity-50 grayscale border-gray-100'}">
            <span class="text-xs font-black text-amber-500">${minorCount}</span>
            <span class="text-[8px] font-bold text-gray-400 uppercase tracking-tighter">Minor</span>
        </button>
        <button onclick="filterDDI('All')" class="flex flex-col items-center p-2 rounded-xl border bg-white shadow-sm hover:border-blue-500 transition-all group border-blue-100">
            <span class="text-xs font-black text-blue-600">${interactions.length}</span>
            <span class="text-[8px] font-bold text-gray-400 uppercase tracking-tighter">Total</span>
        </button>
    `;
    container.appendChild(dashboard);

    // --- 2. INTERACTION LIST ---
    const list = document.createElement('div');
    list.className = "space-y-3 animate-fade-in pb-12";
    list.id = "ddiResultsList";

    interactions.forEach((item, idx) => {
        let theme = { bg: "bg-white", border: "border-gray-200", badge: "bg-gray-100 text-gray-500", icon: "help-circle", glow: "" };

        if (item.severity === "Major") {
            theme = { bg: "bg-red-50", border: "border-red-200", badge: "bg-red-600 text-white", icon: "alert-octagon", glow: "shadow-[0_0_15px_rgba(239,68,68,0.1)]" };
        } else if (item.severity === "Intermediate" || item.severity === "Moderate") {
            theme = { bg: "bg-orange-50", border: "border-orange-200", badge: "bg-orange-500 text-white", icon: "alert-triangle", glow: "" };
        } else if (item.severity === "Minor" || item.severity === "Info") {
            theme = { bg: "bg-amber-50/30", border: "border-amber-100/50", badge: "bg-amber-400 text-white", icon: "info", glow: "" };
        }

        const card = document.createElement('div');
        card.className = `ddi-card relative overflow-hidden rounded-2xl border ${theme.border} ${theme.bg} ${theme.glow} transition-all duration-300 group`;
        card.dataset.severity = (item.severity === 'Major') ? 'Major' : (item.severity === 'Minor' || item.severity === 'Info' ? 'Minor' : 'Moderate');

        card.innerHTML = `
            <!-- COMPACT HEADER (Always Visible) -->
            <div class="px-4 py-3 cursor-pointer flex justify-between items-center" onclick="this.parentElement.classList.toggle('is-expanded')">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full ${theme.badge} flex items-center justify-center shadow-sm">
                        <i data-feather="${theme.icon}" class="w-4 h-4"></i>
                    </div>
                    <div>
                        <h4 class="font-bold text-gray-800 text-[12px] leading-tight">${item.pair[0]} + ${item.pair[1]}</h4>
                        <span class="text-[9px] font-black uppercase tracking-widest opacity-60">${item.severity} Risk</span>
                    </div>
                </div>
                <i data-feather="chevron-down" class="w-4 h-4 text-gray-400 transition-transform duration-300 chevron-icon"></i>
            </div>

            <!-- EXPANDABLE CONTENT -->
            <div class="ddi-details hidden px-4 pb-4 animate-slide-down">
                <div class="pt-2 border-t border-gray-200/50 space-y-4">
                    <div>
                        <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 flex items-center">
                            <span class="w-1.5 h-1.5 rounded-full bg-blue-500 mr-2"></span> Mechanism
                        </p>
                        <p class="text-xs text-gray-700 leading-relaxed font-medium">${item.description}</p>
                    </div>

                    <div class="p-3 bg-white/60 rounded-xl border border-gray-200/50 shadow-inner">
                        <p class="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1.5 flex items-center">
                            <i data-feather="activity" class="w-3 h-3 mr-2"></i> Clinical Advice
                        </p>
                        <p class="text-xs text-gray-900 font-bold leading-tight">${item.advice}</p>
                    </div>

                    <!-- RESOLUTION ACTIONS -->
                    <div class="pt-3 border-t border-gray-200/30">
                        <div class="flex gap-2">
                             <button onclick="askAlgorithmForAlternative('${item.pair[0].replace(/'/g, "\\'")}', '${item.pair[1].replace(/'/g, "\\'")}', this)" 
                                    class="flex-1 text-[9px] font-black bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-all shadow-sm flex items-center justify-center">
                                <i data-feather="refresh-cw" class="w-3 h-3 mr-1.5"></i> Replace ${item.pair[0]}
                            </button>
                            <button onclick="askAlgorithmForAlternative('${item.pair[1].replace(/'/g, "\\'")}', '${item.pair[0].replace(/'/g, "\\'")}', this)" 
                                    class="flex-1 text-[9px] font-black bg-white text-gray-700 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-all shadow-sm flex items-center justify-center">
                                <i data-feather="refresh-cw" class="w-3 h-3 mr-1.5"></i> Replace ${item.pair[1]}
                            </button>
                        </div>
                        <div class="ai-response-box hidden mt-3 p-3 bg-blue-50/50 rounded-xl border border-blue-100 shadow-inner overflow-hidden"></div>
                    </div>
                </div>
            </div>
        `;
        list.appendChild(card);
    });

    container.appendChild(list);
    if (window.feather) feather.replace();

    // Auto-expand the first Major interaction if any
    const firstMajor = container.querySelector('.ddi-card[data-severity="Major"]');
    if (firstMajor) firstMajor.classList.add('is-expanded');
}

window.filterDDI = (severity) => {
    const items = document.querySelectorAll('.ddi-card');
    items.forEach(item => {
        if (severity === 'All') {
            item.classList.remove('hidden');
        } else if (severity === 'Moderate') {
            item.classList.toggle('hidden', item.dataset.severity !== 'Moderate');
        } else {
            item.classList.toggle('hidden', item.dataset.severity !== severity);
        }
    });
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

window.replaceDrug = (oldName, newName, newClass) => {
    const idx = currentDrugsList.findIndex(d => d.name === oldName);
    if (idx !== -1) {
        currentDrugsList[idx] = {
            ...currentDrugsList[idx],
            name: newName,
            class: newClass || 'unknown'
        };
        renderPrescriptions();
        runDDICheck(); // Automatically re-run to confirm safety
    }
}

async function loadHistoryPanel(patientId) {
    const container = document.getElementById('historyContent');
    if (!container) return;

    try {
        let history = [];
        try {
            const res = await fetch(`${API_BASE}/patient/history?patient_id=${patientId}`);
            if (res.ok) history = await res.json();
        } catch (e) {
            console.warn("Backend fail, falling back", e);
        }

        if ((!history || history.length === 0) && supabaseClient) {
            const { data: appts } = await supabaseClient.from('appointments').select('id').eq('patient_id', patientId);
            if (appts && appts.length > 0) {
                const { data: consults } = await supabaseClient.from('consultations').select('*, doctors:profiles!doctor_id(full_name)').in('appointment_id', appts.map(a => a.id));
                if (consults) history = consults;
            }
        }

        container.innerHTML = '';
        if (!history || history.length === 0) {
            container.innerHTML = '<div class="p-8 text-center"><div class="text-gray-300 mb-2"><i data-feather="clock" class="w-12 h-12 mx-auto opacity-20"></i></div><p class="text-sm text-gray-400">No medical history found for this patient.</p></div>';
            if (window.feather) feather.replace();
            return;
        }

        history.forEach(h => {
            const date = new Date(h.created_at).toLocaleDateString();
            let title = h.assessment || 'No Diagnosis';
            if (h.assessment && h.assessment.includes("PRIMARY:")) {
                const parts = h.assessment.split('\n');
                title = parts[0].replace('PRIMARY:', '').trim();
            }

            const div = document.createElement('div');
            div.className = "group p-4 bg-white border border-gray-100 rounded-xl mb-3 hover:border-blue-400 hover:shadow-md transition-all duration-200 relative";
            div.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <span class="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded">${date}</span>
                    <button onclick="window.importHistoryToForm(${JSON.stringify(h).replace(/"/g, '&quot;')})" 
                            class="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <i data-feather="copy" class="w-3 h-3"></i>
                        <span class="text-[10px] font-bold uppercase tracking-widest">Import</span>
                    </button>
                    <span class="text-[10px] font-medium text-gray-400">Dr. ${h.doctors ? h.doctors.full_name : 'Medical Staff'}</span>
                </div>
                <h4 class="font-bold text-gray-800 text-sm mb-1">${title}</h4>
                <p class="text-xs text-gray-500 line-clamp-2">${h.plan || 'No plan notes.'}</p>
            `;
            container.appendChild(div);
        });
        if (window.feather) feather.replace();
    } catch (e) {
        console.error("Critical error in history panel:", e);
        container.innerHTML = '<div class="p-4 text-xs text-red-400">Error loading medical history.</div>';
    }
}

window.importHistoryToForm = (h) => {
    if (!confirm("Load this past record into your current consultation form? (This will overwrite current inputs)")) return;

    // Fix for database escaped newlines (e.g. \\n becoming real \n)
    const sub = (h.subjective || "").replace(/\\n/g, '\n');
    const ass = (h.assessment || "").replace(/\\n/g, '\n');

    // 1. SMART Subjective (CC & HPI)
    // If prefixes are missing, treat the whole thing as HPI (Anamnesis)
    if (sub.includes("CC:") || sub.includes("HPI:")) {
        const cc = (sub.match(/CC:\s*([^\n]*)/i) || [])[1] || "";
        const hpi = (sub.match(/HPI:\s*([\s\S]*)/i) || [])[1] || "";
        safeSetValue('chiefComplaintInput', cc.trim());
        safeSetValue('historyInput', hpi.trim());
    } else {
        // Fallback: If no prefix, assume everything is History and CC is inferred from first phrase
        safeSetValue('chiefComplaintInput', sub.split('.')[0].trim());
        safeSetValue('historyInput', sub.trim());
    }

    // 2. SMART Assessment (Diagnosis & ICD)
    // Avoid capturing 'Secondary:' or 'NOTES:' into the primary diagnosis field
    const primary = (ass.match(/PRIMARY:\s*([^\[\n\r]*)/i) || [])[1] || "";
    const icd = (ass.match(/\[([^\]]*)\]/) || [])[1] || "";
    const notes = (ass.match(/NOTES:\s*([\s\S]*)/i) || [])[1] || "";

    // If PRIMARY prefix was missing entirely (old records)
    if (!primary && ass) {
        safeSetValue('primaryDiagnosisInput', ass.split('\n')[0].trim());
    } else {
        safeSetValue('primaryDiagnosisInput', primary.trim());
    }

    safeSetValue('primaryICDInput', icd.trim());
    safeSetValue('analysisNotesInput', notes.trim());

    // 3. Plan
    safeSetValue('therapyInput', h.plan || "");

    // 4. SMART Prescriptions
    if (h.prescription_raw_text) {
        try {
            // Support both JSON array format and potential Python string format
            let raw = h.prescription_raw_text;
            if (raw.startsWith("[") && raw.includes("'")) {
                // Convert Python-style list of dicts to JSON (Single quote to Double quote)
                // WARNING: This is a hacky fallback for legacy data
                raw = raw.replace(/'/g, '"');
            }
            const drugs = JSON.parse(raw);
            if (Array.isArray(drugs)) {
                currentDrugsList = drugs;
                renderPrescriptions();
                resetDDIStatus();
            }
        } catch (e) {
            console.warn("Could not parse prescription_raw_text:", e);
        }
    }

    // 5. UI Transition
    alert("Data imported successfully!");
    document.getElementById('rightPanel').classList.add('translate-x-full');
    if (window.switchView) window.switchView('nurse'); // Start at beginning of clinical flow
}



async function loadLabResults(patientId) {
    const container = document.getElementById('labContent');
    if (!container) return;

    try {
        container.innerHTML = '<div class="p-8 text-center text-gray-300"><i data-feather="loader" class="animate-spin w-8 h-8 mx-auto mb-2 opacity-50"></i><p class="text-sm">Fetching lab records...</p></div>';
        if (window.feather) feather.replace();

        let labs = [];
        if (supabaseClient) {
            const { data, error } = await supabaseClient
                .from('lab_results')
                .select('*')
                .eq('patient_id', patientId)
                .order('created_at', { ascending: false });
            if (!error) labs = data;
        }

        container.innerHTML = '';
        if (!labs || labs.length === 0) {
            container.innerHTML = '<div class="p-8 text-center"><div class="text-gray-300 mb-2"><i data-feather="activity" class="w-12 h-12 mx-auto opacity-20"></i></div><p class="text-sm text-gray-400">No laboratory results found.</p></div>';
            if (window.feather) feather.replace();
            return;
        }

        // Group by category
        const categories = [...new Set(labs.map(l => l.test_category))];

        categories.forEach(cat => {
            const catHeader = document.createElement('div');
            catHeader.className = "text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-4 mb-2 first:mt-0";
            catHeader.textContent = cat || "General";
            container.appendChild(catHeader);

            labs.filter(l => l.test_category === cat).forEach(lab => {
                const date = new Date(lab.created_at).toLocaleDateString();
                const div = document.createElement('div');
                div.className = "p-3 bg-white border border-gray-100 rounded-lg mb-2 flex justify-between items-center shadow-sm";
                div.innerHTML = `
                    <div>
                        <p class="text-xs font-bold text-gray-700">${lab.test_name} <span class="bg-indigo-50 text-indigo-600 text-[9px] px-1 py-0.5 rounded ml-1 tracking-widest font-mono" title="International LOINC Standard">LOINC: ${lab.loinc_code || 'N/A'}</span></p>
                        <p class="text-[10px] text-gray-400">${date}</p>
                    </div>
                    <div class="text-right">
                        <span class="text-sm font-black text-blue-600">${lab.result_value}</span>
                        <p class="text-[9px] text-gray-400 uppercase font-bold">${lab.status}</p>
                    </div>
                `;
                container.appendChild(div);
            });
        });
        if (window.feather) feather.replace();
    } catch (e) {
        container.innerHTML = '<div class="p-4 text-xs text-red-400">Error loading laboratory results.</div>';
    }
}


function updateSummary() {
    // Basic Patient Info
    safeSetText('summary-pt-name', document.getElementById('pt-name')?.textContent || 'Unknown Patient');
    safeSetText('summary-pt-id', document.getElementById('pt-id')?.textContent || 'MRN: ---');
    safeSetText('summary-doc-name', DOCTOR_NAME || 'Medical Professional');
    safeSetText('summary-timestamp', new Date().toLocaleString());

    // SOAP - Subjective
    safeSetText('summaryCC', getVal('chiefComplaintInput') || 'Not specified');
    safeSetText('summaryHistory', getVal('historyInput') || 'No additional history provided.');

    // SOAP - Objective (Vitals)
    safeSetText('summaryBP', `${getVal('systolic')}/${getVal('diastolic')}`);
    safeSetText('summaryTemp', getVal('temperature') || '--');
    safeSetText('summaryWeight', getVal('weight') || '--');
    safeSetText('summaryBMI', document.getElementById('bmi')?.textContent || '--');

    // SOAP - Assessment
    safeSetText('summaryDiagnosis', getVal('primaryDiagnosisInput') || 'No primary diagnosis');
    const icdVal = getVal('primaryICDInput');
    safeSetText('summaryICD', icdVal ? `ICD-10: ${icdVal}` : 'No ICD-10 code');
    safeSetText('summaryAnalysis', getVal('analysisNotesInput') || 'No additional analysis notes.');

    // Secondary diagnoses
    const secondaryList = document.getElementById('summarySecondaryList');
    if (secondaryList) {
        secondaryList.innerHTML = '';
        if (secondaryDiagnoses.length > 0) {
            secondaryDiagnoses.forEach(d => {
                const div = document.createElement('div');
                div.className = "flex justify-between items-center p-2 bg-gray-50 rounded-lg text-xs border border-gray-100";
                div.innerHTML = `<span class="font-bold text-gray-700">${d.description}</span> <span class="text-purple-600 font-mono font-bold">${d.code}</span>`;
                secondaryList.appendChild(div);
            });
        }
    }

    // SOAP - Plan (Labs & Drugs)
    safeSetText('summaryLabCount', requestedLabs.length);
    const labList = document.getElementById('summaryLabList');
    if (labList) {
        labList.innerHTML = '';
        if (requestedLabs.length > 0) {
            requestedLabs.forEach(lab => {
                const div = document.createElement('div');
                div.className = "p-2 bg-indigo-50/50 rounded-lg border border-indigo-100 flex justify-between items-center";
                div.innerHTML = `
                    <span class="text-xs font-bold text-indigo-700">${lab.name}</span>
                    <span class="text-[9px] font-black text-indigo-400 font-mono tracking-widest">${lab.code}</span>
                `;
                labList.appendChild(div);
            });
        } else {
            labList.innerHTML = '<p class="text-xs text-gray-400 italic">No investigations ordered.</p>';
        }
    }

    safeSetText('summaryDrugCount', currentDrugsList.length);
    const summaryMeds = document.getElementById('summaryMeds');
    if (summaryMeds) {
        summaryMeds.innerHTML = '';
        if (currentDrugsList.length > 0) {
            currentDrugsList.forEach(d => {
                const div = document.createElement('div');
                div.className = "p-2 bg-emerald-50/50 rounded-lg border border-emerald-100";
                div.innerHTML = `
                    <p class="text-xs font-bold text-gray-800">${d.name}</p>
                    <p class="text-[10px] text-emerald-600 font-medium">${d.dosage} | ${d.frequency || 'Sig: As directed'}</p>
                `;
                summaryMeds.appendChild(div);
            });
        } else {
            summaryMeds.innerHTML = '<p class="text-xs text-gray-400 italic">No medications prescribed.</p>';
        }
    }

    safeSetText('summaryInstructions', getVal('therapyInput') || 'General clinical monitoring and follow-up as advised.');

    // Refresh icons in the summary
    if (window.feather) feather.replace();
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
        prescription_items: currentDrugsList,
        lab_requests: requestedLabs
    };

    try {
        // First, handle Lab Requests if any
        if (requestedLabs.length > 0 && supabaseClient) {
            const labPayloads = requestedLabs.map(lab => ({
                patient_id: currentPatientId,
                doctor_id: DOCTOR_ID,
                test_category: lab.category,
                test_name: lab.name,
                loinc_code: lab.code,
                clinical_notes: getVal('labNotesInput'),
                status: 'requested'
            }));
            const { error: labError } = await supabaseClient.from('lab_results').insert(labPayloads);
            if (labError) console.error("Lab Request Error:", labError);
        }
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

function renderRequestedLabs() {
    const list = document.getElementById('requestedLabsList');
    if (!list) return;
    list.innerHTML = '';
    if (requestedLabs.length === 0) {
        list.innerHTML = '<p class="text-xs text-gray-400 italic px-2">No investigations requested yet.</p>';
        return;
    }
    requestedLabs.forEach((lab, idx) => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center p-2 bg-white border border-gray-100 rounded-lg shadow-sm';
        div.innerHTML = `
            <div>
                <p class="text-xs font-bold text-gray-700">${lab.name}</p>
                <p class="text-[10px] text-indigo-600 font-bold uppercase tracking-widest">${lab.category} | ${lab.code}</p>
            </div>
            <button onclick="removeLabRequest(${idx})" class="text-gray-300 hover:text-red-500 transition-colors"><i data-feather="x" class="w-4 h-4"></i></button>
        `;
        list.appendChild(div);
    });
    if (window.feather) feather.replace();
}

window.updateLabTestOptions = () => {
    const catEl = document.getElementById('labCategorySelect');
    const testEl = document.getElementById('labTestSelect');
    const cat = catEl.value;

    testEl.innerHTML = '<option value="">-- Select Test --</option>';
    if (!cat || !LOINC_DB[cat]) {
        testEl.disabled = true;
        return;
    }

    testEl.disabled = false;
    LOINC_DB[cat].forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.name;
        opt.dataset.code = t.code;
        opt.textContent = `${t.name} (${t.code})`;
        testEl.appendChild(opt);
    });
};

function addLabRequest() {
    const catEl = document.getElementById('labCategorySelect');
    const testEl = document.getElementById('labTestSelect');

    if (!catEl.value || !testEl.value) return alert("Select category and test.");

    const selected = testEl.options[testEl.selectedIndex];
    requestedLabs.push({
        category: catEl.value,
        name: testEl.value,
        code: selected.dataset.code
    });

    renderRequestedLabs();
    testEl.value = '';
}

window.removeLabRequest = (idx) => {
    requestedLabs.splice(idx, 1);
    renderRequestedLabs();
};
