const API_BASE_URL =
    ["3000", "5500"].includes(window.location.port)
        ? "http://localhost:5000"
        : "";
const PAGE_SIZE = 8;
const GPS_STALE_AFTER_MS = 60_000;
let deliveries = [];
let activeStatus = "all";
let currentPage = 1;
let selectedDeliveryId = "";
let gpsWatchId = null;
let gpsOrderNumber = "";
let gpsPostInProgress = false;
let lastGpsPostedAt = 0;
let staffMap = null;
let staffRiderMarker = null;

const tableBody = document.getElementById("deliveriesTableBody");
const detailsBody = document.getElementById("detailsBody");
const toast = document.getElementById("toast");

function getStaffAccount() {
    for (const storage of [window.localStorage, window.sessionStorage]) {
        const raw = storage.getItem("loggedInUser");
        if (!raw) continue;
        try {
            const account = JSON.parse(raw);
            if (
                account?.sessionToken &&
                ["staff", "admin"].includes(String(account.role).toLowerCase())
            ) {
                return account;
            }
        } catch (error) {
            console.warn("Could not read the saved staff session.", error);
        }
    }
    return null;
}

const staff = getStaffAccount();
if (staff) {
    const staffName = document.querySelector(".staff-info strong");
    const staffRole = document.querySelector(".staff-info span");
    if (staffName) staffName.textContent = staff.fullName || staff.email;
    if (staffRole) staffRole.textContent = "Delivery GPS";
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function money(value) {
    return "₱" + Number(value || 0).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function statusClass(status) {
    return String(status || "").toLowerCase().replaceAll(" ", "-");
}

function updateDateTime() {
    const now = new Date();
    document.getElementById("currentDate").textContent =
        now.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric"
        });
    document.getElementById("currentTime").textContent =
        now.toLocaleDateString("en-US", { weekday: "long" }) +
        " · " +
        now.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit"
        });
}

function isLocationStale(delivery) {
    const updatedAt = new Date(delivery.location?.updatedAt).getTime();
    return !Number.isFinite(updatedAt) || Date.now() - updatedAt > GPS_STALE_AFTER_MS;
}

function updateCounts() {
    const inDelivery = deliveries.filter(item => item.status === "Out for Delivery");
    const sharing = inDelivery.filter(item => item.location && !isLocationStale(item)).length;
    const waiting = inDelivery.filter(item => !item.location).length;
    const delayed = inDelivery.filter(item => item.location && isLocationStale(item)).length;
    const coverage = inDelivery.length
        ? `${Math.round((sharing / inDelivery.length) * 100)}%`
        : "0%";

    document.getElementById("activeDeliveryNote").textContent =
        "Pending, confirmed, preparing or out for delivery";
    document.getElementById("outCount").textContent = deliveries.length;
    document.getElementById("wayCount").textContent = sharing;
    document.getElementById("deliveredCount").textContent = waiting;
    document.getElementById("cancelledCount").textContent = delayed;
    document.getElementById("salesValue").textContent = coverage;
    document.getElementById("activeCount").textContent = deliveries.length;
    document.getElementById("allTabCount").textContent = deliveries.length;
    document.getElementById("prepTabCount").textContent =
        deliveries.filter(item => item.status !== "Out for Delivery").length;
    document.getElementById("outTabCount").textContent = inDelivery.length;
    document.getElementById("wayTabCount").textContent = sharing;
}

function getFilteredDeliveries() {
    const search = document.getElementById("deliverySearch").value.trim().toLowerCase();
    const filter = document.getElementById("statusFilter").value;
    const sort = document.getElementById("sortSelect").value;
    const result = deliveries.filter(delivery => {
        const matchesTab = activeStatus === "all"
            ? true
            : activeStatus === "gps"
                ? Boolean(delivery.location)
                : activeStatus === "prep-queue"
                    ? delivery.status !== "Out for Delivery"
                : delivery.status === activeStatus;
        const matchesFilter = filter === "all"
            ? true
            : filter === "gps"
                ? Boolean(delivery.location)
                : delivery.status === filter;
        const searchable = [
            delivery.id,
            delivery.customer,
            delivery.phone,
            delivery.address,
            delivery.rider,
            delivery.status
        ].join(" ").toLowerCase();
        return matchesTab && matchesFilter && searchable.includes(search);
    });

    const timeValue = delivery => new Date(delivery.createdAt).getTime() || 0;
    if (sort === "newest") result.sort((a, b) => timeValue(b) - timeValue(a));
    if (sort === "oldest") result.sort((a, b) => timeValue(a) - timeValue(b));
    if (sort === "eta") {
        result.sort((a, b) =>
            Number(Boolean(b.location)) - Number(Boolean(a.location)) ||
            timeValue(a) - timeValue(b)
        );
    }
    return result;
}

