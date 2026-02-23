// CONFIGURATION
const SUPABASE_URL = 'https://crywwqleinnwoacithmw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyeXd3cWxlaW5ud29hY2l0aG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MDg4MTIsImV4cCI6MjA4Mzk4NDgxMn0.VTDI6ZQ_aN895A29_v0F1vHzqaS-RG7iGzOFM6qMKfk';
const portalSupabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

document.addEventListener('DOMContentLoaded', async () => {
    loadUserProfile();
    await fetchLiveMetrics(); // Upgrade: Fetch real-time clinical metrics from Supabase
    renderDashboard();
    if (window.feather) feather.replace();
});

// Real-Time Clinical Intelligence State (Initialized with safe defaults)
let METRICS = {
    doctor: { waiting: 0, completed: 0, urgent: 0 },
    nurse: { triage_pending: 0, active_patients: 0 },
    pharmacist: { prescriptions: 0, stock_alerts: 0, pending_pickup: 0 },
    admin: { revenue: '$0.00', active_users: 0, system_health: '100% (Stable)' },
    patient: { next_appt: 'No upcoming visits', prescriptions: 0, bills: '$0' }
};

async function fetchLiveMetrics() {
    if (!portalSupabase) return;
    try {
        // Fetch from the standardized International HIS Metrics View
        const { data, error } = await portalSupabase.from('view_daily_business_metrics').select('*').single();
        if (error) throw error;

        // Map database view to the global METRICS state
        METRICS.doctor.waiting = data.doc_waiting;
        METRICS.doctor.completed = data.doc_completed;
        METRICS.doctor.urgent = data.doc_urgent;
        METRICS.nurse.triage_pending = data.nurse_triage;
        METRICS.nurse.active_patients = data.active_patients;
        METRICS.pharmacist.prescriptions = data.pharm_pending;
        METRICS.pharmacist.stock_alerts = data.pharm_stock_alerts;
        METRICS.admin.active_users = data.active_logins;
        METRICS.admin.revenue = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data.revenue_today);
    } catch (e) {
        console.error("Clinical Intelligence Sync Failed:", e);
    }
}

