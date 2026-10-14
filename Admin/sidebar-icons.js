(function () {
    const icons = {
        dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect></svg>',
        orders: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M17 15H10V55H42V49"></path><path d="M17 10H35V18H17V10Z"></path><path d="M21 10V7.5C21 5.6 22.6 4 24.5 4H27.5C29.4 4 31 5.6 31 7.5V10"></path><rect x="15" y="23" width="6" height="6"></rect><line x1="25" y1="26" x2="38" y2="26"></line><rect x="15" y="34" width="6" height="6"></rect><line x1="25" y1="37" x2="38" y2="37"></line><path d="M35 27L49 34L49 48L35 55L21 48V34L35 27Z"></path><path d="M21 34L35 41L49 34"></path><path d="M35 41V55"></path></svg>',
        menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21L7 8L12 4L17 8L19 21"></path><path d="M8 11C9.5 12 10.5 12 12 11"></path><path d="M12 11C13.5 12 14.5 12 16 11"></path></svg>',
        inventory: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7L12 3L20 7V18L12 22L4 18V7Z"></path><path d="M4 7L12 11L20 7"></path><path d="M12 11V22"></path></svg>',
        delivery: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6H15V17H3Z"></path><path d="M15 10H19L22 13V17H15Z"></path><circle cx="7" cy="18" r="2"></circle><circle cx="18" cy="18" r="2"></circle></svg>',
        payments: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><line x1="3" y1="10" x2="21" y2="10"></line><line x1="7" y1="15" x2="11" y2="15"></line></svg>',
        reports: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3A9 9 0 1 0 21 12"></path><path d="M12 3V12H21"></path></svg>',
        staff: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="4"></circle><path d="M4 21C4 16.6 7.6 14 12 14C16.4 14 20 16.6 20 21"></path></svg>',
        settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15A1.7 1.7 0 0 0 20 16.7L18.7 19L16.5 18.2A1.7 1.7 0 0 0 15 19.1L14.7 21.5H9.3L9 19.1A1.7 1.7 0 0 0 7.5 18.2L5.3 19L4 16.7A1.7 1.7 0 0 0 4.6 15L3 13L4.6 11A1.7 1.7 0 0 0 4 9.3L5.3 7L7.5 7.8A1.7 1.7 0 0 0 9 6.9L9.3 4.5H14.7L15 6.9A1.7 1.7 0 0 0 16.5 7.8L18.7 7L20 9.3A1.7 1.7 0 0 0 19.4 11L21 13L19.4 15Z"></path></svg>',
        logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17L15 12L10 7"></path><path d="M15 12H3"></path><path d="M14 4H20V20H14"></path></svg>'
    };

    function getIconKey(label) {
        const value = label.toLowerCase();
        if (value.includes("dashboard")) return "dashboard";
        if (value.includes("orders")) return "orders";
        if (value.includes("menu management")) return "menu";
        if (value.includes("inventory")) return "inventory";
        if (value.includes("delivery tracking")) return "delivery";
        if (value.includes("online payments")) return "payments";
        if (value.includes("reports")) return "reports";
        if (value.includes("staff management")) return "staff";
        if (value.includes("settings")) return "settings";
        if (value.includes("log out") || value.includes("logout")) return "logout";
        return null;
    }

    function applySidebarIcons() {
        document.querySelectorAll(".nav-item").forEach(function (item) {
            const icon = item.querySelector(":scope > .nav-icon");
            if (!icon) return;

            const label = Array.from(item.children)
                .filter(function (child) {
                    return !child.classList.contains("nav-icon") &&
                        !child.classList.contains("nav-arrow");
                })
                .map(function (child) { return child.textContent; })
                .join(" ");

            const key = getIconKey(label);
            if (key && icons[key]) {
                icon.innerHTML = icons[key];

                const svg = icon.querySelector("svg");
                svg.setAttribute("width", "22");
                svg.setAttribute("height", "22");
                svg.setAttribute("fill", "none");
                svg.setAttribute("stroke", "currentColor");
                svg.setAttribute("stroke-width", "1.8");
                svg.setAttribute("stroke-linecap", "round");
                svg.setAttribute("stroke-linejoin", "round");
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applySidebarIcons);
    } else {
        applySidebarIcons();
    }
})();
