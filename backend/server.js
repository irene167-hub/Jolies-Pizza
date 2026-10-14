/* =========================================================
   JOLIE'S PIZZA
   NODE.JS SERVER + MYSQL + REGISTER + LOGIN
   Pure Node.js HTTP server (no Express.js)
========================================================= */

require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const db = require("./db");

const PORT = Number(process.env.PORT || 3000);
const API_SESSION_TTL = 12 * 60 * 60 * 1000;
const apiSessions = new Map();

// Update this list if your frontend runs on a different origin.
const ALLOWED_ORIGINS = new Set([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500"
]);

/* =========================================================
   JSON RESPONSE
========================================================= */

function sendJSON(res, statusCode, data) {
    if (res.writableEnded) return;

    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });

    res.end(JSON.stringify(data));
}

/* =========================================================
   READ JSON REQUEST BODY
========================================================= */

function readJSON(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        let size = 0;

        req.on("data", chunk => {
            size += chunk.length;

            if (size > 1024 * 1024) {
                reject(new Error("Request body is too large."));
                req.destroy();
                return;
            }
            body += chunk;
        });

        req.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                reject(new Error("Invalid JSON request body."));
            }
        });

        req.on("error", reject);
    });
}

function readRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let tooLarge = false;

        req.on("data", chunk => {
            size += chunk.length;
            if (size > 1024 * 1024) {
                tooLarge = true;
                return;
            }
            chunks.push(chunk);
        });

        req.on("end", () => {
            if (tooLarge) {
                reject(new Error("Webhook request body is too large."));
                return;
            }
            resolve(Buffer.concat(chunks));
        });
        req.on("error", reject);
    });
}

function getRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        let finished = false;

        req.on("data", chunk => {
            body += chunk.toString();

            if (body.length > 1024 * 1024 && !finished) {
                finished = true;
                reject(new Error("Request body is too large."));
                req.destroy();
            }
        });

        req.on("end", () => {
            if (finished) return;

            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                reject(new Error("Invalid JSON request."));
            }
        });

        req.on("error", error => {
            if (!finished) {
                finished = true;
                reject(error);
            }
        });
    });
}

function cleanText(value, maxLength = 255) {
    return typeof value === "string"
        ? value.trim().slice(0, maxLength)
        : "";
}

function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function setCors(req, res) {
    const origin = req.headers.origin;

    if (origin && ALLOWED_ORIGINS.has(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
    }

    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, DELETE, OPTIONS"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
    );
}

function createApiSession(email, role) {
    for (const [token, session] of apiSessions) {
        if (session.email === email || session.expiresAt <= Date.now()) {
            apiSessions.delete(token);
        }
    }

    const token = crypto.randomBytes(32).toString("hex");
    apiSessions.set(token, {
        email,
        role,
        expiresAt: Date.now() + API_SESSION_TTL
    });
    return token;
}

function getApiSession(req) {
    const match = /^Bearer ([a-f0-9]{64})$/i.exec(
        req.headers.authorization || ""
    );

    if (!match) return null;

    const token = match[1].toLowerCase();
    const session = apiSessions.get(token);

    if (!session || session.expiresAt <= Date.now()) {
        apiSessions.delete(token);
        return null;
    }

    return { token, ...session };
}

/* =========================================================
   REGISTER USER
========================================================= */