function loadUserProfile() {
    // Get from LocalStorage (set during Login)
    const name = localStorage.getItem('smart_his_name') || 'User';
    const role = localStorage.getItem('smart_his_role') || 'guest';

    // Update UI Elements
    const nameEl = document.getElementById('user-name');
    const welcomeEl = document.getElementById('welcome-name');
    const roleEl = document.getElementById('user-role');
    const avatarEl = document.getElementById('user-avatar');

    if (nameEl) nameEl.textContent = name;
    if (welcomeEl) welcomeEl.textContent = name.split(' ')[0]; // First name
    if (roleEl) roleEl.textContent = role.replace('_', ' ').toUpperCase();
    if (avatarEl) avatarEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff`;
}

function renderDashboard() {
    const role = localStorage.getItem('smart_his_role') || 'guest';
    const container = document.getElementById('dashboard-content');
    if (!container) return;

    let html = '';

    // --- ADMIN VIEW ---
    if (role === 'admin') {
        html = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <!-- Metrics -->
                <div class="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                    <p class="text-gray-500 text-sm font-medium">Monthly Revenue</p>
                    <h3 class="text-3xl font-bold text-gray-900 mt-1">${METRICS.admin.revenue}</h3>
                </div>
                <div class="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                    <p class="text-gray-500 text-sm font-medium">Active Users</p>
                    <h3 class="text-3xl font-bold text-gray-900 mt-1">${METRICS.admin.active_users}</h3>
                </div>
                <div class="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                    <p class="text-gray-500 text-sm font-medium">System Health</p>
                    <h3 class="text-3xl font-bold text-green-600 mt-1">${METRICS.admin.system_health}</h3>
                </div>
            </div>

            <h3 class="text-lg font-bold text-gray-800 mb-6">Management Console</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                <!-- LINK TO ADMIN PANEL (Patient Registration) -->
                <a href="PATIENT_REG.html" class="group bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer relative overflow-hidden">
                    <div class="absolute right-0 top-0 w-24 h-24 bg-indigo-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                    <div class="relative z-10">
                        <div class="mb-4 bg-indigo-100 text-indigo-600 w-fit p-3 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                            <i data-feather="user-plus" class="w-6 h-6"></i>
                        </div>
                        <h4 class="text-lg font-bold text-gray-900">Register Patient</h4>
                        <p class="text-gray-500 text-sm mt-2">Create new patient accounts, assign MRN, and set temporary passwords.</p>
                    </div>
                </a>

                <!-- STAFF MANAGEMENT -->
                <a href="STAFF_MANAGEMENT.html" class="group bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer relative overflow-hidden">
                    <div class="absolute right-0 top-0 w-24 h-24 bg-indigo-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                    <div class="relative z-10">
                        <div class="mb-4 bg-indigo-100 text-indigo-600 w-fit p-3 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                            <i data-feather="users" class="w-6 h-6"></i>
                        </div>
                        <h4 class="text-lg font-bold text-gray-900">Staff Management</h4>
                        <p class="text-gray-500 text-sm mt-2">Manage medical staff accounts (Doctors, Nurses, Pharmacists).</p>
                    </div>
                </a>

                <!-- COMPLIANCE & SECURITY -->
                <div class="bg-indigo-900 rounded-2xl p-6 shadow-sm border border-indigo-800 text-white relative overflow-hidden">
                    <div class="absolute right-0 top-0 w-32 h-32 bg-indigo-800/50 rounded-bl-full -mr-4 -mt-4"></div>
                    <div class="relative z-10 flex flex-col h-full">
                        <div class="mb-4 bg-indigo-800/70 text-indigo-300 w-fit p-3 rounded-xl border border-indigo-700">
                            <i data-feather="shield" class="w-6 h-6"></i>
                        </div>
                        <h4 class="text-lg font-bold text-white mb-2">Security & Compliance</h4>
                        <p class="text-indigo-200 text-sm mb-4">HIPAA/GDPR Audit Trails, Data Access Logs, and Security Monitoring.</p>
                        <div class="mt-auto space-y-2">
                            <div class="flex justify-between items-center text-xs font-medium border-b border-indigo-800/50 pb-2">
                                <span class="text-indigo-300">Data Access Events Today</span>
                                <span class="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">1,402</span>
                            </div>
                            <div class="flex justify-between items-center text-xs font-medium">
                                <span class="text-indigo-300">Unauthorized Attempts</span>
                                <span class="bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded border border-rose-500/30">0</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // --- NURSE VIEW ---
    else if (role === 'nurse') {
        html = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div class="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p class="text-gray-500 text-sm font-medium">Triage Queue</p>
                        <h3 class="text-3xl font-bold text-amber-600 mt-1">${METRICS.nurse.triage_pending}</h3>
                    </div>
                    <div class="p-3 bg-amber-50 text-amber-600 rounded-xl"><i data-feather="clock"></i></div>
                </div>
                <div class="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p class="text-gray-500 text-sm font-medium">Patients in Unit</p>
                        <h3 class="text-3xl font-bold text-indigo-600 mt-1">${METRICS.nurse.active_patients}</h3>
                    </div>
                    <div class="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><i data-feather="users"></i></div>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <a href="nurse.html" class="bg-indigo-600 rounded-2xl p-8 text-white shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-between group overflow-hidden relative">
                    <div class="absolute right-0 top-0 w-32 h-32 bg-white/10 rounded-full -mr-8 -mt-8"></div>
                    <div class="relative z-10">
                        <h3 class="text-2xl font-bold">Launch Nursing Station</h3>
                        <p class="text-indigo-100 mt-2">Start Patient Triage, Vital Checks, and MEWS Monitoring.</p>
                    </div>
                    <i data-feather="arrow-right" class="w-8 h-8 group-hover:translate-x-2 transition-transform relative z-10"></i>
                </a>
            </div>
        `;
    }

    // --- DOCTOR VIEW ---
    else if (role === 'doctor') {
        html = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div class="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                    <p class="text-gray-500 text-sm">Patients Waiting</p>
                    <h3 class="text-3xl font-bold text-indigo-600">${METRICS.doctor.waiting}</h3>
                </div>
                <div class="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                    <p class="text-gray-500 text-sm">Completed Today</p>
                    <h3 class="text-3xl font-bold text-gray-900">${METRICS.doctor.completed}</h3>
                </div>
                <div class="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                    <p class="text-gray-500 text-sm">Urgent Flags</p>
                    <h3 class="text-3xl font-bold text-red-500">${METRICS.doctor.urgent}</h3>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <a href="DOCTOR_PORTAL.html" class="bg-indigo-600 rounded-2xl p-6 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-colors flex items-center justify-between group">
                    <div>
                        <h3 class="text-xl font-bold">Go to Dashboard</h3>
                        <p class="text-indigo-100 text-sm mt-1">Review my performance and patient stats</p>
                    </div>
                    <i data-feather="grid" class="group-hover:translate-x-1 transition-transform"></i>
                </a>
                <a href="APPOINTMENTS.html" class="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 text-indigo-700 shadow-sm hover:bg-indigo-100 transition-colors flex items-center justify-between group">
                    <div>
                        <h3 class="text-xl font-bold">Go to Queue</h3>
                        <p class="text-indigo-600/70 text-sm mt-1">View patient list & start consultations</p>
                    </div>
                    <i data-feather="arrow-right" class="group-hover:translate-x-1 transition-transform"></i>
                </a>
            </div>
        `;
    }

    // --- PHARMACIST VIEW ---
    else if (role === 'pharmacist') {
        html = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div class="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                    <p class="text-gray-500 text-sm font-medium">Daily Prescriptions</p>
                    <h3 class="text-3xl font-bold text-emerald-600">${METRICS.pharmacist.prescriptions}</h3>
                </div>
                <div class="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                    <p class="text-gray-500 text-sm font-medium">Stock Alerts</p>
                    <h3 class="text-3xl font-bold text-red-500">${METRICS.pharmacist.stock_alerts}</h3>
                </div>
                <div class="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                    <p class="text-gray-500 text-sm font-medium">Pending Pickup</p>
                    <h3 class="text-3xl font-bold text-gray-900">${METRICS.pharmacist.pending_pickup}</h3>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <a href="PHARMACY.html" class="bg-emerald-600 rounded-2xl p-6 text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-colors flex items-center justify-between group">
                    <div>
                        <h3 class="text-xl font-bold">Open Pharmacy Module</h3>
                        <p class="text-emerald-50 text-sm mt-1">Manage dispense queue & inventory levels</p>
                    </div>
                    <i data-feather="arrow-right" class="group-hover:translate-x-1 transition-transform"></i>
                </a>
            </div>
        `;
    }

    // --- PATIENT VIEW ---
    else if (role === 'patient') {
        html = `
            <div class="bg-blue-600 rounded-3xl p-8 text-white shadow-xl shadow-blue-200 mb-8 relative overflow-hidden">
                <div class="relative z-10">
                    <h3 class="text-2xl font-bold mb-2">Next Appointment</h3>
                    <p class="text-blue-100 mb-6">${METRICS.patient.next_appt} • Dr. Sadewa</p>
                    <div class="flex gap-3">
                        <button class="bg-white text-blue-600 px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-blue-50 transition-colors">Reschedule</button>
                        <button class="bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-blue-800 transition-colors">Details</button>
                    </div>
                </div>
                <div class="absolute right-0 top-0 w-64 h-64 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
            </div>

            <h3 class="text-lg font-bold text-gray-800 mb-6">Quick Actions</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <a href="PATIENT_APPOINTMENTS.html" class="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-all group">
                    <div class="mb-4 bg-indigo-50 text-indigo-600 w-fit p-3 rounded-xl"><i data-feather="calendar"></i></div>
                    <h4 class="text-lg font-bold group-hover:text-indigo-600 transition-colors">Book Appointment</h4>
                </a>
                <a href="PATIENT_EMR.html" class="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-all group">
                    <div class="mb-4 bg-teal-50 text-teal-600 w-fit p-3 rounded-xl"><i data-feather="file-text"></i></div>
                    <h4 class="text-lg font-bold group-hover:text-teal-600 transition-colors">Medical Records</h4>
                </a>
                <div class="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm opacity-60">
                    <div class="mb-4 bg-purple-50 text-purple-600 w-fit p-3 rounded-xl"><i data-feather="pill"></i></div>
                    <h4 class="text-lg font-bold">Prescriptions</h4>
                    <p class="text-xs text-gray-400 mt-1">Coming Soon</p>
                </div>
            </div>
        `;
    }

    // --- DEFAULT / GUEST ---
    else {
        html = `<div class="text-center text-gray-500 py-10">Access restricted. Please log in.</div>`;
    }

    container.innerHTML = html;
    if (window.feather) feather.replace();
}

function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}
