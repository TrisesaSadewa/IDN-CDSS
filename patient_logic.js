// CONFIGURATION
const API_BASE = "https://smart-his-backend.onrender.com";

// GLOBAL STATE
let currentUser = {
    name: localStorage.getItem('smart_his_name') || "Patient",
    id: localStorage.getItem('smart_his_user_id'),
    role: localStorage.getItem('smart_his_role')
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Update Navbar Name
    const nameEls = document.querySelectorAll('#welcome-name, #patient-name');
    nameEls.forEach(el => el.textContent = currentUser.name);

    // 2. ROUTER
    const doctorSelect = document.getElementById('doctor-select');

    if (doctorSelect) {
        initBookingPage();
    }
    else if (document.getElementById('timeline-container')) {
        setupPortal();
    }
});

// --- PORTAL DASHBOARD ---
async function setupPortal() {
    try {
        const res = await fetch(`${API_BASE}/patient/profile?user_id=${currentUser.id}`);
        if (res.ok) {
            const profile = await res.json();
            const mrnEl = document.getElementById('patient-mrn');
            if (mrnEl) mrnEl.textContent = profile.mrn || 'N/A';

            // Gender check for pregnancy tracker
            if (profile.gender === 'female') {
                checkPregnancyStatus();
            }
        }
    } catch (e) { console.error("Profile Error", e); }

    await loadNextAppointment();
    await loadEMRHistory(true);
}

// --- PREGNANCY DETECTION ---
async function checkPregnancyStatus() {
    const tracker = document.getElementById('pregnancy-tracker');
    if (!tracker) return;

    try {
        const res = await fetch(`${API_BASE}/patient/history?patient_id=${currentUser.id}`);
        const records = await res.json();

        // Check if any triage note has pregnancy_status = 'pregnant'
        // OR if any assessment mentions pregnancy
        const isPregnant = records.some(rec =>
            rec.pregnancy_status === 'pregnant' ||
            (rec.assessment && (
                rec.assessment.toLowerCase().includes('pregnant') ||
                rec.assessment.toLowerCase().includes('pregnancy') ||
                rec.assessment.toLowerCase().includes('gravida') ||
                rec.assessment.toLowerCase().includes('hamil')
            ))
        );

        if (isPregnant) {
            tracker.classList.remove('hidden');
            const alertPanel = document.getElementById('clinical-alerts');
            if (alertPanel) alertPanel.classList.remove('hidden');
        }
    } catch (e) {
        console.error("Pregnancy Status Error", e);
    }
}

// --- FETCH NEXT APPOINTMENT ---
async function loadNextAppointment() {
    const container = document.getElementById('next-appt-card');
    const noApptMsg = document.getElementById('no-appt-msg');

    if (!container) return;

    try {
        const res = await fetch(`${API_BASE}/patient/appointments?patient_id=${currentUser.id}`);
        const appts = await res.json();

        if (appts && appts.length > 0) {
            const next = appts[0];
            const docName = next.doctor ? next.doctor.full_name : 'Unknown Doctor';
            const docSpec = next.doctor ? (next.doctor.specialization || 'General') : '';

            const dateObj = new Date(next.scheduled_time);
            const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            document.getElementById('next-appt-date').textContent = `${dateStr} • ${timeStr}`;
            document.getElementById('next-appt-doc').textContent = docName;
            document.getElementById('next-appt-spec').textContent = docSpec;

            container.classList.remove('hidden');
            if (noApptMsg) noApptMsg.classList.add('hidden');
        } else {
            container.classList.add('hidden');
            if (noApptMsg) noApptMsg.classList.remove('hidden');
        }
    } catch (e) {
        console.error("Appt Fetch Error", e);
    }
}