function renderPagination(totalPages) {
    const pagination = document.getElementById("pagination");
    let html = `<button class="page-button" type="button" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""} aria-label="Previous page"><i class="fa-solid fa-chevron-left"></i></button>`;
    for (let page = 1; page <= totalPages; page++) {
        html += `<button class="page-button ${page === currentPage ? "active" : ""}" type="button" data-page="${page}" aria-label="Page ${page}" ${page === currentPage ? 'aria-current="page"' : ""}>${page}</button>`;
    }
    html += `<button class="page-button" type="button" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""} aria-label="Next page"><i class="fa-solid fa-chevron-right"></i></button>`;
    pagination.innerHTML = html;
}

function renderDeliveries() {
    const filtered = getFilteredDeliveries();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const visible = filtered.slice(start, start + PAGE_SIZE);

    if (!visible.length) {
        tableBody.innerHTML =
            `<tr><td colspan="7" class="empty-row">${staff
                ? "No prepared or active deliveries are available."
                : "Please log in with a staff or admin account to see deliveries."}</td></tr>`;
    } else {
        tableBody.innerHTML = visible.map(delivery => `<tr data-id="${escapeHTML(delivery.id)}" class="${delivery.id === selectedDeliveryId ? "selected" : ""}">
            <td><span class="order-id">#${escapeHTML(delivery.id)}</span></td>
            <td class="customer-cell"><strong>${escapeHTML(delivery.customer)}</strong><span>${escapeHTML(delivery.phone)}</span></td>
            <td class="address-cell"><i class="fa-solid fa-location-dot"></i><span>${escapeHTML(delivery.address)}</span></td>
            <td class="rider-cell">${delivery.rider ? `<span class="rider-avatar">${escapeHTML(delivery.rider.split(" ").map(part => part[0]).slice(0, 2).join(""))}</span><span><strong>${escapeHTML(delivery.rider)}</strong><small>${escapeHTML(delivery.riderPhone)}</small></span>` : '<span class="unassigned">Unassigned</span>'}</td>
            <td><span class="status-badge ${statusClass(delivery.status)}">${escapeHTML(delivery.status)}</span></td>
            <td class="eta-cell">${delivery.status === "Preparing" ? "Ready to dispatch" : delivery.location && !isLocationStale(delivery) ? "GPS live" : "Waiting for GPS"}</td>
            <td><button class="view-button" type="button" data-view="${escapeHTML(delivery.id)}">View</button></td>
        </tr>`).join("");
    }

    document.getElementById("showingText").textContent = filtered.length
        ? `Showing ${start + 1} to ${Math.min(start + PAGE_SIZE, filtered.length)} of ${filtered.length} deliveries`
        : "Showing 0 deliveries";
    renderPagination(totalPages);
    updateCounts();
}

async function showStaffMap(delivery) {
    staffMap = null;
    staffRiderMarker = null;
    const mapElement = document.getElementById("staffLiveMap");
    if (!mapElement) return;

    try {
        const maps = await window.loadGoogleMaps(API_BASE_URL);
        if (selectedDeliveryId !== delivery.id) return;
        const geocoder = new maps.Geocoder();
        const result = await geocoder.geocode({
            address: `${delivery.address}, San Roque, Northern Samar, Philippines`
        });
        if (!result.results?.length) {
            throw new Error("Google Maps could not locate this delivery address.");
        }
        if (selectedDeliveryId !== delivery.id) return;

        const destination = result.results[0].geometry.location;
        staffMap = new maps.Map(mapElement, {
            center: destination,
            zoom: 14,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true
        });
        new maps.Marker({
            map: staffMap,
            position: destination,
            title: "Customer delivery address",
            label: "A"
        });
        if (delivery.location) {
            const currentDelivery =
                deliveries.find(item => item.id === delivery.id) || delivery;
            updateStaffMapLocation(currentDelivery.location, delivery.id);
        }
    } catch (error) {
        console.error("Could not load the rider map:", error);
        mapElement.textContent = error.message;
    }
}

