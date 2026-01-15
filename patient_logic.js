// CONFIGURATION
// PRODUCTION URL
const API_BASE = "https://smart-his-backend.onrender.com"; 

// GLOBAL STATE
let currentUser = {
    name: localStorage.getItem('smart_his_name') || "Patient",
    id: localStorage.getItem('smart_his_user_id'),
    role: localStorage.getItem('smart_his_role')
};

// Security Redirect
if (!currentUser.id || currentUser.role !== 'patient') {
    if (!window.location.pathname.includes('index.html')) {
        // console.warn("Access denied. Redirecting...");
    }
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Shared: Update Navbar Name
    const nameEls = document.querySelectorAll('#welcome-name, #patient-name');
    nameEls.forEach(el => el.textContent = currentUser.name);

    const path = window.location.pathname;

    if (path.includes('PATIENT_PORTAL.html')) {
        setupPortal();
    } else if (path.includes('PATIENT_APPOINTMENTS.html')) {
        initBookingPage();
    } else if (path.includes('PATIENT_EMR.html')) {
        loadEMRHistory();
    }
});

// --- 1. PORTAL DASHBOARD ---
async function setupPortal() {
    try {
        const res = await fetch(`${API_BASE}/patient/profile?user_id=${currentUser.id}`);
        if(res.ok) {
            const profile = await res.json();
            const mrnEl = document.getElementById('patient-mrn');
            if(mrnEl) {
                if (profile.mrn === 'MISSING_ROW') {
                    mrnEl.textContent = "Error";
                    mrnEl.classList.add('text-red-500');
                } else {
                    mrnEl.textContent = profile.mrn || 'N/A';
                }
            }
        }
    } catch(e) {
        console.error("Profile fetch failed:", e);
    }
    await loadEMRHistory(true);
}

// --- 2. APPOINTMENT BOOKING ---
async function initBookingPage() {
    const doctorSelect = document.getElementById('doctor-select');
    const bookForm = document.getElementById('booking-form');

    // A. Fetch Doctors List
    try {
        const res = await fetch(`${API_BASE}/patient/doctors`);
        if (!res.ok) throw new Error("API Connection Failed");
        
        const doctors = await res.json();
        
        if (doctors.length === 0) {
             doctorSelect.innerHTML = `<option>No doctors available</option>`;
        } else {
            doctorSelect.innerHTML = doctors.map(d => 
                `<option value="${d.id}">${d.full_name} (${d.specialization || 'General'})</option>`
            ).join('');
        }
    } catch (e) {
        console.error("Failed to load doctors", e);
        doctorSelect.innerHTML = `<option>Error: Is Backend Running?</option>`;
    }

    // B. Handle Form Submit
    bookForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const doctorId = doctorSelect.value;
        const date = document.getElementById('book-date').value;
        const time = document.getElementById('book-time').value;

        if(!date || !time) {
            alert("Please select date and time");
            return;
        }

        const submitBtn = bookForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerText;
        submitBtn.innerText = "Booking...";
        submitBtn.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/patient/book-appointment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patient_id: currentUser.id,
                    doctor_id: doctorId,
                    date: date,
                    time: time
                })
            });

            if (!res.ok) throw new Error("Booking failed");

            alert("Appointment Booked Successfully!");
            window.location.href = "PATIENT_PORTAL.html";

        } catch (err) {
            alert("Error booking appointment: " + err.message);
            submitBtn.innerText = originalText;
            submitBtn.disabled = false;
        }
    });
}

// --- 3. EMR HISTORY ---
async function loadEMRHistory(isSummary = false) {
    const container = document.getElementById(isSummary ? 'timeline-container' : 'emr-history-container');
    if (!container) return;

    if (!isSummary) container.innerHTML = `<div class="p-4 text-center text-gray-400">Loading records...</div>`;

    try {
        const res = await fetch(`${API_BASE}/patient/history?patient_id=${currentUser.id}`);
        const records = await res.json();

        container.innerHTML = '';

        if (!records || records.length === 0) {
            container.innerHTML = `<div class="p-6 text-center text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">No medical records found.</div>`;
            return;
        }

        const displayRecords = isSummary ? records.slice(0, 2) : records;

        displayRecords.forEach(rec => {
            const docName = rec.doctors ? rec.doctors.full_name : 'Unknown Doctor';
            const dateStr = rec.appointments ? new Date(rec.appointments.scheduled_time).toLocaleDateString() : 'Unknown Date';
            
            const card = document.createElement('div');
            card.className = "relative bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6";
            
            if(!isSummary) {
                card.innerHTML += `<div class="absolute -left-[41px] top-6 w-5 h-5 rounded-full border-4 border-white bg-blue-500 shadow-sm"></div>`;
            }

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
        if(!isSummary) container.innerHTML = `<div class="text-red-500">Failed to load records.</div>`;
    }
}
