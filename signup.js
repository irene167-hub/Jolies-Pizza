
/* =========================================================
   JOLIE'S PIZZA — SIGNUP
   Pure Vanilla JavaScript + Node.js API
========================================================= */

const roleCards = document.querySelectorAll(".role-card");
const formSteps = document.querySelectorAll(".form-step");
const progressSteps = document.querySelectorAll(".progress-step");
const nextBtn = document.getElementById("nextBtn");
const signupForm = document.getElementById("signupForm");
const errorMessage = document.getElementById("errorMessage");

let selectedRole = "customer";
let currentStep = 1;

/* =========================================================
   ROLE SELECTION
========================================================= */

roleCards.forEach(card => {
    card.addEventListener("click", () => {
        roleCards.forEach(item => item.classList.remove("active"));
        card.classList.add("active");
        selectedRole = card.dataset.role;
    });
});

/* =========================================================
   FORM STEPS
========================================================= */

function goToStep(step) {
    currentStep = step;

    formSteps.forEach(formStep => {
        formStep.classList.toggle(
            "active",
            formStep.id === `step${step}`
        );
    });

    progressSteps.forEach((progressStep, index) => {
        progressStep.classList.toggle("active", index < step);
    });

    errorMessage.style.display = "none";
}

nextBtn.addEventListener("click", () => {
    goToStep(2);
});

/* =========================================================
   SHOW / HIDE PASSWORD
========================================================= */

document.querySelectorAll(".password-toggle").forEach(button => {
    button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.target);
        const icon = button.querySelector("i");

        if (!input || !icon) return;

        const showPassword = input.type === "password";
        input.type = showPassword ? "text" : "password";

        icon.classList.toggle("fa-eye", !showPassword);
        icon.classList.toggle("fa-eye-slash", showPassword);
    });
});

/* =========================================================
   VALIDATION HELPERS
========================================================= */

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = "block";
}

document.querySelectorAll(".input-group input").forEach(input => {
    input.addEventListener("input", () => {
        errorMessage.style.display = "none";
    });
});

/* =========================================================
   REGISTER ACCOUNT
========================================================= */

signupForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (currentStep !== 2) return;

    const fullName = document.getElementById("fullName").value.trim();
    const email = document.getElementById("email").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const termsAccepted = document.getElementById("terms").checked;

    /* Validate fields */

    if (!fullName || !email || !phone || !password || !confirmPassword) {
        showError("Please complete all fields.");
        return;
    }

    if (!validateEmail(email)) {
        showError("Please enter a valid email address.");
        return;
    }

    if (password.length < 8) {
        showError("Password must contain at least 8 characters.");
        return;
    }

    if (password !== confirmPassword) {
        showError("Passwords do not match.");
        return;
    }

    if (!termsAccepted) {
        showError("Please agree to the Terms and Conditions and Privacy Policy.");
        return;
    }

    const submitButton = signupForm.querySelector(
        'button[type="submit"]'
    );

    const originalButtonHTML = submitButton.innerHTML;

    submitButton.disabled = true;
    submitButton.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> Creating Account...';

    try {
        const response = await fetch("/api/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                fullName,
                email,
                phone,
                password,
                confirmPassword,
                role: selectedRole,
                termsAccepted
            })
        });

        const result = await response.json();

        if (!response.ok || result.success !== true) {
            showError(
                result.message || "Registration failed. Please try again."
            );
            return;
        }

        /* Show the success step only after the server confirms saving */

        goToStep(3);

    } catch (error) {
        console.error("Registration error:", error);

        showError(
            "Unable to connect to the server. Make sure Node.js is running."
        );
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonHTML;
    }
});