function updateStaffMapLocation(location, orderNumber) {
    if (!staffMap || !window.google?.maps || selectedDeliveryId !== orderNumber) return;
    const position = {
        lat: Number(location.latitude),
        lng: Number(location.longitude)
    };
    if (!Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return;

    if (!staffRiderMarker) {
        staffRiderMarker = new window.google.maps.Marker({
            map: staffMap,
            position,
            title: "Your live GPS location",
            icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 9,
                fillColor: "#1677e8",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 3
            }
        });
    } else {
        staffRiderMarker.setPosition(position);
    }
    staffMap.panTo(position);
}

function renderDetails(delivery) {
    if (!delivery) {
        detailsBody.innerHTML = '<p class="no-selection">Select an active delivery to share its GPS location.</p>';
        return;
    }

    const itemsHTML = delivery.items.map(item =>
        `<div class="item-line"><span>${item.qty}x</span><span>${escapeHTML(item.name)}</span><strong>${money(item.price * item.qty)}</strong></div>`
    ).join("");
    const mapQuery = encodeURIComponent(`${delivery.address}, Northern Samar`);
    const isOwnShare = delivery.riderEmail === staff?.email;
    const assignedToOther = Boolean(delivery.riderEmail && !isOwnShare && !isLocationStale(delivery));
    const gpsLabel = delivery.location && !isLocationStale(delivery)
        ? "GPS Live"
        : delivery.location
            ? "GPS Delayed"
            : "Not Sharing";

    const nextStatus = {
        Pending: "Confirmed",
        Confirmed: "Preparing",
        Preparing: "Out for Delivery"
    }[delivery.status];
    const awaitingGcashPayment =
        delivery.status === "Pending" &&
        delivery.payment === "GCash" &&
        delivery.paymentStatus !== "Paid";
    const actionHTML = nextStatus
        ? `<button class="mark-delivered" type="button" data-action="advance-status" data-next-status="${escapeHTML(nextStatus)}" ${!staff || awaitingGcashPayment ? "disabled" : ""}><i class="fa-solid fa-arrow-right"></i> ${awaitingGcashPayment ? "Waiting for GCash Payment" : nextStatus === "Out for Delivery" ? "Mark Out for Delivery" : nextStatus === "Preparing" ? "Start Preparing" : "Confirm Order"}</button>`
        : isOwnShare || gpsOrderNumber === delivery.id
            ? '<button class="mark-delivered" type="button" data-action="stop-gps"><i class="fa-solid fa-location-crosshairs"></i> Stop GPS Sharing</button>'
            : `<button class="mark-delivered" type="button" data-action="start-gps" ${assignedToOther || !staff ? "disabled" : ""}><i class="fa-solid fa-location-crosshairs"></i> Start GPS Sharing</button>`;
    const gpsHelp = nextStatus
        ? awaitingGcashPayment
            ? "This GCash order can be confirmed after its payment status is Paid."
            : delivery.status === "Preparing"
            ? "Dispatch the prepared order before the rider starts GPS sharing."
            : `Advance this order to ${nextStatus} when that step is complete.`
        : isOwnShare
            ? "Your live location is shared with this order's customer. Keep this page open."
            : assignedToOther
                ? "Another rider is sharing GPS for this order."
                : "Start GPS sharing on delivery. Your location will be visible to this order's customer while sharing is on.";

    detailsBody.innerHTML = `<div class="detail-order-top"><h3>#${escapeHTML(delivery.id)}</h3><span class="status-badge ${statusClass(delivery.status)}">${escapeHTML(delivery.status)}</span></div>
        <div class="rider-detail"><span class="rider-avatar large">${staff?.fullName ? escapeHTML(staff.fullName.split(" ").map(part => part[0]).slice(0, 2).join("")) : "--"}</span><div><strong>${escapeHTML(delivery.rider || "No rider sharing GPS")}</strong><span>${escapeHTML(delivery.riderPhone || gpsLabel)}</span></div><div class="rating">${escapeHTML(gpsLabel)}</div></div>
        <section class="detail-section"><div class="section-title-row"><h3>Delivery Address</h3><a class="map-link" href="https://www.google.com/maps/search/?api=1&query=${mapQuery}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-location-dot"></i> View in Maps</a></div><p class="address-detail"><i class="fa-solid fa-location-dot"></i>${escapeHTML(delivery.address)}<br><span>Northern Samar</span></p></section>
        <section class="detail-section"><div class="section-title-row"><h3>Live Rider GPS</h3><span class="live-label"><i></i>${escapeHTML(gpsLabel)}</span></div><div id="staffLiveMap" class="staff-live-map" role="application" aria-label="Map for selected delivery">Loading Google Maps…</div><p class="gps-help" id="gpsHelp">${staff ? gpsHelp : "Sign in with a staff or admin account to share GPS."}</p></section>
        <div class="delivery-meta"><div><span>Order Time</span><strong>${escapeHTML(delivery.orderTime)}</strong></div><div><span>GPS Last Update</span><strong>${delivery.location ? escapeHTML(new Date(delivery.location.updatedAt).toLocaleTimeString("en-PH")) : "Not available"}</strong></div><div><span>Payment Method</span><strong>${escapeHTML(delivery.payment)}</strong></div><div><span>Order Amount</span><strong>${money(delivery.total)}</strong></div></div>
        <div class="detail-section"><h3>Order Items (${delivery.items.reduce((sum, item) => sum + item.qty, 0)})</h3>${itemsHTML}<div class="total-line"><span>Total Amount</span><strong>${money(delivery.total)}</strong></div></div>
        <div class="detail-actions">${actionHTML}<a class="contact-customer" href="tel:${escapeHTML(delivery.phone.replace(/[^\d+]/g, ""))}"><i class="fa-solid fa-phone"></i> Contact Customer</a></div>`;
    void showStaffMap(delivery);
}

