// --- CONFIGURATION ---
// PRODUCTION URL
const API_BASE = "https://smart-his-backend.onrender.com"; 

// Get ID from the Login Session (set in login_logic.js)
const DOCTOR_ID = localStorage.getItem('smart_his_user_id');
const DOCTOR_NAME = localStorage.getItem('smart_his_name');

// --- PAGE ROUTER ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check
    if (!DOCTOR_ID && !window.location.pathname.includes('index.html')) {
        // window.location.href = 'index.html'; // Uncomment to enforce auth
        console.warn("No Doctor ID found in session. Ensure you logged in.");
    }

    // 2. Update UI with Doctor Name
    const docNameEl = document.getElementById('doc-name-display');
    if (docNameEl && DOCTOR_NAME) {
        docNameEl.textContent = DOCTOR_NAME;
    }

    // 3. Start Clock
    startClock();

    // 4. Route to Page Logic
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
    console.log(`Fetching Queue for Doctor: ${DOCTOR_ID}`);
    const container = document.getElementById('queue-container');
    
    if (!container) return;

    container.innerHTML = `
        <div class="col-span-full flex justify-center p-12">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
    `;

    try {
        const res = await fetch(`${API_BASE}/doctor/queue?doctor_id=${DOCTOR_ID}`);
        
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        
        const appointments = await res.json();
        
        // --- SYNC STATS ---
        updateDashboardStats(appointments);

        container.innerHTML = ''; // Clear loading

        if (appointments.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
                    <div class="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i data-feather="coffee" class="text-slate-400"></i>
                    </div>
                    <h3 class="text-slate-900 font-medium">No Active Patients</h3>
                    <p class="text-slate-500 text-sm mt-1">Your queue is currently empty.</p>
                </div>
            `;
            if (window.feather) feather.replace();
            return;
        }

        // Render Real Data
        appointments.forEach(appt => {
            const patient = appt.patients || { full_name: "Unknown", mrn: "N/A", dob: null };
            const triage = (appt.triage_notes && appt.triage_notes.length > 0) ? appt.triage_notes[0] : null;

            const complaint = triage ? triage.chief_complaint : 'No triage data available';
            const bp = triage ? `${triage.systolic}/${triage.diastolic}` : '--/--';
            const hr = triage ? `${triage.heart_rate} bpm` : '--';
            const temp = triage ? `${triage.temperature}°C` : '--';

            const card = document.createElement('div');
            card.className = "group relative bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 hover:border-indigo-100 cursor-pointer";
            card.onclick = () => openEMR(appt.id, patient.full_name);

            card.innerHTML = `
                <div class="flex justify-between items-start mb-4">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm">
                            ${getInitials(patient.full_name)}
                        </div>
                        <div>
                            <h3 class="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">${patient.full_name}</h3>
                            <p class="text-xs text-slate-500">MRN: ${patient.mrn}</p>
                        </div>
                    </div>
                    <span class="px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(appt.status)}">
                        ${capitalize(appt.status)}
                    </span>
                </div>

                <div class="space-y-3">
                    <div class="flex items-start space-x-2.5">
                        <div class="mt-0.5 min-w-[16px]"><i data-feather="activity" class="w-4 h-4 text-slate-400"></i></div>
                        <p class="text-sm text-slate-600 leading-snug line-clamp-2">${complaint}</p>
                    </div>
                    
                    <div class="flex items-center space-x-4 text-xs text-slate-500 pl-7">
                        <span class="flex items-center" title="Blood Pressure"><i data-feather="heart" class="w-3 h-3 mr-1"></i> ${bp}</span>
                        <span class="flex items-center" title="Heart Rate"><i data-feather="zap" class="w-3 h-3 mr-1"></i> ${hr}</span>
                        <span class="flex items-center" title="Temperature"><i data-feather="thermometer" class="w-3 h-3 mr-1"></i> ${temp}</span>
                    </div>
                </div>

                <div class="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center">
                    <div class="text-xs font-medium text-slate-400">
                        Queue #${appt.queue_number}
                    </div>
                    <div class="flex items-center text-indigo-600 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-[-10px] group-hover:translate-x-0">
                        Open EMR <i data-feather="arrow-right" class="w-4 h-4 ml-1"></i>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });

        if (window.feather) feather.replace();

    } catch (err) {
        console.error("Queue Error:", err);
        container.innerHTML = `
            <div class="col-span-full bg-red-50 text-red-600 p-4 rounded-xl text-center border border-red-100">
                <p class="font-medium">Connection Failed</p>
                <p class="text-sm opacity-80 mt-1">Could not fetch queue. Ensure Backend is running.</p>
            </div>
        `;
    }
}

function updateDashboardStats(appointments) {
    const totalEl = document.getElementById('stat-total');
    if (totalEl) totalEl.innerText = appointments.length;

    const waitEl = document.getElementById('stat-wait');
    if (waitEl) {
        if (appointments.length === 0) {
            waitEl.innerText = "0";
        } else {
            let totalWait = 0;
            const now = new Date();
            appointments.forEach(a => {
                const startTime = new Date(a.scheduled_time || a.created_at);
                const diffMs = now - startTime;
                totalWait += diffMs;
            });
            const avgMins = Math.floor((totalWait / appointments.length) / 60000);
            waitEl.innerText = Math.max(0, avgMins);
        }
    }

    const criticalEl = document.getElementById('stat-critical');
    if (criticalEl) {
        const criticalCount = appointments.filter(a => {
            const t = (a.triage_notes && a.triage_notes.length > 0) ? a.triage_notes[0] : null;
            if (!t) return false;
            return (t.temperature > 39.0 || t.systolic > 160);
        }).length;
        criticalEl.innerText = criticalCount;
    }
}

function openEMR(apptId, patientName) {
    window.location.href = `EMR.html?id=${apptId}&patient=${encodeURIComponent(patientName)}`;
}

// --- HELPER FUNCTIONS ---
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

// --- EMR PAGE LOGIC STUBS ---
function initEMRPage() {
    console.log("Initializing EMR...");
}
