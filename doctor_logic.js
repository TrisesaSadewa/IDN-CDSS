// CONFIGURATION
const API_BASE = "https://smart-his-backend.onrender.com"; // Relative path for production
const DOCTOR_ID = "doc_123"; // In a real app, this comes from Login Session

// --- PAGE ROUTER ---
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    
    if (path.includes('APPOINTMENTS.html')) {
        initAppointmentsPage();
    } else if (path.includes('EMR.html')) {
        initEMRPage();
    }
});

// --- APPOINTMENTS PAGE LOGIC ---
async function initAppointmentsPage() {
    console.log("Initializing Queue...");
    const container = document.getElementById('queue-container'); // You must add this ID to your HTML
    if (!container) return console.warn("Queue container ID 'queue-container' not found in HTML.");

    try {
        const res = await fetch(`${API_BASE}/doctor/queue?doctor_id=${DOCTOR_ID}`);
        const appointments = await res.json();
        
        container.innerHTML = ''; // Clear static HTML
        
        if (appointments.length === 0) {
            container.innerHTML = `<div class="p-5 text-center text-gray-500">No patients in queue.</div>`;
            return;
        }

        appointments.forEach(appt => {
            const p = appt.patients;
            const t = appt.triage_notes && appt.triage_notes[0] ? appt.triage_notes[0] : {};
            
            const card = document.createElement('div');
            // Reusing your HTML card structure dynamically
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

// --- EMR PAGE LOGIC ---
let currentDrugsList = []; // Track prescribed drugs for DDI checking

async function initEMRPage() {
    const params = new URLSearchParams(window.location.search);
    const appointmentId = params.get('id');
    
    if (!appointmentId) {
        alert("No appointment selected. Redirecting to Queue.");
        window.location.href = 'APPOINTMENTS.html';
        return;
    }

    // 1. Load Patient Data
    try {
        const res = await fetch(`${API_BASE}/doctor/patient/${appointmentId}`);
        if (!res.ok) throw new Error("API Error");
        const data = await res.json();
        populatePatientHeader(data.appointment.patients, data.appointment.triage_notes[0]);
    } catch (e) {
        console.error("Load Patient Error:", e);
    }

    // 2. Enhance "Add Prescription" Button
    const addBtn = document.getElementById('add-prescription');
    const drugInput = document.getElementById('drug-name');
    
    // Feature: Smart Autocomplete (User types "Amox 500 3x1" -> Hits Enter)
    drugInput.addEventListener('blur', async () => {
        const text = drugInput.value;
        if (text.length > 5 && !document.getElementById('dosage').value) {
            // Only auto-fill if dosage is empty (user typed raw string)
            const res = await fetch(`${API_BASE}/doctor/parse-text`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ text: text })
            });
            const parsed = await res.json();
            if (parsed.drugName) {
                drugInput.value = parsed.drugName; // Clean name
                document.getElementById('dosage').value = parsed.dosage || '';
                document.getElementById('schedule').value = parsed.frequency || '';
            }
        }
    });

    // Override the default Click to perform Safety Check
    // Note: We clone the button to remove old event listeners if necessary, 
    // or we just assume we are the primary listener if the user followed instructions.
    addBtn.onclick = async (e) => {
        e.preventDefault();
        await handleAddDrug();
    };

    // 3. Handle Final Submit
    // You need to add id="submit-consultation" to your Save/Finish button in HTML
    const submitBtn = document.getElementById('submit-consultation');
    if (submitBtn) {
        submitBtn.onclick = async () => {
            await submitConsultation(appointmentId);
        };
    }
}

function populatePatientHeader(patient, triage) {
    // Requires specific IDs in your HTML. See Integration Guide.
    if(document.getElementById('pt-name')) document.getElementById('pt-name').innerText = patient.full_name;
    if(document.getElementById('pt-mrn')) document.getElementById('pt-mrn').innerText = patient.mrn;
    // Populate Vitals sidebar if IDs exist
    if(document.getElementById('vital-bp') && triage) document.getElementById('vital-bp').innerText = `${triage.systolic}/${triage.diastolic}`;
}

async function handleAddDrug() {
    const name = document.getElementById('drug-name').value;
    const dose = document.getElementById('dosage').value;
    const freq = document.getElementById('schedule').value;
    const instr = document.getElementById('instructions').value;

    if (!name) return;

    // 1. CDSS CHECK
    // Get existing drug names for DDI check
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

    // 2. Render to List
    addDrugRowToUI(name, dose, freq, instr, safetyData);

    // 3. Add to internal memory
    currentDrugsList.push({ name, dosage: dose, frequency: freq, instructions: instr });

    // Clear Inputs
    document.getElementById('drug-name').value = '';
    document.getElementById('dosage').value = '';
    document.getElementById('schedule').value = '';
    document.getElementById('instructions').value = '';
}

function addDrugRowToUI(name, dose, freq, instr, safety) {
    const list = document.getElementById('prescription-list');
    
    // Determine Badge
    let badge = `<span class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">Safe</span>`;
    let borderClass = "border-l-4 border-green-500";
    
    if (safety.alerts.length > 0) {
        badge = `<span class="bg-red-100 text-red-800 text-xs px-2 py-1 rounded font-bold">DDI Alert</span>`;
        borderClass = "border-l-4 border-red-500";
        // Show Alert Toast (Mock)
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
    
    // Delete Handler
    item.querySelector('.delete-btn').onclick = () => {
        item.remove();
        // Remove from memory (simplistic approach for demo)
        const idx = currentDrugsList.findIndex(d => d.name === name);
        if (idx > -1) currentDrugsList.splice(idx, 1);
    };

    list.appendChild(item);
    if (feather) feather.replace();
}

async function submitConsultation(apptId) {
    const subjective = document.getElementById('soap-subjective')?.value || "";
    const objective = document.getElementById('soap-objective')?.value || "";
    const assessment = document.getElementById('soap-assessment')?.value || "";
    const plan = document.getElementById('soap-plan')?.value || "";

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