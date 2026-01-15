// --- CONFIGURATION ---
const SUPABASE_URL = 'https://crywwqleinnwoacithmw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyeXd3cWxlaW5ud29hY2l0aG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MDg4MTIsImV4cCI6MjA4Mzk4NDgxMn0.VTDI6ZQ_aN895A29_v0F1vHzqaS-RG7iGzOFM6qMKfk';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const loginForm = document.getElementById('login-form');
const submitBtn = document.getElementById('submit-btn');
const errorMsg = document.getElementById('error-msg');
const errorText = document.getElementById('error-text');

// Expose helper to window for demo buttons
window.fillCreds = function(email) {
    document.getElementById('email').value = email;
    document.getElementById('password').value = "password123"; 
}

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setLoading(true);
        showError(null); 

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

            if (profileError) {
                console.warn("Profile fetch error:", profileError);
                throw new Error("User found in Auth but has no Profile. Admin needs to set up the role.");
            }

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
                window.location.href = 'portal.html'; 
            } else {
                window.location.href = 'PATIENT_PORTAL.html';
            }

        } catch (err) {
            console.error("Login Error:", err);
            let msg = err.message || 'Invalid login credentials';
            if (err.message && err.message.includes("Failed to fetch")) {
                msg = "Network Error: Could not connect to Supabase. Check internet or URL.";
            }
            showError(msg);
        } finally {
            setLoading(false);
        }
    });
}

function showError(msg) {
    if (msg) {
        if(errorText) errorText.innerText = msg;
        if(errorMsg) errorMsg.classList.remove('hidden');
    } else {
        if(errorMsg) errorMsg.classList.add('hidden');
    }
}

function setLoading(isLoading) {
    if(!submitBtn) return;
    
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
