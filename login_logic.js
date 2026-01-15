// --- CONFIGURATION ---
const SUPABASE_URL = 'https://wasadrygnoevtkckqqrv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhc2Fkcnlnbm9ldnRrY2txcXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzOTcyODAsImV4cCI6MjA4Mzk3MzI4MH0.rLwmxWdLu3qQlJx0yOoT5BsO-EmBwVs6wLq6Tk4Gnnk';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const loginForm = document.getElementById('login-form');
const submitBtn = document.getElementById('submit-btn');
const errorMsg = document.getElementById('error-msg');
const errorText = document.getElementById('error-text');

// Expose helper to window for demo buttons
window.fillCreds = function(email) {
    document.getElementById('email').value = email;
    document.getElementById('password').value = "password123"; // Mock password for demo convenience
}

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setLoading(true);
        showError(null); // Clear previous errors

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            // 1. Auth with Supabase
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            const userId = data.user.id;

            // 2. Fetch User Profile to get Role
            const { data: profile, error: profileError } = await supabaseClient
                .from('profiles')
                .select('role, full_name')
                .eq('id', userId)
                .single();

            if (profileError) throw new Error("Profile not found. Contact Admin.");

            const role = profile.role || 'patient';
            const fullName = profile.full_name || email.split('@')[0];

            // 3. Store Session
            localStorage.setItem('smart_his_token', data.session.access_token);
            localStorage.setItem('smart_his_role', role);
            localStorage.setItem('smart_his_name', fullName);
            localStorage.setItem('smart_his_user_id', userId);

            // 4. Redirect based on Role
            if (role === 'doctor') {
                window.location.href = 'APPOINTMENTS.html';
            } else if (role === 'admin') {
                window.location.href = 'ADMIN.html';
            } else {
                window.location.href = 'PATIENT_PORTAL.html';
            }

        } catch (err) {
            let msg = err.message || 'Invalid login credentials';
            showError(msg);
        } finally {
            setLoading(false);
        }
    });
}

function showError(msg) {
    if (msg) {
        errorText.innerText = msg;
        errorMsg.classList.remove('hidden');
    } else {
        errorMsg.classList.add('hidden');
    }
}

function setLoading(isLoading) {
    if (isLoading) {
        submitBtn.innerHTML = '<i data-feather="loader" class="animate-spin w-4 h-4 mr-2"></i> Signing In...';
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-75');
    } else {
        submitBtn.innerHTML = 'Sign In to Account';
        submitBtn.disabled = false;
        submitBtn.classList.remove('opacity-75');
    }
    if(window.feather) feather.replace();
}
