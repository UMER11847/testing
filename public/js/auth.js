// public/js/auth.js

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');

    if (loginForm) {
        loginForm.addEventListener('submit', async e => {
            e.preventDefault();

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (data.success) {
                // Save user info for session persistence (Req. 1)
                localStorage.setItem('userId', data.user.id);
                localStorage.setItem('userRole', data.user.role); // Req. 2
                localStorage.setItem('userName', data.user.name);

                alert('Login successful! Redirecting to dashboard...');
                window.location.href = 'dashboard.html'; // Redirect to dashboard
            } else {
                alert(data.message || 'Login failed. Check your credentials.');
            }
        });
    }

    // Gmail Login Simulation
    const gmailBtn = document.getElementById('gmailLoginBtn');
    if (gmailBtn) {
        gmailBtn.addEventListener('click', async () => {
            // Simulate Google Auth Popup Response
            const googleUser = {
                name: "Google User",
                email: "googleuser@gmail.com"
            };

            try {
                const res = await fetch('/api/auth/google', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(googleUser)
                });
                const result = await res.json();

                if (result.success) {
                    localStorage.setItem('userId', result.user.id);
                    localStorage.setItem('userRole', result.user.role);
                    localStorage.setItem('userName', result.user.name);
                    alert('Google Login successful!');
                    window.location.href = 'dashboard.html';
                } else {
                    alert(result.message);
                }
            } catch (err) {
                console.error(err);
                alert('Google login failed');
            }
        });
    }
});