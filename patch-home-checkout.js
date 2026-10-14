const fs = require('fs');

const filePath = 'C:/Users/Ardeen/OneDrive/Documents/Jolies Pizza/Customer/home.html';
let text = fs.readFileSync(filePath, 'utf8');

const pattern = /\/\* =====================================================\n\s*CHECKOUT\n\s*\*{1,}\/\s*[\s\S]*?\/\* =====================================================\n\s*SCROLL TO MENU\n\s*\*{1,}\/\s*/;

const replacement = `/* =====================================================
           CHECKOUT MODAL
        ===================================================== */

        function openCheckoutModal() {

            if (!cart || cart.length === 0) {

                showToast(
                    "Your cart is empty. Please add an item first."
                );

                return;
            }


            const modal =
                document.getElementById("checkoutModal");

            if (!modal) return;


            renderCheckoutItems();

            modal.classList.add("show");

            document.body.style.overflow = "hidden";
        }


        function renderCheckoutItems() {

            const container =
                document.getElementById("checkoutItems");

            if (!container) return;


            container.innerHTML = "";


            cart.forEach(item => {

                const quantity = Number(item.quantity || 1);
                const price = Number(item.price || 0);
                const total = price * quantity;

                let image = item.image || "../images/logo.png";

                if (!item.image) {
                    if (item.name.includes("Pepperoni")) {
                        image = "../images/Pepperoni.png";
                    }
                    else if (item.name.includes("Fries")) {
                        image = "../images/Garlic Fries.png";
                    }
                    else if (item.name.includes("Coke")) {
                        image = "../images/coke.png";
                    }
                    else if (item.name.includes("Pizza")) {
                        image = "../images/Pepperoni.png";
                    }
                }

                const detail = item.detail || (item.name.includes("Pizza") ? '12" • Regular' : item.name.includes("Fries") ? "Solo" : "Regular");

                const itemHTML = `

            <div class="checkout-item">

                <img
                    class="checkout-item-image"
                    src="${image}"
                    alt="${escapeHtml(item.name)}"
                >

                <div class="checkout-item-info">

                    <strong>
                        ${escapeHtml(item.name)}
                    </strong>

                    <small>
                        ${escapeHtml(detail)}
                        × ${quantity}
                    </small>

                </div>

                <strong class="checkout-item-price">
                    ₱${money(total)}
                </strong>

            </div>

        `;

                container.insertAdjacentHTML("beforeend", itemHTML);
            });

            updateCheckoutTotals();
        }


        function updateCheckoutTotals() {

            let subtotal = 0;

            cart.forEach(item => {
                subtotal += Number(item.price || 0) * Number(item.quantity || 1);
            });

            const deliveryFee = subtotal >= 800 ? 0 : DELIVERY_FEE;
            const total = subtotal + deliveryFee;

            const subtotalElement = document.getElementById("checkoutSubtotal");
            const deliveryElement = document.getElementById("checkoutDelivery");
            const totalElement = document.getElementById("checkoutTotal");

            if (subtotalElement) {
                subtotalElement.textContent = `₱${money(subtotal)}`;
            }

            if (deliveryElement) {
                deliveryElement.textContent = `₱${money(deliveryFee)}`;
            }

            if (totalElement) {
                totalElement.textContent = `₱${money(total)}`;
            }
        }


        function closeCheckoutModal() {

            const modal = document.getElementById("checkoutModal");

            if (!modal) return;

            modal.classList.remove("show");
            document.body.style.overflow = "";
        }


        function initializeCheckoutModal() {

            const checkoutButton = document.getElementById("checkout");
            const closeButton = document.getElementById("checkoutClose");
            const cancelButton = document.getElementById("checkoutCancel");
            const overlay = document.querySelector(".checkout-modal-overlay");
            const placeOrderButton = document.getElementById("placeOrderButton");

            if (checkoutButton) {
                checkoutButton.addEventListener("click", openCheckoutModal);
            }

            if (closeButton) {
                closeButton.addEventListener("click", closeCheckoutModal);
            }

            if (cancelButton) {
                cancelButton.addEventListener("click", closeCheckoutModal);
            }

            if (overlay) {
                overlay.addEventListener("click", closeCheckoutModal);
            }

            document.addEventListener("keydown", event => {
                if (event.key === "Escape") {
                    closeCheckoutModal();
                }
            });

            if (placeOrderButton) {
                placeOrderButton.addEventListener("click", placeOrder);
            }
        }


        function placeOrder() {

            if (!cart || cart.length === 0) {
                showToast("Your cart is empty.");
                return;
            }

            const address = document.getElementById("checkoutAddress")?.value.trim();

            if (!address) {
                showToast("Please enter your delivery address.");
                document.getElementById("checkoutAddress")?.focus();
                return;
            }

            const payment = document.querySelector('input[name="paymentMethod"]:checked')?.value || "Cash on Delivery";

            const order = {
                orderId: "JP-" + Date.now(),
                items: JSON.parse(JSON.stringify(cart)),
                address: address,
                paymentMethod: payment,
                orderDate: new Date().toISOString()
            };

            localStorage.setItem("joliesPizzaLatestOrder", JSON.stringify(order));
            closeCheckoutModal();
            showToast(`Order ${order.orderId} placed successfully!`);
        }


        /* =====================================================
           SCROLL TO MENU
        ===================================================== */`;

if (!pattern.test(text)) {
    console.log('Checkout pattern not found in home.html');
    process.exit(1);
}

text = text.replace(pattern, replacement);
fs.writeFileSync(filePath, text, 'utf8');
console.log('Updated checkout modal flow in home.html');
