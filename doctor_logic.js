// --- CONFIGURATION ---
const API_BASE = "https://smart-his-backend.onrender.com"; 

// Get ID from the Login Session
const DOCTOR_ID = localStorage.getItem('smart_his_user_id');
const DOCTOR_NAME = localStorage.getItem('smart_his_name');

// --- PAGE ROUTER ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Update UI Name
    const docNameEl = document.getElementById('doc-name-display');
    if (docNameEl && DOCTOR_NAME) {
        docNameEl.textContent = DOCTOR_NAME;
    }

    // 2. Start Clock
    startClock();

    // 3. Route
    const path = window.location.pathname;
    if (path.includes('APPOINTMENTS.html')) {
        initAppointmentsPage();
    } else if (path.includes('EMR.html')) {
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

// --- APPOINTMENTS PAGE LOGIC ---
async function initAppointmentsPage() {
    const container = document.getElementById('queue-container');
    const heroCard = document.getElementById('active-patient-card');
    const emptyState = document.getElementById('empty-state');
    
    if (!container) return;

    try {
        const res = await fetch(`${API_BASE}/doctor/queue?doctor_id=${DOCTOR_ID}`);
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        const appointments = await res.json();
        
        // --- 1. UPDATE STATS ---
        document.getElementById('stat-total').innerText = appointments.length;
        document.getElementById('stat-waiting').innerText = Math.max(0, appointments.length - 1);
        
        // Clear Lists
        container.innerHTML = ''; 

        if (appointments.length === 0) {
            heroCard.classList.add('hidden');
            emptyState.classList.remove('hidden');
            document.getElementById('stat-now-serving').innerText = "--";
            return;
        }

        emptyState.classList.add('hidden');

        // --- 2. RENDER HERO CARD (FIRST IN LINE) ---
        const activeAppt = appointments[0];
        const activeP = activeAppt.patients || { full_name: "Unknown", mrn: "N/A" };
        const activeT = (activeAppt.triage_notes && activeAppt.triage_notes.length > 0) ? activeAppt.triage_notes[0] : {};

        heroCard.classList.remove('hidden');
        document.getElementById('stat-now-serving').innerText = `A-${activeAppt.queue_number}`;
        
        document.getElementById('active-queue-no').innerText = `A-${activeAppt.queue_number}`;
        document.getElementById('active-name').innerText = activeP.full_name;
        document.getElementById('active-details').innerText = `MRN: ${activeP.mrn} • ${calculateAge(activeP.dob)} yrs • ${activeP.gender}`;
        document.getElementById('active-triage').innerText = `BP: ${activeT.systolic || '--'}/${activeT.diastolic || '--'}`;
        
        // Bind Button
        const heroBtn = document.getElementById('open-active-emr-btn');
        heroBtn.onclick = () => openEMR(activeAppt.id, activeP.full_name);


        // --- 3. RENDER QUEUE LIST (REMAINING ITEMS) ---
        const waitingList = appointments.slice(1);
        
        if (waitingList.length === 0) {
            container.innerHTML = `<div class="text-center text-sm text-gray-400 py-4">No other patients waiting.</div>`;
        } else {
            waitingList.forEach(appt => {
                const p = appt.patients || { full_name: "Unknown", mrn: "?" };
                const initial = p.full_name.charAt(0).toUpperCase();
                
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
        container.innerHTML = `<div class="text-red-500 text-sm">Connection failed. Is backend running?</div>`;
    }
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
