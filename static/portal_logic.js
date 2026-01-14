document.addEventListener('DOMContentLoaded', () => {
    loadUserProfile();
    renderDashboard();
});

// Mock Data for Demo (In real app, fetch from Supabase 'view_daily_business_metrics')
const METRICS = {
    doctor: { waiting: 12, completed: 5, urgent: 2 },
    nurse: { triage_pending: 8, vitals_check: 3, admitted: 45 },
    pharmacist: { prescriptions: 24, stock_alerts: 3, pending_pickup: 10 },
    admin: { revenue: '$12,450', active_users: 18, system_health: '98%' },
    patient: { next_appt: 'Tomorrow, 10 AM', prescriptions: 2, bills: '$0' }
};

function loadUserProfile() {
    // Get from LocalStorage (set during Login)
    const name = localStorage.getItem('smart_his_name') || 'User';
    const role = localStorage.getItem('smart_his_role') || 'guest';
    
    // Update UI
    document.getElementById('user-name').textContent = name;
    document.getElementById('welcome-name').textContent = name.split(' ')[0]; // First name
    document.getElementById('user-role').textContent = role.replace('_', ' ');
    document.getElementById('user-avatar').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff`;
}

function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

function renderDashboard() {
    const role = localStorage.getItem('smart_his_role') || 'guest';
    const container = document.getElementById('dashboard-content');
    
    let contentHTML = '';

    switch(role) {
        case 'doctor':
            contentHTML = generateDoctorDashboard();
            break;
        case 'nurse':
            contentHTML = generateNurseDashboard();
            break;
        case 'pharmacist':
            contentHTML = generatePharmacistDashboard();
            break;
        case 'admin':
            contentHTML = generateAdminDashboard();
            break;
        case 'patient':
            contentHTML = generatePatientDashboard();
            break;
        default:
            contentHTML = `<div class="p-4 bg-red-50 text-red-600 rounded-lg">Unknown Role. Please login again.</div>`;
    }

    container.innerHTML = contentHTML;
    feather.replace(); // Re-initialize icons for new content
}

// --- TEMPLATE GENERATORS ---

function generateDoctorDashboard() {
    const m = METRICS.doctor;
    return `
        <!-- Stats Row -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div class="p-3 bg-blue-50 text-blue-600 rounded-xl"><i data-feather="users"></i></div>
                <div><p class="text-gray-500 text-sm font-medium">Waiting Queue</p><h3 class="text-2xl font-bold text-gray-900">${m.waiting}</h3></div>
            </div>
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div class="p-3 bg-green-50 text-green-600 rounded-xl"><i data-feather="check-circle"></i></div>
                <div><p class="text-gray-500 text-sm font-medium">Completed</p><h3 class="text-2xl font-bold text-gray-900">${m.completed}</h3></div>
            </div>
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div class="p-3 bg-red-50 text-red-600 rounded-xl"><i data-feather="alert-circle"></i></div>
                <div><p class="text-gray-500 text-sm font-medium">Urgent Attention</p><h3 class="text-2xl font-bold text-gray-900">${m.urgent}</h3></div>
            </div>
        </div>

        <!-- Quick Actions Grid -->
        <h3 class="text-lg font-bold text-gray-800 mb-6">Quick Actions</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            <a href="APPOINTMENTS.html" class="dashboard-card bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl p-6 text-white relative overflow-hidden group">
                <div class="absolute right-0 top-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-150"></div>
                <div class="relative z-10">
                    <div class="p-3 bg-white/20 w-fit rounded-xl backdrop-blur-sm mb-4"><i data-feather="stethoscope"></i></div>
                    <h4 class="text-xl font-bold mb-1">Start Consultation</h4>
                    <p class="text-blue-100 text-sm">View queue and begin SOAP process</p>
                </div>
            </a>

            <a href="#" class="dashboard-card bg-white rounded-2xl p-6 border border-gray-200 shadow-sm group">
                <div class="p-3 bg-purple-50 text-purple-600 w-fit rounded-xl mb-4 group-hover:bg-purple-600 group-hover:text-white transition-colors"><i data-feather="search"></i></div>
                <h4 class="text-lg font-bold text-gray-800 mb-1">Patient Search</h4>
                <p class="text-gray-500 text-sm">Lookup medical records by ID or Name</p>
            </a>

            <a href="#" class="dashboard-card bg-white rounded-2xl p-6 border border-gray-200 shadow-sm group">
                <div class="p-3 bg-orange-50 text-orange-600 w-fit rounded-xl mb-4 group-hover:bg-orange-600 group-hover:text-white transition-colors"><i data-feather="calendar"></i></div>
                <h4 class="text-lg font-bold text-gray-800 mb-1">My Schedule</h4>
                <p class="text-gray-500 text-sm">Manage appointments and availability</p>
            </a>

        </div>
    `;
}

function generateNurseDashboard() {
    const m = METRICS.nurse;
    return `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><p class="text-gray-500 text-sm">Triage Pending</p><h3 class="text-3xl font-bold text-indigo-600">${m.triage_pending}</h3></div>
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><p class="text-gray-500 text-sm">Vitals To Check</p><h3 class="text-3xl font-bold text-pink-600">${m.vitals_check}</h3></div>
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><p class="text-gray-500 text-sm">Total Admitted</p><h3 class="text-3xl font-bold text-teal-600">${m.admitted}</h3></div>
        </div>

        <h3 class="text-lg font-bold text-gray-800 mb-6">Nurse Station</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <a href="APPOINTMENTS.html" class="dashboard-card bg-gradient-to-br from-pink-500 to-rose-500 rounded-2xl p-6 text-white relative overflow-hidden">
                <div class="mb-4 bg-white/20 w-fit p-3 rounded-xl"><i data-feather="clipboard"></i></div>
                <h4 class="text-xl font-bold">Triage Queue</h4>
                <p class="text-pink-100 text-sm mt-1">Input vitals and initial assessment</p>
            </a>
            <a href="#" class="dashboard-card bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                <div class="mb-4 bg-blue-50 text-blue-600 w-fit p-3 rounded-xl"><i data-feather="user-plus"></i></div>
                <h4 class="text-lg font-bold text-gray-800">Register Patient</h4>
                <p class="text-gray-500 text-sm mt-1">New admission entry</p>
            </a>
        </div>
    `;
}

function generatePharmacistDashboard() {
    const m = METRICS.pharmacist;
    return `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><p class="text-gray-500 text-sm">New Orders</p><h3 class="text-3xl font-bold text-green-600">${m.prescriptions}</h3></div>
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><p class="text-gray-500 text-sm">Stock Alerts</p><h3 class="text-3xl font-bold text-red-600">${m.stock_alerts}</h3></div>
        </div>

        <h3 class="text-lg font-bold text-gray-800 mb-6">Pharmacy Operations</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <a href="PHARMACY.html" class="dashboard-card bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl p-6 text-white">
                <div class="mb-4 bg-white/20 w-fit p-3 rounded-xl"><i data-feather="package"></i></div>
                <h4 class="text-xl font-bold">Dispense Queue</h4>
                <p class="text-green-100 text-sm mt-1">Process incoming e-prescriptions</p>
            </a>
            <a href="#" class="dashboard-card bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                <div class="mb-4 bg-orange-50 text-orange-600 w-fit p-3 rounded-xl"><i data-feather="database"></i></div>
                <h4 class="text-lg font-bold text-gray-800">Inventory</h4>
                <p class="text-gray-500 text-sm mt-1">Manage stock levels</p>
            </a>
        </div>
    `;
}

function generateAdminDashboard() {
    return `
        <div class="bg-indigo-900 rounded-3xl p-8 text-white mb-10 relative overflow-hidden">
            <div class="relative z-10">
                <h2 class="text-2xl font-bold mb-2">Hospital Overview</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mt-6">
                    <div><p class="text-indigo-300 text-sm">Daily Revenue</p><p class="text-3xl font-bold">${METRICS.admin.revenue}</p></div>
                    <div><p class="text-indigo-300 text-sm">Active Users</p><p class="text-3xl font-bold">${METRICS.admin.active_users}</p></div>
                    <div><p class="text-indigo-300 text-sm">System Health</p><p class="text-3xl font-bold text-green-400">${METRICS.admin.system_health}</p></div>
                </div>
            </div>
            <div class="absolute right-0 bottom-0 opacity-10 transform translate-x-10 translate-y-10">
                <i data-feather="activity" width="200" height="200"></i>
            </div>
        </div>

        <h3 class="text-lg font-bold text-gray-800 mb-6">Administration</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <a href="#" class="dashboard-card bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                <div class="mb-4 bg-gray-100 w-fit p-3 rounded-xl"><i data-feather="users"></i></div>
                <h4 class="text-lg font-bold">User Management</h4>
            </a>
            <a href="#" class="dashboard-card bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                <div class="mb-4 bg-gray-100 w-fit p-3 rounded-xl"><i data-feather="bar-chart-2"></i></div>
                <h4 class="text-lg font-bold">Reports & Analytics</h4>
            </a>
        </div>
    `;
}

function generatePatientDashboard() {
    return `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            <div class="bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-lg">
                <p class="text-blue-100 text-sm mb-1">Next Appointment</p>
                <h3 class="text-2xl font-bold flex items-center gap-2">
                    <i data-feather="calendar"></i> ${METRICS.patient.next_appt}
                </h3>
                <p class="mt-4 text-sm bg-white/20 w-fit px-3 py-1 rounded-full">General Checkup</p>
            </div>
            <div class="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex flex-col justify-center">
                <p class="text-gray-500 text-sm">Outstanding Balance</p>
                <h3 class="text-3xl font-bold text-gray-900">${METRICS.patient.bills}</h3>
                <p class="text-green-600 text-xs mt-1 font-bold">All paid up!</p>
            </div>
        </div>

        <h3 class="text-lg font-bold text-gray-800 mb-6">My Health</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <a href="#" class="dashboard-card bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                <div class="mb-4 bg-teal-50 text-teal-600 w-fit p-3 rounded-xl"><i data-feather="file-text"></i></div>
                <h4 class="text-lg font-bold">Medical Records</h4>
            </a>
            <a href="#" class="dashboard-card bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                <div class="mb-4 bg-purple-50 text-purple-600 w-fit p-3 rounded-xl"><i data-feather="pill"></i></div>
                <h4 class="text-lg font-bold">My Prescriptions</h4>
            </a>
            <a href="#" class="dashboard-card bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                <div class="mb-4 bg-blue-50 text-blue-600 w-fit p-3 rounded-xl"><i data-feather="calendar"></i></div>
                <h4 class="text-lg font-bold">Book Appointment</h4>
            </a>
        </div>
    `;

}