async function advanceDeliveryStatus(delivery, nextStatus) {
    if (!staff?.sessionToken) {
        showToast("Log in with a staff or admin account to update order status.");
        return;
    }

    const button = detailsBody.querySelector('[data-action="advance-status"]');
    if (button) button.disabled = true;
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/staff/orders/${encodeURIComponent(delivery.id)}/status`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${staff.sessionToken}`
                },
                body: JSON.stringify({ status: nextStatus })
            }
        );
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || "Could not update this order.");
        }
        showToast(result.message);
        await loadDeliveries();
        if (selectedDeliveryId === delivery.id) {
            renderDetails(deliveries.find(item => item.id === delivery.id));
        }
    } catch (error) {
        showToast(error.message);
        if (button) button.disabled = false;
    }
}

function selectDelivery(id) {
    if (gpsWatchId !== null && gpsOrderNumber !== id) {
        showToast("Stop the active GPS share before switching to another order.");
        return;
    }
    const delivery = deliveries.find(item => item.id === id);
    if (!delivery) return;
    selectedDeliveryId = id;
    renderDeliveries();
    renderDetails(delivery);
}

async function loadDeliveries() {
    if (!staff?.sessionToken) {
        deliveries = [];
        renderDeliveries();
        detailsBody.innerHTML =
            '<p class="no-selection">Log in with a staff or admin account before sharing delivery GPS.</p>';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/staff/deliveries`, {
            headers: { Authorization: `Bearer ${staff.sessionToken}` },
            cache: "no-store"
        });
        const result = await response.json();
        if (!response.ok || !result.success || !Array.isArray(result.deliveries)) {
            throw new Error(result.message || "Could not load active deliveries.");
        }
        const previousSelectedId = selectedDeliveryId;
        deliveries = result.deliveries;
        if (!deliveries.some(item => item.id === selectedDeliveryId)) {
            selectedDeliveryId = deliveries[0]?.id || "";
        }
        renderDeliveries();
        const selectedDelivery =
            deliveries.find(item => item.id === selectedDeliveryId);
        if (selectedDelivery && selectedDelivery.id === previousSelectedId && staffMap) {
            if (selectedDelivery.location) {
                updateStaffMapLocation(selectedDelivery.location, selectedDelivery.id);
            } else if (staffRiderMarker) {
                staffRiderMarker.setMap(null);
                staffRiderMarker = null;
            }
            const help = document.getElementById("gpsHelp");
            if (help && !gpsOrderNumber) {
                help.textContent = selectedDelivery.location
                    ? `Rider GPS last updated ${new Date(selectedDelivery.location.updatedAt).toLocaleTimeString("en-PH")}.`
                    : "Start GPS sharing while on delivery; keep this page open.";
            }
            const riderName = detailsBody.querySelector(".rider-detail strong");
            const riderPhone = detailsBody.querySelector(".rider-detail span");
            if (riderName) {
                riderName.textContent = selectedDelivery.rider || "No rider sharing GPS";
            }
            if (riderPhone) {
                riderPhone.textContent = selectedDelivery.riderPhone ||
                    (selectedDelivery.location ? "GPS location received" : "Not sharing");
            }
        } else {
            renderDetails(selectedDelivery);
        }
    } catch (error) {
        console.error("Could not load active deliveries:", error);
        showToast(error.message);
        tableBody.innerHTML =
            '<tr><td colspan="7" class="empty-row">Unable to load deliveries. Check the backend and database.</td></tr>';
    }
}

async function postGpsLocation(orderNumber, position) {
    const response = await fetch(
        `${API_BASE_URL}/api/staff/orders/${encodeURIComponent(orderNumber)}/location`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${staff.sessionToken}`
            },
            body: JSON.stringify({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                speed: position.coords.speed,
                heading: position.coords.heading
            })
        }
    );
    const result = await response.json();
    if (!response.ok || !result.success) {
        throw new Error(result.message || "The GPS location could not be shared.");
    }

    const delivery = deliveries.find(item => item.id === orderNumber);
    if (delivery) {
        delivery.location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed,
            heading: position.coords.heading,
            updatedAt: result.updatedAt
        };
        delivery.rider = staff.fullName || staff.email;
        delivery.riderEmail = staff.email;
        renderDeliveries();
        updateCounts();
        updateStaffMapLocation(delivery.location, orderNumber);
        if (selectedDeliveryId === orderNumber) {
            const riderName = detailsBody.querySelector(".rider-detail strong");
            const riderStatus = detailsBody.querySelector(".rider-detail span");
            const gpsLabel = detailsBody.querySelector(".rating");
            if (riderName) riderName.textContent = delivery.rider;
            if (riderStatus) riderStatus.textContent = "GPS is live from this phone";
            if (gpsLabel) gpsLabel.textContent = "GPS Live";
        }
        const help = document.getElementById("gpsHelp");
        if (help && selectedDeliveryId === orderNumber) {
            help.textContent =
                `GPS shared with the customer. Accuracy ±${Math.round(position.coords.accuracy)} m.`;
        }
    }
}