async function registerUser(req, res) {
    try {
        const body = await getRequestBody(req);

        const fullName = String(body.fullName || "").trim();
        const email = String(body.email || "").trim().toLowerCase();
        const phone = String(body.phone || "").trim();
        const password = String(body.password || "");
        const confirmPassword = String(body.confirmPassword || "");
        const role = String(body.role || "").trim().toLowerCase();
        const termsAccepted = body.termsAccepted === true;

        if (!fullName || !email || !phone || !password || !confirmPassword || !role) {
            return sendJSON(res, 400, {
                success: false,
                message: "Please complete all required fields."
            });
        }

        const allowedRoles = ["customer", "staff", "admin"];

        if (!allowedRoles.includes(role)) {
            return sendJSON(res, 400, {
                success: false,
                message: "Invalid account type."
            });
        }

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(email)) {
            return sendJSON(res, 400, {
                success: false,
                message: "Please enter a valid email address."
            });
        }

        if (password.length < 8) {
            return sendJSON(res, 400, {
                success: false,
                message: "Password must be at least 8 characters."
            });
        }

        if (password !== confirmPassword) {
            return sendJSON(res, 400, {
                success: false,
                message: "Passwords do not match."
            });
        }

        if (!termsAccepted) {
            return sendJSON(res, 400, {
                success: false,
                message: "You must agree to the Terms and Conditions and Privacy Policy."
            });
        }

        const [existingUsers] = await db.execute(
            `SELECT id
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [email]
        );

        if (existingUsers.length > 0) {
            return sendJSON(res, 409, {
                success: false,
                message: "An account with this email already exists."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const [result] = await db.execute(
            `INSERT INTO users
                (full_name, email, phone, password_hash, role)
             VALUES (?, ?, ?, ?, ?)`,
            [fullName, email, phone, passwordHash, role]
        );

        return sendJSON(res, 201, {
            success: true,
            message: "Your account has been created successfully.",
            user: {
                id: result.insertId,
                fullName,
                email,
                phone,
                role
            }
        });
    } catch (error) {
        console.error("REGISTER ERROR:", error);

        if (error.message === "Invalid JSON request.") {
            return sendJSON(res, 400, {
                success: false,
                message: error.message
            });
        }

        if (error.code === "ER_DUP_ENTRY") {
            return sendJSON(res, 409, {
                success: false,
                message: "An account with this email already exists."
            });
        }

        return sendJSON(res, 500, {
            success: false,
            message: "Server error during registration. Please try again."
        });
    }
}

/* =========================================================
   LOGIN USER
========================================================= */

async function loginUser(req, res) {
    try {
        const body = await getRequestBody(req);

        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        const requestedRole = String(body.role || "").trim().toLowerCase();

        if (!email || !password || !requestedRole) {
            return sendJSON(res, 400, {
                success: false,
                message: "Enter your email, password, and account type."
            });
        }

        const allowedRoles = ["customer", "staff", "admin"];

        if (!allowedRoles.includes(requestedRole)) {
            return sendJSON(res, 400, {
                success: false,
                message: "Invalid account type."
            });
        }

        const [rows] = await db.execute(
            `SELECT id, full_name, email, password_hash, role, is_active
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [email]
        );

        if (rows.length === 0) {
            return sendJSON(res, 401, {
                success: false,
                message: "Invalid email or password."
            });
        }

        const user = rows[0];
        const passwordMatches = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatches) {
            return sendJSON(res, 401, {
                success: false,
                message: "Invalid email or password."
            });
        }

        if (String(user.role).toLowerCase() !== requestedRole) {
            return sendJSON(res, 403, {
                success: false,
                message: "The selected account type does not match your registered account."
            });
        }

        if (Number(user.is_active) !== 1) {
            return sendJSON(res, 403, {
                success: false,
                message: "Your account is inactive. Please contact the administrator."
            });
        }

        const sessionToken = createApiSession(
            user.email,
            String(user.role).toLowerCase()
        );

        return sendJSON(res, 200, {
            success: true,
            message: "Login successful.",
            sessionToken,
            user: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error("LOGIN ERROR:", error);

        if (error.message === "Invalid JSON request.") {
            return sendJSON(res, 400, {
                success: false,
                message: error.message
            });
        }

        return sendJSON(res, 500, {
            success: false,
            message: "A server error occurred during login."
        });
    }
}

/* =========================================================
   MENU + ORDER API
========================================================= */

async function getCategories() {
    const [rows] = await db.execute(
        `SELECT id, name, slug
         FROM categories
         ORDER BY name ASC`
    );

    return rows;
}

async function getProducts(url) {
    const category = cleanText(url.searchParams.get("category"), 100);
    const search = cleanText(url.searchParams.get("search"), 100);

    let sql = `
        SELECT
            p.id,
            p.name,
            p.description,
            p.price,
            p.image_url,
            p.tags,
            p.category_id,
            c.name AS category_name,
            c.slug AS category
        FROM products p
        INNER JOIN categories c ON c.id = p.category_id
        WHERE p.is_available = TRUE
    `;

    const params = [];

    if (category && category !== "all") {
        sql += " AND c.slug = ?";
        params.push(category);
    }

    if (search) {
        sql += " AND (p.name LIKE ? OR p.description LIKE ?)";
        params.push(`%${search}%`, `%${search}%`);
    }

    sql += " ORDER BY p.name ASC";

    const [rows] = await db.execute(sql, params);
    return rows;
}

async function getCustomerOrders(email) {
    const [orders] = await db.execute(
        `SELECT
            id,
            order_number,
            customer_name,
            customer_email,
            customer_phone,
            delivery_address,
            subtotal,
            delivery_fee,
            total,
            status,
            payment_method,
            payment_status,
            created_at
         FROM customer_orders
         WHERE customer_email = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 50`,
        [email]
    );

    if (orders.length === 0) {
        return [];
    }

    const orderIds = orders.map(order => order.id);
    const placeholders = orderIds.map(() => "?").join(",");
    const [items] = await db.execute(
        `SELECT
            oi.order_id,
            oi.product_id,
            oi.product_name,
            oi.product_price,
            oi.quantity,
            oi.line_total,
            oi.selected_size,
            p.image_url
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id IN (${placeholders})
         ORDER BY oi.id ASC`,
        orderIds
    );

    const itemsByOrderId = new Map();

    for (const item of items) {
        const orderItems = itemsByOrderId.get(item.order_id) || [];
        orderItems.push({
            productId: item.product_id,
            name: item.product_name,
            price: Number(item.product_price),
            quantity: item.quantity,
            lineTotal: Number(item.line_total),
            size: item.selected_size,
            image: item.image_url
        });
        itemsByOrderId.set(item.order_id, orderItems);
    }

    return orders.map(order => ({
        id: order.id,
        orderNumber: order.order_number,
        customerName: order.customer_name,
        customerEmail: order.customer_email,
        customerPhone: order.customer_phone,
        deliveryAddress: order.delivery_address,
        subtotal: Number(order.subtotal),
        deliveryFee: Number(order.delivery_fee),
        total: Number(order.total),
        status: order.status,
        paymentMethod: order.payment_method,
        paymentStatus: order.payment_status,
        createdAt: order.created_at,
        items: itemsByOrderId.get(order.id) || []
    }));
}

