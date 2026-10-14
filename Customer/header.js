
// =========================================================
// JOLIE'S PIZZA — CUSTOMER PROFILE DROPDOWN
// Pure Vanilla JavaScript
// =========================================================

document.addEventListener("DOMContentLoaded", function () {
    const apiBaseUrl =
        ["3000", "5500"].includes(window.location.port)
            ? "http://localhost:5000"
            : "";
    const profileDropdown = document.getElementById("profileDropdown");
    const profileToggle = document.getElementById("profileToggle");
    const profileMenu = document.getElementById("profileMenu");
    const logoutButton = document.getElementById("logoutButton");
    const cartButton = document.querySelector(".cart-header");
    const cartStorageKey = "joliesPizzaCart";

    function getSavedCart() {
        try {
            const value = localStorage.getItem(cartStorageKey);
            if (!value) return [];

            const cart = JSON.parse(value);
            if (!Array.isArray(cart)) {
                throw new Error("Saved cart must be an array.");
            }
            return cart.filter(item =>
                item &&
                Number.isSafeInteger(Number(item.productId)) &&
                Number(item.productId) > 0 &&
                Number.isSafeInteger(Number(item.quantity)) &&
                Number(item.quantity) > 0
            );
        } catch (error) {
            console.warn("Could not read the saved shopping cart.", error);
            return [];
        }
    }

    function updateCartHeader() {
        const items = getSavedCart();
        const count = items.reduce(
            (total, item) => total + (Number(item.quantity) || 0),
            0
        );
        const subtotal = items.reduce(
            (total, item) =>
                total + (Number(item.price) || 0) * (Number(item.quantity) || 0),
            0
        );
        const delivery = subtotal === 0 || subtotal >= 800 ? 0 : 40;
        const badge = document.getElementById("cartBadge");
        const headerTotal = document.getElementById("headerTotal");

        if (badge) {
            badge.textContent = String(count);
            badge.hidden = count === 0;
        }

        if (headerTotal) {
            headerTotal.textContent =
                `₱${(subtotal + delivery).toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                })}`;
            headerTotal.hidden = count === 0;
        }
    }

    updateCartHeader();
    window.addEventListener("storage", event => {
        if (event.key === cartStorageKey) {
            updateCartHeader();
        }
    });

    // Stop if the profile elements are missing
    if (!profileDropdown || !profileToggle || !profileMenu) {
        console.error("Profile dropdown elements were not found.");
        return;
    }

    // =====================================================
    // OPEN / CLOSE PROFILE MENU
    // =====================================================

    function openProfileMenu() {
        profileDropdown.classList.add("open");
        profileToggle.setAttribute("aria-expanded", "true");
    }

    function closeProfileMenu() {
        profileDropdown.classList.remove("open");
        profileToggle.setAttribute("aria-expanded", "false");
    }

    function toggleProfileMenu() {
        if (profileDropdown.classList.contains("open")) {
            closeProfileMenu();
        } else {
            openProfileMenu();
        }
    }

    profileToggle.addEventListener("click", function (event) {
        event.stopPropagation();
        toggleProfileMenu();
    });

    // Close when clicking outside the dropdown
    document.addEventListener("click", function (event) {
        if (!profileDropdown.contains(event.target)) {
            closeProfileMenu();
        }
    });

    // Close when pressing Escape
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            closeProfileMenu();
            profileToggle.focus();
        }
    });

    // Keep clicks inside the menu from bubbling to document
    profileMenu.addEventListener("click", function (event) {
        event.stopPropagation();
    });

    // =====================================================
    // LOAD CUSTOMER PROFILE
    // =====================================================
    // Supports common localStorage formats.
    // Change these keys to match your login.js if necessary.

    function getSavedCustomer() {
        const possibleKeys = [
            "loggedInUser",
            "currentUser",
            "user"
        ];

        for (const key of possibleKeys) {
            const storedValue = localStorage.getItem(key);

            if (!storedValue) continue;

            try {
                const user = JSON.parse(storedValue);

                if (user && typeof user === "object") {
                    return user;
                }
            } catch (error) {
                console.warn(
                    `Could not read customer data from "${key}".`,
                    error
                );
            }
        }

        return null;
    }

    function updateProfileInformation() {
        const user = getSavedCustomer();

        if (!user) {
            // Keep the HTML's default profile information.
            return;
        }

        const name =
            user.full_name ||
            user.fullName ||
            user.name ||
            "Customer";

        const email = user.email || "";
        const headerName = profileToggle.querySelector("span:nth-child(2)");
        const detailsName = profileMenu.querySelector(".profile-details strong");
        const detailsEmail = profileMenu.querySelector(".profile-details small");

        if (headerName) {
            headerName.textContent = name;
        }

        if (detailsName) {
            detailsName.textContent = name;
        }

        if (detailsEmail) {
            detailsEmail.textContent = email;
        }
    }

    updateProfileInformation();

    // =====================================================
    // LOGOUT
    // =====================================================

    if (logoutButton) {
        logoutButton.addEventListener("click", async function () {
            const confirmed = window.confirm(
                "Are you sure you want to logout?"
            );

            if (!confirmed) return;

            logoutButton.disabled = true;

            try {
                const user = getSavedCustomer();

                if (user?.sessionToken) {
                    const response = await fetch(`${apiBaseUrl}/api/logout`, {
                        method: "POST",
                        credentials: "same-origin",
                        headers: {
                            Authorization: `Bearer ${user.sessionToken}`
                        }
                    });

                    if (!response.ok) {
                        throw new Error("Server logout failed.");
                    }
                }

                // Clear only known login-related browser keys.
                [
                    "loggedInUser",
                    "currentUser",
                    "user",
                    "token",
                    "authToken"
                ].forEach(function (key) {
                    localStorage.removeItem(key);
                    sessionStorage.removeItem(key);
                });

                closeProfileMenu();

                // Adjust if your login page is in another folder.
                window.location.href = "../login.html";

            } catch (error) {
                console.error("Logout error:", error);

                logoutButton.disabled = false;

                alert(
                    "Unable to complete logout with the server. " +
                    "Check your Node.js logout endpoint."
                );
            }
        });
    }

    // =====================================================
    // CART BUTTON
    // =====================================================

    if (cartButton) {
        cartButton.addEventListener("click", function () {
            const cartPanel =
                document.querySelector(".right-panel") ||
                document.querySelector("#cartPanel");

            if (cartPanel) {
                cartPanel.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            } else {
                window.location.href = "menus.html";
            }
        });
    }
});
