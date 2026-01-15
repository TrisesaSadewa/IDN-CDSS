// --- CONFIGURATION ---
const API_BASE = "https://smart-his-backend.onrender.com"; 

// Get ID from the Login Session
const DOCTOR_ID = localStorage.getItem('smart_his_user_id');
const DOCTOR_NAME = localStorage.getItem('smart_his_name');

// --- PAGE ROUTER ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Doctor Logic Loaded - v3.5"); // Debugging Log

    // 1. Update UI Name
    const docNameEl = document.getElementById('doc-name-display');
    if (docNameEl && DOCTOR_NAME) {
        docNameEl.textContent = DOCTOR_NAME;
    }

    // 2. Start Clock
    startClock();

    // 3. Route
    // We check for specific elements to determine the page, rather than just URL
    if (document.getElementById('queue-container')) {
        initAppointmentsPage();
    } else if (document.getElementById('soap-subjective')) {
        initEMRPage(); // Logic for EMR page if needed
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

// --- APPOINTMENTS PAGE LOGIC ---
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
        // We wrap this in a helper to prevent crashing if an ID is missing
        safeSetText('stat-total', appointments.length);
        safeSetText('stat-waiting', Math.max(0, appointments.length - 1));
        
        // --- 2. CLEAR LOADING STATE ---
        // We do this BEFORE processing data to ensure "Loading..." goes away
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

function initEMRPage() {
    console.log("Initializing EMR...");
}
