// --- CONFIGURATION ---
const SUPABASE_URL = 'https://hwoelsconqsybftgdxft.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3b2Vsc2NvbnFzeWJmdGdkeGZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMjcxOTIsImV4cCI6MjA4MzgwMzE5Mn0.2FhYBIlXDfdRk-21R1uNiRp8rTNiROw0T9T35Cz8K4c';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const submitBtn = document.getElementById('submit-btn');
const errorMsg = document.getElementById('error-msg');
const errorText = document.getElementById('error-text');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoading(true);
    hideError();

    const email = emailInput.value;
    const password = passwordInput.value;

    try {
        // 1. Authenticate
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        // 2. Fetch Role
        const userId = data.user.id;
        const profileRes = await supabase
            .from('profiles')
            .select('role, full_name')
            .eq('id', userId)
            .single();

        const role = profileRes.data ? profileRes.data.role : 'patient'; // Default to patient
        const fullName = profileRes.data ? profileRes.data.full_name : 'User';

        // 3. Log the Login (Proper Auditing)
        await supabase.from('login_history').insert({
            user_id: userId,
            role: role,
            user_agent: navigator.userAgent
        });

        // 4. Store Session & Redirect
        localStorage.setItem('smart_his_token', data.session.access_token);
        localStorage.setItem('smart_his_role', role);
        localStorage.setItem('smart_his_name', fullName);

        redirectUser(role);

    } catch (err) {
        showError(err.message || 'Invalid login credentials');
    } finally {
        setLoading(false);
    }
});

function redirectUser(role) {
    // Map roles to their specific dashboards
    switch(role) {
        case 'doctor':      window.location.href = 'portal.html'; break;
        case 'nurse':       window.location.href = 'APPOINTMENTS.html'; break;
        case 'pharmacist':  window.location.href = 'PHARMACY.html'; break;
        case 'admin':       window.location.href = 'ADMIN_DASHBOARD.html'; break;
        default:            window.location.href = 'PATIENT_PORTAL.html';
    }
}

function setLoading(isLoading) {
    if (isLoading) {
        submitBtn.innerHTML = '<i data-feather="loader" class="animate-spin w-4 h-4 mr-2"></i> Signing In...';
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-75', 'cursor-not-allowed');
        feather.replace();
    } else {
        submitBtn.innerHTML = 'Sign In to Account';
        submitBtn.disabled = false;
        submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
}

function showError(msg) {
    errorText.innerText = msg;
    errorMsg.classList.remove('hidden');
}

function hideError() {
    errorMsg.classList.add('hidden');

}

