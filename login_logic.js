// --- CONFIGURATION ---
const SUPABASE_URL = 'https://hwoelsconqsybftgdxft.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3b2Vsc2NvbnFzeWJmdGdkeGZ0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODIyNzE5MiwiZXhwIjoyMDgzODAzMTkyfQ.HDdmU4HATVu1ykNOjBjRydf6aJ6qm2xolmBWyPJprqY'; 

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const submitBtn = document.getElementById('submit-btn');
const errorMsg = document.getElementById('error-msg');
const errorText = document.getElementById('error-text');

// Expose helper to window
window.fillCreds = function(email) {
    const emailInput = document.getElementById('email');
    const passInput = document.getElementById('password');
    if(emailInput.parentElement) {
        emailInput.parentElement.classList.add('ring-2', 'ring-blue-100');
        setTimeout(() => emailInput.parentElement.classList.remove('ring-2', 'ring-blue-100'), 500);
    }
    emailInput.value = email;
    passInput.value = 'password123';
};

if(loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setLoading(true);
        hideError();

        const email = emailInput.value;
        const password = passwordInput.value;

        try {
            // 1. Authenticate
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) {
                // ENHANCED LOGGING
                console.error("Supabase Auth Error Detail:", error);
                console.error("Status:", error.status);
                console.error("Message:", error.message);
                throw error;
            }

            // 2. Fetch Role
            const userId = data.user.id;
            const profileRes = await supabaseClient
                .from('profiles')
                .select('role, full_name')
                .eq('id', userId)
                .single();

            if (profileRes.error) {
                console.warn("Profile Fetch Error:", profileRes.error);
                // Continue anyway if profile fails, just to let user in (fallback)
            }

            const role = profileRes.data ? profileRes.data.role : 'patient'; 
            const fullName = profileRes.data ? profileRes.data.full_name : 'User';

            // 3. Log the Login
            // We use a fire-and-forget approach here so it doesn't block login if it fails
            supabaseClient.from('login_history').insert({
                user_id: userId,
                role: role,
                user_agent: navigator.userAgent
            }).then(res => {
                if (res.error) console.warn("Login History Log Failed:", res.error);
            });

            // 4. Store Session & Redirect
            localStorage.setItem('smart_his_token', data.session.access_token);
            localStorage.setItem('smart_his_role', role);
            localStorage.setItem('smart_his_name', fullName);
            localStorage.setItem('smart_his_user_id', userId);

            redirectUser(role);

        } catch (err) {
            // Show more detail in the UI
            let msg = err.message || 'Invalid login credentials';
            if (msg.includes("Database error")) {
                msg += " (Server configuration issue. Check SQL permissions.)";
            }
            showError(msg);
        } finally {
            setLoading(false);
        }
    });
}

function redirectUser(role) {
    window.location.href = 'PORTAL.html';
}

function setLoading(isLoading) {
    if (isLoading) {
        submitBtn.innerHTML = '<i data-feather="loader" class="animate-spin w-4 h-4 mr-2"></i> Signing In...';
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-75', 'cursor-not-allowed');
        if(window.feather) feather.replace();
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

