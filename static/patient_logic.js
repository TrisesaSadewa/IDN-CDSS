// CONFIGURATION
// Leave empty for production (uses same domain). Use http://127.0.0.1:8000 only for local testing.
const API_BASE = ""; 

// GLOBAL STATE
let currentUser = {
    name: localStorage.getItem('smart_his_name') || "Patient",
    id: localStorage.getItem('smart_his_user_id') || "user_mock",
    mrn: "MRN-PENDING"
};

// --- PORTAL DASHBOARD LOGIC ---
if (document.getElementById('welcome-name')) {
    document.addEventListener('DOMContentLoaded', () => {
        setupPortal();
    });
}

function setupPortal() {
    document.getElementById('welcome-name').textContent = currentUser.name.split(' ')[0];
    document.getElementById('patient-name').textContent = currentUser.name;
    document.getElementById('patient-mrn').textContent = "RM-2024-001"; // Mock for now

    const timelineContainer = document.getElementById('timeline-container');
    
    // MOCK DATA
    const history = [
        { date: "Oct 12, 2023", diagnosis: "Acute Bronchitis", doctor: "Dr. Smith", type: "consultation" },
        { date: "Sep 05, 2023", diagnosis: "General Checkup", doctor: "Dr. Aminah", type: "checkup" }
    ];

    let html = '';
    history.forEach(item => {
        let iconColor = item.type === 'consultation' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600';
        let icon = item.type === 'consultation' ? 'activity' : 'check';

        html += `
            <div class="p-5 flex gap-4 hover:bg-gray-50 transition-colors">
                <div class="w-10 h-10 rounded-full ${iconColor} flex items-center justify-center shrink-0">
                    <i data-feather="${icon}" class="w-5 h-5"></i>
                </div>
                <div>
                    <h4 class="font-bold text-gray-900">${item.diagnosis}</h4>
                    <p class="text-sm text-gray-500">${item.date} • ${item.doctor}</p>
                </div>
                <div class="ml-auto flex items-center">
                    <i data-feather="chevron-right" class="w-4 h-4 text-gray-300"></i>
                </div>
            </div>
        `;
    });
    
    if(timelineContainer) {
        timelineContainer.innerHTML = html;
        feather.replace();
    }

    const pendingAppt = localStorage.getItem('smart_his_pending_appt');
    if (pendingAppt) {
        const appt = JSON.parse(pendingAppt);
        const nextApptEl = document.getElementById('next-appt');
        if(nextApptEl) {
            nextApptEl.innerHTML = `
                <span class="text-blue-600">${appt.date}</span> <br/>
                <span class="text-sm font-normal text-gray-500">${appt.time} • ${appt.doctor}</span>
            `;
        }
    }
}

function logout() {
    localStorage.clear();
    window.location.href = 'LOGIN.html';
}

// --- APPOINTMENTS PAGE LOGIC ---
function initPatientAppointments() {
    const dateInput = document.getElementById('book-date');
    if (dateInput) {
        dateInput.min = new Date().toISOString().split('T')[0];
    }

    const hasActiveQueue = localStorage.getItem('smart_his_pending_appt'); 
    
    if (hasActiveQueue) {
        const queueCard = document.getElementById('live-queue-card');
        if(queueCard) {
            queueCard.classList.remove('hidden');
            
            document.getElementById('queue-number').textContent = "#A-104";
            document.getElementById('wait-time').textContent = "15 mins";
            document.getElementById('time-checkin').textContent = "09:30 AM";

            const triageIcon = document.getElementById('icon-triage');
            const triageText = document.getElementById('text-triage');
            
            triageIcon.classList.remove('bg-gray-200', 'text-gray-500');
            triageIcon.classList.add('bg-blue-500', 'text-white');
            triageText.classList.remove('text-gray-500');
            triageText.classList.add('text-gray-900');
            triageText.innerHTML += ' <span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded ml-2">In Progress</span>';
        }
    }

    const form = document.getElementById('booking-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const doctorSelect = document.getElementById('doctor-select');
            const docName = doctorSelect.options[doctorSelect.selectedIndex].text;
            const date = document.getElementById('book-date').value;
            const time = document.getElementById('book-time').value;

            if (!date) return alert("Please select a date");

            const apptData = { doctor: docName, date, time, status: 'booked' };
            localStorage.setItem('smart_his_pending_appt', JSON.stringify(apptData));

            alert("Appointment Booked Successfully!");
            window.location.href = 'PATIENT_PORTAL.html';
        });
    }
}

// --- EMR HISTORY PAGE LOGIC ---
function initPatientEMR() {
    const container = document.getElementById('emr-history-container');
    if (!container) return;

    const records = [
        {
            id: 1,
            date: "Oct 12, 2023",
            title: "Acute Bronchitis",
            doctor: "Dr. Smith (General)",
            notes: "Patient presented with cough and fever. Prescribed antibiotics and rest.",
            meds: ["Amoxicillin 500mg", "Paracetamol"]
        },
        {
            id: 2,
            date: "Aug 15, 2023",
            title: "Routine Checkup",
            doctor: "Dr. Aminah",
            notes: "BP 120/80. Weight stable. No issues reported.",
            meds: []
        },
        {
            id: 3,
            date: "Jan 10, 2023",
            title: "Mild Allergic Reaction",
            doctor: "Dr. Smith",
            notes: "Rash on arm. Prescribed antihistamine.",
            meds: ["Cetirizine 10mg"]
        }
    ];

    let html = '';
    records.forEach(rec => {
        html += `
            <div class="relative bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6">
                <div class="absolute -left-[41px] top-6 w-5 h-5 rounded-full border-4 border-white bg-blue-500 shadow-sm"></div>
                
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <h3 class="text-lg font-bold text-gray-900">${rec.title}</h3>
                        <p class="text-sm text-gray-500">${rec.date} • ${rec.doctor}</p>
                    </div>
                    <button class="text-blue-600 hover:text-blue-800 text-sm font-medium">View Details</button>
                </div>
                
                <p class="text-gray-700 text-sm mt-3 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100">
                    ${rec.notes}
                </p>

                ${rec.meds.length > 0 ? `
                    <div class="mt-4">
                        <p class="text-xs font-bold text-gray-400 uppercase mb-2">Prescriptions</p>
                        <div class="flex gap-2 flex-wrap">
                            ${rec.meds.map(m => `<span class="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium border border-blue-100">${m}</span>`).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    });

    container.innerHTML = html;
}