async function getStaffDeliveries() {
    const [orders] = await db.execute(
        `SELECT
            co.id,
            co.order_number,
            co.customer_name,
            co.customer_phone,
            co.delivery_address,
            dt.rider_email,
            co.total,
            co.status,
            co.payment_method,
            co.payment_status,
            co.created_at,
            dt.latitude,
            dt.longitude,
            dt.accuracy,
            dt.speed,
            dt.heading,
            dt.updated_at AS location_updated_at,
            u.full_name AS rider_name,
            u.phone AS rider_phone
         FROM customer_orders co
         LEFT JOIN delivery_tracking dt
            ON dt.order_id = co.id AND dt.tracking_active = TRUE
         LEFT JOIN users u ON u.email = dt.rider_email
         WHERE co.status IN ('Pending', 'Confirmed', 'Preparing', 'Out for Delivery')
         ORDER BY co.created_at ASC, co.id ASC`
    );

    if (orders.length === 0) return [];

    const orderIds = orders.map(order => order.id);
    const placeholders = orderIds.map(() => "?").join(",");
    const [items] = await db.execute(
        `SELECT order_id, product_name, quantity, product_price
         FROM order_items
         WHERE order_id IN (${placeholders})
         ORDER BY id ASC`,
        orderIds
    );
    const itemsByOrderId = new Map();

    for (const item of items) {
        const orderItems = itemsByOrderId.get(item.order_id) || [];
        orderItems.push({
            name: item.product_name,
            qty: Number(item.quantity),
            price: Number(item.product_price)
        });
        itemsByOrderId.set(item.order_id, orderItems);
    }

    return orders.map(order => ({
        id: order.order_number,
        customer: order.customer_name,
        phone: order.customer_phone,
        address: order.delivery_address,
        rider: order.rider_name || "",
        riderPhone: order.rider_phone || "",
        riderEmail: order.rider_email || "",
        status: order.status,
        eta: "Not available",
        createdAt: order.created_at,
        orderTime: new Date(order.created_at).toLocaleTimeString("en-PH", {
            hour: "numeric",
            minute: "2-digit"
        }),
        payment: order.payment_method,
        paymentStatus: order.payment_status,
        total: Number(order.total),
        rating: 0,
        note: "",
        items: itemsByOrderId.get(order.id) || [],
        location: order.latitude === null
            ? null
            : {
                latitude: Number(order.latitude),
                longitude: Number(order.longitude),
                accuracy: order.accuracy === null ? null : Number(order.accuracy),
                speed: order.speed === null ? null : Number(order.speed),
                heading: order.heading === null ? null : Number(order.heading),
                updatedAt: order.location_updated_at
            }
    }));
}

async function getCustomerDeliveryLocation(orderNumber, email) {
    const [rows] = await db.execute(
        `SELECT
            co.order_number,
            co.status,
            co.delivery_address,
            dt.latitude,
            dt.longitude,
            dt.accuracy,
            dt.speed,
            dt.heading,
            dt.updated_at,
            u.full_name AS rider_name,
            u.phone AS rider_phone
         FROM customer_orders co
         LEFT JOIN delivery_tracking dt
            ON dt.order_id = co.id AND dt.tracking_active = TRUE
         LEFT JOIN users u ON u.email = dt.rider_email
         WHERE co.order_number = ? AND co.customer_email = ?
         LIMIT 1`,
        [orderNumber, email]
    );

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
        orderNumber: row.order_number,
        orderStatus: row.status,
        deliveryAddress: row.delivery_address,
        rider: row.rider_name || null,
        riderPhone: row.rider_phone || null,
        location: row.latitude === null
            ? null
            : {
                latitude: Number(row.latitude),
                longitude: Number(row.longitude),
                accuracy: row.accuracy === null ? null : Number(row.accuracy),
                speed: row.speed === null ? null : Number(row.speed),
                heading: row.heading === null ? null : Number(row.heading),
                updatedAt: row.updated_at
            }
    };
}

