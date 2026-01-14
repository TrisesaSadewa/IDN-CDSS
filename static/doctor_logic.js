// CONFIGURATION
const API_BASE = ""; // Relative path for production

// GLOBAL STATE
// ... (Keep the rest of the file exactly as it was, just change the first line)
const DOCTOR_ID = "doc_123";

document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    
    if (path.includes('APPOINTMENTS.html')) {
        initAppointmentsPage();
    } else if (path.includes('EMR.html')) {
        initEMRPage();
    }
});

async function initAppointmentsPage() {
    console.log("Initializing Queue...");
    const container = document.getElementById('queue-container');
    if (!container) return;

    try {
        const res = await fetch(`${API_BASE}/doctor/queue?doctor_id=${DOCTOR_ID}`);
        const appointments = await res.json();
        
        container.innerHTML = '';
        
        if (appointments.length === 0) {
            container.innerHTML = `<div class="p-5 text-center text-gray-500">No patients in queue.</div>`;
            return;
        }

        appointments.forEach(appt => {
            const p = appt.patients;
            const t = appt.triage_notes && appt.triage_notes[0] ? appt.triage_notes[0] : {};
            
            const card = document.createElement('div');
            card.className = "queue-card bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-3 cursor-pointer hover:border-blue-500 transition";
            card.onclick = () => window.location.href = `EMR.html?id=${appt.id}`;
            
            card.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                            ${p.full_name.charAt(0)}
                        </div>
                        <div>
                            <h3 class="font-bold text-gray-800">${p.full_name}</h3>
                            <p class="text-xs text-gray-500">${p.mrn} • 24yo</p>
                        </div>
                    </div>
                    <span class="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        ${appt.status}
                    </span>
                </div>
                <div class="flex items-center gap-4 text-xs text-gray-500 mt-2 bg-gray-50 p-2 rounded">
                    <span class="flex items-center gap-1"><i data-feather="clock"></i> 09:30 AM</span>
                    <span class="flex items-center gap-1"><i data-feather="activity"></i> ${t.systolic || '--'}/${t.diastolic || '--'} mmHg</span>
                </div>
            `;
            container.appendChild(card);
            if (feather) feather.replace();
        });

    } catch (e) {
        console.error("Failed to load queue:", e);
        container.innerHTML = `<div class="text-red-500 p-4">Error loading queue. Is backend running?</div>`;
    }
}

let currentDrugsList = []; 

async function initEMRPage() {
    const params = new URLSearchParams(window.location.search);
    const appointmentId = params.get('id');
    
    if (!appointmentId) {
        alert("No appointment selected. Redirecting to Queue.");
        window.location.href = 'APPOINTMENTS.html';
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/doctor/patient/${appointmentId}`);
        if (!res.ok) throw new Error("API Error");
        const data = await res.json();
        // Assuming populatePatientHeader exists in your context or simpler manual logic:
        // Manual population for safety:
        if(document.getElementById('patient-name-header')) document.getElementById('patient-name-header').innerText = data.appointment.patients.full_name;
    } catch (e) {
        console.error("Load Patient Error:", e);
    }

    const addBtn = document.getElementById('addPrescription');
    const drugInput = document.getElementById('drugName');
    
    drugInput.addEventListener('blur', async () => {
        const text = drugInput.value;
        if (text.length > 5 && !document.getElementById('dosage').value) {
            const res = await fetch(`${API_BASE}/doctor/parse-text`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ text: text })
            });
            const parsed = await res.json();
            if (parsed.drugName) {
                drugInput.value = parsed.drugName;
                document.getElementById('dosage').value = parsed.dosage || '';
                document.getElementById('schedule').value = parsed.frequency || '';
            }
        }
    });

    addBtn.onclick = async (e) => {
        e.preventDefault();
        await handleAddDrug();
    };

    const submitBtn = document.getElementById('submitEMRBtn');
    if (submitBtn) {
        submitBtn.onclick = async () => {
            await submitConsultation(appointmentId);
        };
    }
}

async function handleAddDrug() {
    const name = document.getElementById('drugName').value;
    const dose = document.getElementById('dosage').value;
    const freq = document.getElementById('schedule').value;
    const instr = document.getElementById('instructions').value;

    if (!name) return;

    const existingNames = currentDrugsList.map(d => d.name);
    
    const checkRes = await fetch(`${API_BASE}/doctor/check-safety`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            drug_name: name,
            dosage: dose,
            frequency: freq,
            existing_drugs: existingNames
        })
    });
    const safetyData = await checkRes.json();

    addDrugRowToUI(name, dose, freq, instr, safetyData);
    currentDrugsList.push({ name, dosage: dose, frequency: freq, instructions: instr });

    document.getElementById('drugName').value = '';
    document.getElementById('dosage').value = '';
    document.getElementById('schedule').value = '';
    document.getElementById('instructions').value = '';
}

function addDrugRowToUI(name, dose, freq, instr, safety) {
    const list = document.getElementById('prescriptionList');
    
    let badge = `<span class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">Safe</span>`;
    let borderClass = "border-l-4 border-green-500";
    
    if (safety.alerts.length > 0) {
        badge = `<span class="bg-red-100 text-red-800 text-xs px-2 py-1 rounded font-bold">DDI Alert</span>`;
        borderClass = "border-l-4 border-red-500";
        alert(`WARNING: ${safety.alerts[0].msg}`);
    } else if (safety.compliance.length > 0) {
        badge = `<span class="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">Check Rules</span>`;
        borderClass = "border-l-4 border-yellow-500";
    }

    const item = document.createElement('div');
    item.className = `p-3 bg-white rounded shadow-sm mb-2 flex justify-between items-center ${borderClass}`;
    item.innerHTML = `
        <div>
            <div class="font-bold text-gray-800 flex items-center gap-2">
                ${name} ${badge}
            </div>
            <div class="text-sm text-gray-500">${dose} • ${freq} • ${instr}</div>
        </div>
        <button class="text-red-400 hover:text-red-600 delete-btn"><i data-feather="trash-2"></i></button>
    `;
    
    item.querySelector('.delete-btn').onclick = () => {
        item.remove();
        const idx = currentDrugsList.findIndex(d => d.name === name);
        if (idx > -1) currentDrugsList.splice(idx, 1);
    };

    // Remove empty placeholder
    const placeholder = list.querySelector('.text-gray-500');
    if (placeholder && placeholder.innerText.includes('No drugs added')) placeholder.remove();

    list.appendChild(item);
    if (feather) feather.replace();
}

async function submitConsultation(apptId) {
    // Assuming inputs exist in DOM (they are in your EMR.html)
    const subjective = document.getElementById('chiefComplaintInput')?.value || ""; 
    const objective = ""; // Gather from vitals if needed
    const assessment = document.getElementById('primaryDiagnosisInput')?.value || "";
    const plan = document.getElementById('therapyInput')?.value || "";

    const payload = {
        doctor_id: DOCTOR_ID,
        appointment_id: apptId,
        subjective,
        objective,
        assessment,
        plan,
        prescription_items: currentDrugsList
    };

    const res = await fetch(`${API_BASE}/doctor/submit-consultation`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });

    if (res.ok) {
        alert("Consultation Saved!");
        window.location.href = 'APPOINTMENTS.html';
    } else {
        alert("Error saving consultation.");
    }
}