function startGpsSharing(delivery) {
    if (!staff?.sessionToken) {
        showToast("Log in with a staff or admin account to share GPS.");
        return;
    }
    if (!window.isSecureContext || !navigator.geolocation) {
        showToast("GPS sharing requires this page to be served over HTTPS.");
        return;
    }
    if (gpsWatchId !== null) {
        showToast("Stop the current GPS share before selecting another order.");
        return;
    }

    gpsOrderNumber = delivery.id;
    lastGpsPostedAt = 0;
    renderDetails(delivery);
    showToast("Allow location access to start sharing GPS.");
    gpsWatchId = navigator.geolocation.watchPosition(
        async position => {
            if (
                gpsPostInProgress ||
                gpsOrderNumber !== delivery.id ||
                Date.now() - lastGpsPostedAt < 5000
            ) return;
            gpsPostInProgress = true;
            try {
                await postGpsLocation(delivery.id, position);
                lastGpsPostedAt = Date.now();
            } catch (error) {
                showToast(error.message);
                void stopGpsSharing(true, false);
            } finally {
                gpsPostInProgress = false;
            }
        },
        error => {
            const message = error.code === error.PERMISSION_DENIED
                ? "Location permission was denied. Allow location in your browser settings."
                : error.code === error.POSITION_UNAVAILABLE
                    ? "The phone could not determine its GPS location."
                    : "The GPS request timed out. Try again outdoors.";
            showToast(message);
            void stopGpsSharing(true, false);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 20_000
        }
    );
}