async function saveDeliveryLocation(orderNumber, riderEmail, body) {
    const latitude = body.latitude;
    const longitude = body.longitude;
    const accuracy = body.accuracy == null ? null : Number(body.accuracy);
    const speed = body.speed == null ? null : Number(body.speed);
    const heading = body.heading == null ? null : Number(body.heading);

    if (
        typeof latitude !== "number" ||
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        typeof longitude !== "number" ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180 ||
        (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 999999.99)) ||
        (speed !== null && (!Number.isFinite(speed) || speed < 0 || speed > 999999.99)) ||
        (heading !== null && (!Number.isFinite(heading) || heading < 0 || heading > 360))
    ) {
        return {
            status: 400,
            data: { success: false, message: "The GPS location data is invalid." }
        };
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [orders] = await connection.execute(
            `SELECT id, status
             FROM customer_orders
             WHERE order_number = ?
             FOR UPDATE`,
            [orderNumber]
        );

        if (orders.length === 0) {
            await connection.rollback();
            return {
                status: 404,
                data: { success: false, message: "Order not found." }
            };
        }

        if (orders[0].status !== "Out for Delivery") {
            await connection.rollback();
            return {
                status: 409,
                data: {
                    success: false,
                    message: "GPS sharing is available only while the order is out for delivery."
                }
            };
        }

        const [existingRows] = await connection.execute(
            `SELECT rider_email, tracking_active, updated_at
             FROM delivery_tracking
             WHERE order_id = ?
             FOR UPDATE`,
            [orders[0].id]
        );
        const existing = existingRows[0];
        const isStale = existing &&
            Date.now() - new Date(existing.updated_at).getTime() > 2 * 60 * 1000;

        if (
            existing?.tracking_active &&
            existing.rider_email !== riderEmail &&
            !isStale
        ) {
            await connection.rollback();
            return {
                status: 409,
                data: {
                    success: false,
                    message: "Another rider is already sharing GPS for this order."
                }
            };
        }

        await connection.execute(
            `INSERT INTO delivery_tracking
                (order_id, rider_email, latitude, longitude, accuracy, speed, heading, tracking_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)
             ON DUPLICATE KEY UPDATE
                rider_email = VALUES(rider_email),
                latitude = VALUES(latitude),
                longitude = VALUES(longitude),
                accuracy = VALUES(accuracy),
                speed = VALUES(speed),
                heading = VALUES(heading),
                tracking_active = TRUE,
                updated_at = CURRENT_TIMESTAMP`,
            [
                orders[0].id,
                riderEmail,
                latitude,
                longitude,
                accuracy,
                speed,
                heading
            ]
        );
        await connection.commit();

        return {
            status: 200,
            data: {
                success: true,
                message: "GPS location updated.",
                updatedAt: new Date().toISOString()
            }
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function advanceCustomerOrder(orderNumber, nextStatus) {
    const previousStatus = {
        Confirmed: "Pending",
        Preparing: "Confirmed",
        "Out for Delivery": "Preparing"
    }[nextStatus];
    if (!previousStatus) {
        return {
            status: 400,
            data: { success: false, message: "Invalid order status transition." }
        };
    }

    const [orders] = await db.execute(
        `SELECT status, payment_method, payment_status
         FROM customer_orders
         WHERE order_number = ?
         LIMIT 1`,
        [orderNumber]
    );
    if (orders.length === 0) {
        return {
            status: 404,
            data: { success: false, message: "Order not found." }
        };
    }
    if (orders[0].status !== previousStatus) {
        return {
            status: 409,
            data: {
                success: false,
                message: `This order cannot move to ${nextStatus} from ${orders[0].status}.`
            }
        };
    }
    if (
        nextStatus === "Confirmed" &&
        orders[0].payment_method === "GCash" &&
        orders[0].payment_status !== "Paid"
    ) {
        return {
            status: 409,
            data: {
                success: false,
                message: "Wait for the GCash payment to be marked Paid before confirming this order."
            }
        };
    }

    const [updateResult] = await db.execute(
        `UPDATE customer_orders
         SET status = ?
         WHERE order_number = ? AND status = ?`,
        [nextStatus, orderNumber, previousStatus]
    );

    if (updateResult.affectedRows > 0) {
        return {
            status: 200,
            data: {
                success: true,
                status: nextStatus,
                message: `Order status updated to ${nextStatus}.`
            }
        };
    }

    const [currentOrders] = await db.execute(
        `SELECT status
         FROM customer_orders
         WHERE order_number = ?
         LIMIT 1`,
        [orderNumber]
    );
    if (currentOrders.length === 0) {
        return {
            status: 404,
            data: { success: false, message: "Order not found." }
        };
    }

    return {
        status: 409,
        data: {
            success: false,
            message: `This order cannot move to ${nextStatus} from ${currentOrders[0].status}.`
        }
    };
}

function getPayMongoConfig() {
    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;

    if (!secretKey || !webhookSecret) {
        return null;
    }

    return { secretKey, webhookSecret };
}

function safePublicBaseUrl(req) {
    if (process.env.APP_BASE_URL) {
        return process.env.APP_BASE_URL.replace(/\/+$/, "");
    }

    const host = req.headers.host || "";
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) {
        throw new Error("APP_BASE_URL must be configured for this deployment.");
    }

    return `http://${host}`;
}

async function createPayMongoCheckout(order, req) {
    const config = getPayMongoConfig();
    if (!config) {
        return {
            status: 503,
            data: {
                success: false,
                message: "GCash payments are not configured. Add the PayMongo test keys and webhook secret to the backend environment."
            }
        };
    }

    const baseUrl = safePublicBaseUrl(req);
    const lineItems = order.items.map(item => ({
        name: item.name,
        amount: Math.round(item.price * 100),
        currency: "PHP",
        quantity: item.quantity
    }));

    if (order.deliveryFee > 0) {
        lineItems.push({
            name: "Delivery Fee",
            amount: Math.round(order.deliveryFee * 100),
            currency: "PHP",
            quantity: 1
        });
    }

    const checkoutResponse = await fetch(
        "https://api.paymongo.com/v2/checkout_sessions",
        {
            method: "POST",
            headers: {
                Authorization: `Basic ${Buffer.from(`${config.secretKey}:`).toString("base64")}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                data: {
                    attributes: {
                        line_items: lineItems,
                        payment_method_types: ["gcash"],
                        success_url: `${baseUrl}/Customer/payment-result.html?status=processing&reference=${encodeURIComponent(order.orderNumber)}`,
                        cancel_url: `${baseUrl}/Customer/payment-result.html?status=cancelled&reference=${encodeURIComponent(order.orderNumber)}`,
                        reference_number: order.orderNumber,
                        metadata: {
                            order_id: String(order.id),
                            order_number: order.orderNumber
                        }
                    }
                }
            })
        }
    );

    const checkoutResult = await checkoutResponse.json();
    if (!checkoutResponse.ok) {
        const message = checkoutResult.errors
            ?.map(error => error.detail || error.code)
            .filter(Boolean)
            .join(" ") || "PayMongo could not create a checkout session.";
        throw new Error(message);
    }

    const checkoutSession = checkoutResult.data;
    const checkoutUrl = checkoutSession?.attributes?.checkout_url;
    const checkoutSessionId = checkoutSession?.id;

    if (!checkoutUrl || !checkoutSessionId) {
        throw new Error("PayMongo returned an incomplete checkout session.");
    }

    await db.execute(
        `UPDATE customer_orders
         SET payment_status = 'Pending',
             paymongo_checkout_session_id = ?
         WHERE id = ? AND payment_status != 'Paid'`,
        [checkoutSessionId, order.id]
    );

    return {
        status: 201,
        data: {
            success: true,
            checkoutUrl,
            order: {
                id: order.id,
                orderNumber: order.orderNumber,
                total: order.total,
                paymentStatus: "Pending"
            }
        }
    };
}

function verifyPayMongoWebhook(req, rawBody, webhookSecret, livemode) {
    const signatureHeader = req.headers["paymongo-signature"];
    if (typeof signatureHeader !== "string") {
        return false;
    }

    const parts = new Map(
        signatureHeader.split(",").map(part => {
            const separator = part.indexOf("=");
            return separator < 0
                ? [part.trim(), ""]
                : [
                    part.slice(0, separator).trim(),
                    part.slice(separator + 1).trim()
                ];
        })
    );
    const timestamp = parts.get("t");
    const suppliedSignature = parts.get(livemode ? "li" : "te");
    if (!timestamp || !/^\d+$/.test(timestamp)) {
        return false;
    }
    if (!suppliedSignature || !/^[a-f0-9]{64}$/i.test(suppliedSignature)) {
        return false;
    }

    const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(`${timestamp}.${rawBody.toString("utf8")}`)
        .digest();
    const receivedSignature = Buffer.from(suppliedSignature, "hex");

    return receivedSignature.length === expectedSignature.length &&
        crypto.timingSafeEqual(receivedSignature, expectedSignature);
}

async function handlePayMongoWebhook(req, res) {
    const config = getPayMongoConfig();
    if (!config) {
        return sendJSON(res, 503, {
            success: false,
            message: "PayMongo webhook is not configured."
        });
    }

    const rawBody = await readRawBody(req);
    let payload;
    try {
        payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
        return sendJSON(res, 400, {
            success: false,
            message: "Invalid PayMongo webhook JSON."
        });
    }

    const webhookEvent = payload.data;
    const eventAttributes = webhookEvent?.attributes || {};
    const eventType = webhookEvent?.type || eventAttributes.type;
    const livemode =
        webhookEvent?.livemode === true || eventAttributes.livemode === true;
    if (!verifyPayMongoWebhook(req, rawBody, config.webhookSecret, livemode)) {
        return sendJSON(res, 401, {
            success: false,
            message: "Invalid PayMongo webhook signature."
        });
    }

    if (eventType !== "checkout_session.payment.paid") {
        return sendJSON(res, 200, { success: true, received: true });
    }

    const checkoutSession = webhookEvent?.data || eventAttributes.data;
    const attributes = checkoutSession?.attributes;
    const orderNumber = String(attributes?.reference_number || "");
    const paidPayment = attributes?.payments?.find(
        payment => payment.attributes?.status === "paid"
    );
    const paymentAttributes = paidPayment?.attributes;

    if (
        !checkoutSession?.id ||
        !orderNumber ||
        !paymentAttributes ||
        String(paymentAttributes.currency).toUpperCase() !== "PHP" ||
        !Number.isSafeInteger(Number(paymentAttributes.amount)) ||
        Number(paymentAttributes.amount) <= 0
    ) {
        return sendJSON(res, 400, {
            success: false,
            message: "PayMongo webhook is missing required payment details."
        });
    }

    const [result] = await db.execute(
        `UPDATE customer_orders
         SET payment_status = 'Paid',
             payment_reference = ?,
             payment_paid_at = CURRENT_TIMESTAMP
         WHERE order_number = ?
           AND paymongo_checkout_session_id = ?
           AND payment_method = 'GCash'
           AND total = ?`,
        [
            paidPayment.id || checkoutSession.id,
            orderNumber,
            checkoutSession.id,
            Number(paymentAttributes.amount) / 100
        ]
    );

    if (result.affectedRows === 0) {
        const [existingOrders] = await db.execute(
            `SELECT payment_status
             FROM customer_orders
             WHERE order_number = ?
               AND paymongo_checkout_session_id = ?
               AND total = ?`,
            [
                orderNumber,
                checkoutSession.id,
                Number(paymentAttributes.amount) / 100
            ]
        );

        if (existingOrders[0]?.payment_status !== "Paid") {
            console.error(
                `PayMongo payment could not be matched to order ${orderNumber}.`
            );
            return sendJSON(res, 404, {
                success: false,
                message: "No matching order was found for this payment."
            });
        }
    }

    return sendJSON(res, 200, { success: true, received: true });
}

async function createOrder(body) {
    const customerName = cleanText(body.customerName, 150);
    const customerEmail = cleanText(body.customerEmail, 190);
    const customerPhone = cleanText(body.customerPhone, 30);
    const deliveryAddress = cleanText(body.deliveryAddress, 1000);
    const paymentMethod = cleanText(body.paymentMethod, 50) || "Cash on Delivery";

    if (!customerName || !customerEmail || !customerPhone || !deliveryAddress) {
        return {
            status: 400,
            data: {
                success: false,
                message: "Please provide your name, email, phone number, and delivery address."
            }
        };
    }

    if (!validEmail(customerEmail)) {
        return {
            status: 400,
            data: {
                success: false,
                message: "Please enter a valid email address."
            }
        };
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
        return {
            status: 400,
            data: {
                success: false,
                message: "Your cart is empty."
            }
        };
    }

    if (body.items.length > 100) {
        return {
            status: 400,
            data: {
                success: false,
                message: "Too many different items in one order."
            }
        };
    }

    const quantities = new Map();

    for (const item of body.items) {
        const productId = Number(item.productId);
        const quantity = Number(item.quantity);

        if (
            !Number.isSafeInteger(productId) ||
            productId < 1 ||
            !Number.isSafeInteger(quantity) ||
            quantity < 1 ||
            quantity > 100
        ) {
            return {
                status: 400,
                data: {
                    success: false,
                    message: "One or more cart items are invalid."
                }
            };
        }

        const existingItem = quantities.get(productId);
        const newQuantity = (existingItem?.quantity || 0) + quantity;

        if (newQuantity > 100) {
            return {
                status: 400,
                data: {
                    success: false,
                    message: "The quantity for a product cannot exceed 100."
                }
            };
        }

        quantities.set(productId, {
            quantity: newQuantity,
            size: cleanText(item.size, 80) || "Regular"
        });
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const productIds = [...quantities.keys()];
        const placeholders = productIds.map(() => "?").join(",");

        const [products] = await connection.execute(
            `SELECT id, name, price
             FROM products
             WHERE is_available = TRUE
               AND id IN (${placeholders})
             FOR UPDATE`,
            productIds
        );

        if (products.length !== productIds.length) {
            await connection.rollback();

            return {
                status: 400,
                data: {
                    success: false,
                    message: "A product in your cart is unavailable. Refresh the menu and try again."
                }
            };
        }

        const orderItems = products.map(product => {
            const cartItem = quantities.get(product.id);
            const quantity = cartItem.quantity;
            const price = Number(product.price);

            return {
                productId: product.id,
                name: product.name,
                price,
                quantity,
                size: cartItem.size,
                lineTotal: Math.round(price * quantity * 100) / 100
            };
        });

        const subtotal = Math.round(
            orderItems.reduce((sum, item) => sum + item.lineTotal, 0) * 100
        ) / 100;

        const deliveryFee = subtotal >= 800 ? 0 : 40;
        const total = Math.round((subtotal + deliveryFee) * 100) / 100;

        const orderNumber =
            "JPH-" +
            Date.now().toString().slice(-8) +
            crypto.randomBytes(2).toString("hex").toUpperCase();

        const [orderResult] = await connection.execute(
            `INSERT INTO customer_orders
                (
                    order_number,
                    customer_name,
                    customer_email,
                    customer_phone,
                    delivery_address,
                    subtotal,
                    delivery_fee,
                    total,
                    payment_method
                )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                orderNumber,
                customerName,
                customerEmail,
                customerPhone,
                deliveryAddress,
                subtotal,
                deliveryFee,
                total,
                paymentMethod
            ]
        );

        for (const item of orderItems) {
            await connection.execute(
                `INSERT INTO order_items
                    (
                        order_id,
                        product_id,
                        product_name,
                        product_price,
                        quantity,
                        line_total,
                        selected_size
                    )
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    orderResult.insertId,
                    item.productId,
                    item.name,
                    item.price,
                    item.quantity,
                    item.lineTotal,
                    item.size
                ]
            );
        }

        await connection.commit();

        return {
            status: 201,
            data: {
                success: true,
                message: "Order saved successfully.",
                order: {
                    id: orderResult.insertId,
                    orderNumber,
                    subtotal,
                    deliveryFee,
                    total,
                    status: "Pending",
                    items: orderItems
                }
            }
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

/* =========================================================
   STATIC FILE SERVER
========================================================= */

const PROJECT_ROOT = path.resolve(__dirname, "..");

const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".json": "application/json; charset=utf-8"
};

function serveFile(req, res) {
    let requestPath;

    try {
        requestPath = decodeURIComponent(
            new URL(req.url, "http://localhost:3000").pathname
        );
    } catch {
        res.writeHead(400);
        return res.end("400 - Invalid URL");
    }

    if (requestPath === "/") {
        requestPath = "/signup.html";
    }

    const filePath = path.resolve(PROJECT_ROOT, "." + requestPath);

    if (
        filePath !== PROJECT_ROOT &&
        !filePath.startsWith(PROJECT_ROOT + path.sep)
    ) {
        res.writeHead(403);
        return res.end("403 - Forbidden");
    }

    fs.readFile(filePath, (error, data) => {
        if (error) {
            res.writeHead(404, {
                "Content-Type": "text/plain; charset=utf-8"
            });

            return res.end("404 - File Not Found");
        }

        const extension = path.extname(filePath).toLowerCase();

        res.writeHead(200, {
            "Content-Type": mimeTypes[extension] || "application/octet-stream",
            "X-Content-Type-Options": "nosniff"
        });

        if (req.method === "HEAD") {
            return res.end();
        }

        return res.end(data);
    });
}

/* =========================================================
   SERVER AND ROUTES
========================================================= */

const server = http.createServer(async (req, res) => {
    setCors(req, res);

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    try {
        const url = new URL(
            req.url,
            `http://${req.headers.host || "localhost"}`
        );

        if (req.method === "POST" && url.pathname === "/api/register") {
            return registerUser(req, res);
        }

        if (req.method === "POST" && url.pathname === "/api/login") {
            return loginUser(req, res);
        }

        if (req.method === "POST" && url.pathname === "/api/logout") {
            const session = getApiSession(req);
            if (session) apiSessions.delete(session.token);

            return sendJSON(res, 200, {
                success: true,
                message: "Logged out successfully."
            });
        }

        if (req.method === "GET" && url.pathname === "/api/health") {
            await db.query("SELECT 1");

            return sendJSON(res, 200, {
                success: true,
                message: "Jolie's Pizza API and MySQL are connected."
            });
        }

        if (req.method === "GET" && url.pathname === "/api/categories") {
            const categories = await getCategories();

            return sendJSON(res, 200, {
                success: true,
                categories
            });
        }

        if (req.method === "GET" && url.pathname === "/api/products") {
            const products = await getProducts(url);

            return sendJSON(res, 200, {
                success: true,
                count: products.length,
                products
            });
        }

        if (req.method === "GET" && url.pathname === "/api/config/google-maps") {
            if (!process.env.GOOGLE_MAPS_API_KEY) {
                return sendJSON(res, 503, {
                    success: false,
                    message: "Google Maps is not configured. Set GOOGLE_MAPS_API_KEY in the backend environment."
                });
            }

            return sendJSON(res, 200, {
                success: true,
                apiKey: process.env.GOOGLE_MAPS_API_KEY
            });
        }

        if (req.method === "GET" && url.pathname === "/api/staff/deliveries") {
            const session = getApiSession(req);
            if (!session || !["staff", "admin"].includes(session.role)) {
                return sendJSON(res, session ? 403 : 401, {
                    success: false,
                    message: "A staff or admin login is required to view active deliveries."
                });
            }

            const deliveries = await getStaffDeliveries();
            return sendJSON(res, 200, { success: true, deliveries });
        }

        const staffStatusMatch = url.pathname.match(
            /^\/api\/staff\/orders\/([^/]+)\/status$/
        );
        if (req.method === "POST" && staffStatusMatch) {
            const session = getApiSession(req);
            if (!session || !["staff", "admin"].includes(session.role)) {
                return sendJSON(res, session ? 403 : 401, {
                    success: false,
                    message: "A staff or admin login is required to dispatch orders."
                });
            }

            const orderNumber = cleanText(
                decodeURIComponent(staffStatusMatch[1]),
                30
            ).toUpperCase();
            if (!/^JPH-[A-Z0-9]+$/.test(orderNumber)) {
                return sendJSON(res, 400, {
                    success: false,
                    message: "Invalid order number."
                });
            }
            if (!req.headers["content-type"]?.includes("application/json")) {
                return sendJSON(res, 415, {
                    success: false,
                    message: "Content-Type must be application/json."
                });
            }

            const body = await readJSON(req);
            if (!["Confirmed", "Preparing", "Out for Delivery"].includes(body?.status)) {
                return sendJSON(res, 400, {
                    success: false,
                    message: "Invalid order status transition."
                });
            }

            const result = await advanceCustomerOrder(orderNumber, body.status);
            return sendJSON(res, result.status, result.data);
        }

        const staffLocationMatch = url.pathname.match(
            /^\/api\/staff\/orders\/([^/]+)\/location$/
        );
        if (
            staffLocationMatch &&
            (req.method === "POST" || req.method === "DELETE")
        ) {
            const session = getApiSession(req);
            if (!session || !["staff", "admin"].includes(session.role)) {
                return sendJSON(res, session ? 403 : 401, {
                    success: false,
                    message: "A staff or admin login is required to share delivery GPS."
                });
            }

            const orderNumber = cleanText(
                decodeURIComponent(staffLocationMatch[1]),
                30
            ).toUpperCase();
            if (!/^JPH-[A-Z0-9]+$/.test(orderNumber)) {
                return sendJSON(res, 400, {
                    success: false,
                    message: "Invalid order number."
                });
            }

            if (req.method === "DELETE") {
                const [result] = await db.execute(
                    `DELETE dt
                     FROM delivery_tracking dt
                     INNER JOIN customer_orders co ON co.id = dt.order_id
                     WHERE co.order_number = ? AND dt.rider_email = ?`,
                    [orderNumber, session.email]
                );
                return sendJSON(res, 200, {
                    success: true,
                    message: result.affectedRows > 0
                        ? "GPS sharing stopped."
                        : "There was no active GPS share for this rider."
                });
            }

            if (!req.headers["content-type"]?.includes("application/json")) {
                return sendJSON(res, 415, {
                    success: false,
                    message: "Content-Type must be application/json."
                });
            }

            const body = await readJSON(req);
            if (!body || typeof body !== "object" || Array.isArray(body)) {
                return sendJSON(res, 400, {
                    success: false,
                    message: "The GPS location data is invalid."
                });
            }
            const result = await saveDeliveryLocation(
                orderNumber,
                session.email,
                body
            );
            return sendJSON(res, result.status, result.data);
        }

        const customerTrackingMatch = url.pathname.match(
            /^\/api\/orders\/([^/]+)\/tracking$/
        );
        if (req.method === "GET" && customerTrackingMatch) {
            const session = getApiSession(req);
            if (!session || session.role !== "customer") {
                return sendJSON(res, session ? 403 : 401, {
                    success: false,
                    message: "Log in as the customer who placed this order to view its tracking."
                });
            }

            const orderNumber = cleanText(
                decodeURIComponent(customerTrackingMatch[1]),
                30
            ).toUpperCase();
            const tracking = await getCustomerDeliveryLocation(
                orderNumber,
                session.email
            );
            if (!tracking) {
                return sendJSON(res, 404, {
                    success: false,
                    message: "Order not found for this customer account."
                });
            }

            return sendJSON(res, 200, { success: true, tracking });
        }

        if (req.method === "GET" && url.pathname === "/api/orders") {
            const session = getApiSession(req);

            if (!session) {
                return sendJSON(res, 401, {
                    success: false,
                    message: "Please log in again to view your orders."
                });
            }

            const orders = await getCustomerOrders(session.email);

            return sendJSON(res, 200, {
                success: true,
                count: orders.length,
                orders
            });
        }

        if (
            req.method === "POST" &&
            url.pathname === "/api/payments/gcash/checkout"
        ) {
            if (!req.headers["content-type"]?.includes("application/json")) {
                return sendJSON(res, 415, {
                    success: false,
                    message: "Content-Type must be application/json."
                });
            }

            if (!getPayMongoConfig()) {
                return sendJSON(res, 503, {
                    success: false,
                    message: "GCash payments are not configured. Add the PayMongo test keys and webhook secret to the backend environment."
                });
            }

            try {
                safePublicBaseUrl(req);
            } catch (error) {
                return sendJSON(res, 503, {
                    success: false,
                    message: error.message
                });
            }

            const authorizationHeader = req.headers.authorization;
            const session = authorizationHeader
                ? getApiSession(req)
                : null;

            if (authorizationHeader && !session) {
                return sendJSON(res, 401, {
                    success: false,
                    message: "Your session has expired. Please log in again."
                });
            }

            const body = await readJSON(req);
            if (
                session &&
                cleanText(body.customerEmail, 190).toLowerCase() !== session.email
            ) {
                return sendJSON(res, 403, {
                    success: false,
                    message: "Orders from your account must use your account email address."
                });
            }

            const orderResult = await createOrder({
                ...body,
                paymentMethod: "GCash"
            });

            if (orderResult.status !== 201) {
                return sendJSON(res, orderResult.status, orderResult.data);
            }

            const order = orderResult.data.order;
            await db.execute(
                `UPDATE customer_orders
                 SET payment_status = 'Pending'
                 WHERE id = ?`,
                [order.id]
            );

            try {
                const checkoutResult = await createPayMongoCheckout(order, req);
                return sendJSON(res, checkoutResult.status, checkoutResult.data);
            } catch (error) {
                console.error("Could not create PayMongo checkout session:", error);
                await db.execute(
                    `UPDATE customer_orders
                     SET payment_status = 'Failed'
                     WHERE id = ? AND payment_status != 'Paid'`,
                    [order.id]
                );
                return sendJSON(res, 502, {
                    success: false,
                    message: "Your order was saved, but PayMongo could not start the GCash payment. Check My Orders or contact the shop before placing another order.",
                    orderNumber: order.orderNumber
                });
            }
        }

        if (
            req.method === "POST" &&
            url.pathname === "/api/webhooks/paymongo"
        ) {
            return handlePayMongoWebhook(req, res);
        }

        if (req.method === "POST" && url.pathname === "/api/orders") {
            if (!req.headers["content-type"]?.includes("application/json")) {
                return sendJSON(res, 415, {
                    success: false,
                    message: "Content-Type must be application/json."
                });
            }

            const authorizationHeader = req.headers.authorization;
            const session = authorizationHeader
                ? getApiSession(req)
                : null;

            if (authorizationHeader && !session) {
                return sendJSON(res, 401, {
                    success: false,
                    message: "Your session has expired. Please log in again."
                });
            }

            const body = await readJSON(req);

            if (
                session &&
                cleanText(body.customerEmail, 190).toLowerCase() !== session.email
            ) {
                return sendJSON(res, 403, {
                    success: false,
                    message: "Orders from your account must use your account email address."
                });
            }

            const result = await createOrder(body);

            return sendJSON(res, result.status, result.data);
        }

        if (req.method === "GET" || req.method === "HEAD") {
            return serveFile(req, res);
        }

        return sendJSON(res, 404, {
            success: false,
            message: "API route not found."
        });
    } catch (error) {
        console.error("API error:", error);

        if (!res.headersSent) {
            sendJSON(res, 500, {
                success: false,
                message: "A server error occurred. Check the backend terminal."
            });
        }
    }
});

/* =========================================================
   START SERVER
========================================================= */

async function startServer() {
    try {
        const connection = await db.getConnection();
        console.log("MySQL database connected: jolies_pizza");
        connection.release();

        server.listen(PORT, () => {
            console.log(`Jolie's Pizza server running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("MYSQL CONNECTION ERROR:", error.message);
        console.error(
            "Check your MySQL service, username, password, and database name."
        );
        process.exit(1);
    }
}

startServer();
