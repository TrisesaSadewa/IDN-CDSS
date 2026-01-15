// CONFIGURATION
const API_BASE = "https://smart-his-backend.onrender.com"; 

// GLOBAL STATE
let currentUser = {
    name: localStorage.getItem('smart_his_name') || "Patient",
    id: localStorage.getItem('smart_his_user_id'),
    role: localStorage.getItem('smart_his_role')
};

// --- INITIALIZATION (ROUTER) ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Update Navbar Name (if elements exist)
    const nameEls = document.querySelectorAll('#welcome-name, #patient-name');
    nameEls.forEach(el => el.textContent = currentUser.name);

    // 2. PAGE ROUTING - DETECT PAGE BY ELEMENT ID
    const doctorSelect = document.getElementById('doctor-select');
    
    if (doctorSelect) {
        // We are on PATIENT_APPOINTMENTS.html
        console.log("Appointment Page Detected: Initializing Booking Logic...");
        initBookingPage();
    } 
    else if (document.getElementById('timeline-container')) {
        // We are on PATIENT_PORTAL.html or PATIENT_EMR.html
        setupPortal(); 
    }
});

// --- 1. APPOINTMENT BOOKING (DATABASE CONNECTED) ---
async function initBookingPage() {
    const doctorSelect = document.getElementById('doctor-select');
    const bookForm = document.getElementById('booking-form');

    if (!doctorSelect) return;

    // A. Fetch Doctors List from Database
    try {
        console.log("Fetching doctors from:", `${API_BASE}/patient/doctors`);
        const res = await fetch(`${API_BASE}/patient/doctors`);
        
        if (!res.ok) throw new Error(`Connection failed: ${res.status}`);
        
        const doctors = await res.json();
        console.log("Doctors loaded:", doctors);
        
        // Clear the "Loading..." placeholder
        doctorSelect.innerHTML = '';

        if (doctors.length === 0) {
             doctorSelect.innerHTML = `<option>No doctors found in database</option>`;
        } else {
            // Map Database Results to HTML Options
            doctorSelect.innerHTML = doctors.map(d => 
                `<option value="${d.id}">${d.full_name} (${d.specialization || 'General'})</option>`
            ).join('');
        }
    } catch (e) {
        console.error("Failed to load doctors", e);
        doctorSelect.innerHTML = `<option>Error: Is Backend Running?</option>`;
    }

    // B. Handle Form Submit
    if (bookForm) {
        bookForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const doctorId = doctorSelect.value;
            const date = document.getElementById('book-date').value;
            const time = document.getElementById('book-time').value;

            if(!date || !time) {
                // Using a small toast for validation error instead of alert could be nice too, 
                // but keeping alert here for simplicity on validation.
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

                // SUCCESS: Show Modern Modal instead of Alert
                showSuccessModal(
                    "Appointment Confirmed", 
                    "Your consultation has been successfully scheduled. We have notified the doctor.",
                    "PATIENT_PORTAL.html"
                );

            } catch (err) {
                alert("Error booking appointment: " + err.message);
                submitBtn.innerText = originalText;
                submitBtn.disabled = false;
            }
        });
    }
}

// --- 2. PORTAL DASHBOARD (DATABASE CONNECTED) ---
async function setupPortal() {
    // Get Real Profile
    try {
        const res = await fetch(`${API_BASE}/patient/profile?user_id=${currentUser.id}`);
        if(res.ok) {
            const profile = await res.json();
            const mrnEl = document.getElementById('patient-mrn');
            if(mrnEl) mrnEl.textContent = profile.mrn || 'N/A';
        }
    } catch(e) {
        console.error("Profile fetch failed:", e);
    }
    // Load History
    await loadEMRHistory(true);
}

// --- 3. EMR HISTORY (DATABASE CONNECTED) ---
async function loadEMRHistory(isSummary = false) {
    const container = document.getElementById(isSummary ? 'timeline-container' : 'emr-history-container');
    if (!container) return;

    if (!isSummary) container.innerHTML = `<div class="p-4 text-center text-gray-400">Loading records...</div>`;

    try {
        const res = await fetch(`${API_BASE}/patient/history?patient_id=${currentUser.id}`);
        const records = await res.json();

        container.innerHTML = '';

        if (!records || records.length === 0) {
            container.innerHTML = `<div class="p-6 text-center text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">No medical records found yet.</div>`;
            return;
        }

        const displayRecords = isSummary ? records.slice(0, 2) : records;

        displayRecords.forEach(rec => {
            const docName = rec.doctors ? rec.doctors.full_name : 'Unknown Doctor';
            const dateStr = rec.appointments ? new Date(rec.appointments.scheduled_time).toLocaleDateString() : 'Unknown Date';
            
            const card = document.createElement('div');
            card.className = "relative bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6";
            
            // Visual Dot
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
                <div class="text-gray-700 text-sm mt-3 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100 space-y-2">
                    <p><strong>Assessment:</strong> ${rec.assessment || 'N/A'}</p>
                    <p><strong>Plan:</strong> ${rec.plan || 'N/A'}</p>
                </div>
            `;
            container.appendChild(card);
        });

    } catch (err) {
        console.error("History Error", err);
        if(!isSummary) container.innerHTML = `<div class="text-red-500">Failed to load records.</div>`;
    }
}

// --- HELPER: MODERN MODAL ---
function showSuccessModal(title, message, redirectUrl) {
    // 1. Create Modal Container
    const modal = document.createElement('div');
    modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm opacity-0 transition-opacity duration-300";
    
    // 2. Modal Content
    modal.innerHTML = `
        <div class="bg-white rounded-3xl p-8 max-w-sm w-full mx-4 shadow-2xl transform scale-95 transition-all duration-300 text-center">
            <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                <i data-feather="check" class="w-10 h-10 text-green-600"></i>
            </div>
            <h3 class="text-2xl font-bold text-gray-900 mb-2">${title}</h3>
            <p class="text-gray-500 text-sm leading-relaxed mb-8">${message}</p>
            <button id="modal-success-btn" class="w-full bg-gray-900 text-white py-3.5 rounded-xl font-bold hover:bg-black transition-all transform active:scale-[0.98] shadow-lg">
                Go to Dashboard
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    // 3. Initialize Icons
    if(window.feather) feather.replace();

    // 4. Animate In
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        const content = modal.querySelector('div');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    });

    // 5. Handle Click
    const btn = modal.querySelector('#modal-success-btn');
    btn.onclick = () => {
        window.location.href = redirectUrl;
    };
}