async function stopGpsSharing(notifyServer = true, showSuccess = true) {
    const orderNumber = gpsOrderNumber;
    if (gpsWatchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(gpsWatchId);
    }
    gpsWatchId = null;
    gpsOrderNumber = "";

    if (notifyServer && orderNumber && staff?.sessionToken) {
        try {
            const response = await fetch(
                `${API_BASE_URL}/api/staff/orders/${encodeURIComponent(orderNumber)}/location`,
                {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${staff.sessionToken}` }
                }
            );
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || "Could not stop GPS sharing.");
            }
            if (showSuccess) showToast(result.message);
        } catch (error) {
            showToast(error.message);
        }
    }

    await loadDeliveries();
}

detailsBody.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const action = target.closest("[data-action]")?.dataset.action;
    const delivery = deliveries.find(item => item.id === selectedDeliveryId);
    if (!delivery) return;
    if (action === "advance-status") {
        void advanceDeliveryStatus(delivery, target.closest("[data-action]")?.dataset.nextStatus);
        return;
    }
    if (action === "start-gps") startGpsSharing(delivery);
    if (action === "stop-gps") void stopGpsSharing();
});

tableBody.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const row = target.closest("tr[data-id]");
    const id = target.closest("[data-view]")?.dataset.view || row?.dataset.id;
    if (id) selectDelivery(id);
});

document.getElementById("deliveryTabs").addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const tab = target.closest("[data-status]");
    if (!tab) return;
    activeStatus = tab.dataset.status;
    document.querySelectorAll(".delivery-tab").forEach(item => {
        const isActive = item === tab;
        item.classList.toggle("active", isActive);
        item.setAttribute("aria-selected", String(isActive));
    });
    currentPage = 1;
    renderDeliveries();
});

document.getElementById("deliverySearch").addEventListener("input", () => {
    currentPage = 1;
    renderDeliveries();
});
document.getElementById("statusFilter").addEventListener("change", () => {
    currentPage = 1;
    renderDeliveries();
});
document.getElementById("sortSelect").addEventListener("change", () => {
    currentPage = 1;
    renderDeliveries();
});
document.getElementById("pagination").addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("[data-page]");
    if (!button || button.disabled) return;
    currentPage = Number(button.dataset.page);
    renderDeliveries();
});
document.getElementById("menuToggle").addEventListener("click", event => {
    const isOpen = document.getElementById("sidebar").classList.toggle("open");
    event.currentTarget.setAttribute("aria-expanded", String(isOpen));
});
document.getElementById("closeDetails").addEventListener("click", () => {
    document.getElementById("detailsCard").classList.toggle("details-collapsed");
});
document.getElementById("logoutButton").addEventListener("click", async () => {
    if (!confirm("Are you sure you want to logout?")) return;
    if (gpsWatchId !== null) await stopGpsSharing();
    if (staff?.sessionToken) {
        try {
            await fetch(`${API_BASE_URL}/api/logout`, {
                method: "POST",
                headers: { Authorization: `Bearer ${staff.sessionToken}` }
            });
        } catch (error) {
            console.warn("Could not invalidate the staff session.", error);
        }
    }
    localStorage.removeItem("loggedInUser");
    sessionStorage.removeItem("loggedInUser");
    window.location.href = "../login.html";
});

window.addEventListener("pagehide", () => {
    if (gpsWatchId === null || !staff?.sessionToken) return;
    navigator.geolocation.clearWatch(gpsWatchId);
    fetch(
        `${API_BASE_URL}/api/staff/orders/${encodeURIComponent(gpsOrderNumber)}/location`,
        {
            method: "DELETE",
            headers: { Authorization: `Bearer ${staff.sessionToken}` },
            keepalive: true
        }
    ).catch(error => console.warn("Could not end the GPS share:", error));
});

updateDateTime();
void loadDeliveries();
setInterval(updateDateTime, 60_000);
setInterval(() => void loadDeliveries(), 15_000);