// --- APPOINTMENT BOOKING ---
async function initBookingPage() {
    const doctorSelect = document.getElementById('doctor-select');
    const bookForm = document.getElementById('booking-form');
    if (!doctorSelect) return;

    try {
        const res = await fetch(`${API_BASE}/patient/doctors`);
        const doctors = await res.json();
        doctorSelect.innerHTML = doctors.length ?
            doctors.map(d => `<option value="${d.id}">${d.full_name} (${d.specialization || 'General'})</option>`).join('') :
            `<option>No doctors found</option>`;
    } catch (e) {
        doctorSelect.innerHTML = `<option>Error loading doctors</option>`;
    }

    if (bookForm) {
        bookForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const doctorId = doctorSelect.value;
            const date = document.getElementById('book-date').value;
            const time = document.getElementById('book-time').value;

            if (!date || !time) { alert("Please select date and time"); return; }

            const btn = bookForm.querySelector('button[type="submit"]');
            const originalText = btn.innerText;
            btn.innerText = "Booking...";
            btn.disabled = true;

            try {
                const res = await fetch(`${API_BASE}/patient/book-appointment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ patient_id: currentUser.id, doctor_id: doctorId, date, time })
                });

                if (!res.ok) throw new Error("Booking failed");

                showSuccessModal("Confirmed", "Your appointment is set.", "PATIENT_PORTAL.html");

            } catch (err) {
                alert("Error: " + err.message);
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });
    }
}

// --- EMR PAGE INITIALIZATION ---
async function initPatientEMR() {
    await loadEMRHistory(false);
}

// --- EMR HISTORY ---
async function loadEMRHistory(isSummary = false) {
    const container = document.getElementById(isSummary ? 'timeline-container' : 'emr-history-container');
    if (!container) return;

    if (!isSummary) container.innerHTML = `<div class="p-4 text-center text-gray-400">Loading...</div>`;

    try {
        const res = await fetch(`${API_BASE}/patient/history?patient_id=${currentUser.id}`);
        const records = await res.json();
        container.innerHTML = '';

        if (!records || records.length === 0) {
            container.innerHTML = `<div class="p-6 text-center text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">No records found.</div>`;
            return;
        }

        const displayRecords = isSummary ? records.slice(0, 2) : records;

        displayRecords.forEach(rec => {
            const docName = rec.doctors ? rec.doctors.full_name : 'Unknown Doctor';
            const dateStr = rec.appointments ? new Date(rec.appointments.scheduled_time).toLocaleDateString() : 'Unknown Date';

            const card = document.createElement('div');
            card.className = "relative bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6";
            if (!isSummary) card.innerHTML += `<div class="absolute -left-[41px] top-6 w-5 h-5 rounded-full border-4 border-white bg-blue-500 shadow-sm"></div>`;

            card.innerHTML += `
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <h3 class="text-lg font-bold text-gray-900">Consultation</h3>
                        <p class="text-sm text-gray-500">${dateStr} • ${docName}</p>
                    </div>
                </div>
                <div class="text-gray-700 text-sm mt-3 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <p><strong>Assessment:</strong> ${rec.assessment || 'N/A'}</p>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (err) {
        if (!isSummary) container.innerHTML = `<div class="text-red-500">Error loading records.</div>`;
    }
}

// --- MODAL ---
function showSuccessModal(title, message, redirectUrl) {
    const modal = document.createElement('div');
    modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm opacity-0 transition-opacity duration-300";
    modal.innerHTML = `
        <div class="bg-white rounded-3xl p-8 max-w-sm w-full mx-4 shadow-2xl transform scale-95 transition-all duration-300 text-center">
            <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                <i data-feather="check" class="w-10 h-10 text-green-600"></i>
            </div>
            <h3 class="text-2xl font-bold text-gray-900 mb-2">${title}</h3>
            <p class="text-gray-500 text-sm leading-relaxed mb-8">${message}</p>
            <button id="modal-success-btn" class="w-full bg-gray-900 text-white py-3.5 rounded-xl font-bold hover:bg-black transition-all transform active:scale-[0.98] shadow-lg">Go to Dashboard</button>
        </div>`;
    document.body.appendChild(modal);
    if (window.feather) feather.replace();
    requestAnimationFrame(() => { modal.classList.remove('opacity-0'); modal.querySelector('div').classList.remove('scale-95'); modal.querySelector('div').classList.add('scale-100'); });
    modal.querySelector('#modal-success-btn').onclick = () => window.location.href = redirectUrl;
}
