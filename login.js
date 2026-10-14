
/* =========================================================
   JOELIE'S PIZZA LOGIN
   Vanilla JavaScript + Node.js + MySQL
========================================================= */

/* ROLE SELECTION */
const roleCards = document.querySelectorAll(".role-card");
let selectedRole = "customer";

roleCards.forEach(card => {
    card.addEventListener("click", () => {
        roleCards.forEach(item => item.classList.remove("active"));
        card.classList.add("active");
        selectedRole = card.dataset.role;
    });
});

/* PASSWORD SHOW / HIDE */
const passwordInput = document.getElementById("password");
const togglePassword = document.getElementById("togglePassword");

togglePassword.addEventListener("click", () => {
    const isHidden = passwordInput.type === "password";

    passwordInput.type = isHidden ? "text" : "password";

    togglePassword.textContent = isHidden ? "◉" : "◉";
    togglePassword.setAttribute(
        "aria-label",
        isHidden ? "Hide password" : "Show password"
    );
});

/* LOGIN FORM */
const loginForm = document.getElementById("loginForm");
const message = document.getElementById("message");
const loginButton = loginForm.querySelector(".login-btn");

loginForm.addEventListener("submit", async event => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = passwordInput.value;
    const remember = document.getElementById("remember").checked;

    if (!email || !password) {
        showMessage("Please enter your email address and password.");
        return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showMessage("Please enter a valid email address.");
        return;
    }

    const originalButtonText = loginButton.textContent;
    loginButton.disabled = true;
    loginButton.textContent = "Logging in...";

    try {
        const response = await fetch("/api/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email,
                password,
                role: selectedRole,
                remember
            })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            showMessage(result.message || "Login failed.");
            return;
        }

        // Ensure the selected role matches the registered account.
        if (
            !result.user ||
            result.user.role.toLowerCase() !== selectedRole.toLowerCase()
        ) {
            showMessage(
                "The selected account type does not match this account."
            );
            return;
        }

        if (!result.sessionToken) {
            showMessage("Login could not create a secure session. Please try again.");
            return;
        }

        // Keep the short-lived API session with the signed-in customer.
        const storage = remember ? localStorage : sessionStorage;

        [
            "loggedInUser",
            "currentUser",
            "user",
            "token",
            "authToken"
        ].forEach(key => {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        });

        storage.setItem("loggedInUser", JSON.stringify({
            id: result.user.id,
            fullName: result.user.fullName,
            email: result.user.email,
            role: result.user.role,
            sessionToken: result.sessionToken
        }));

        showMessage("Login successful! Redirecting...");

        const destinations = {
            customer: "Customer/home.html",
            staff: "Staff/dashboard.html",
            admin: "Admin/dashboard.html"
        };

        setTimeout(() => {
            window.location.href = destinations[selectedRole];
        }, 700);

    } catch (error) {
        console.error("Login request failed:", error);
        showMessage(
            "Unable to connect to the server. Make sure Node.js is running."
        );
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = originalButtonText;
    }
});

/* MESSAGE */
function showMessage(text) {
    message.textContent = text;
    message.style.display = "block";
    message.setAttribute("role", "status");
}

/* FORGOT PASSWORD */
document.getElementById("forgotPassword").addEventListener("click", event => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();

    if (!email) {
        showMessage("Please enter your email address first.");
        return;
    }

    showMessage(
        "Password recovery is not connected yet. Please implement a secure reset process."
    );
});

/* GOOGLE LOGIN */
document.getElementById("googleLogin").addEventListener("click", () => {
    showMessage(
        "Google login is not configured yet. Connect Google authentication to enable it."
    );
});
