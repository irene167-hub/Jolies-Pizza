USE jolies_pizza;

ALTER TABLE customer_orders
    ADD COLUMN payment_status ENUM(
        'Unpaid',
        'Pending',
        'Paid',
        'Failed',
        'Cancelled'
    ) NOT NULL DEFAULT 'Unpaid' AFTER payment_method,
    ADD COLUMN paymongo_checkout_session_id VARCHAR(100) NULL
        AFTER payment_status,
    ADD COLUMN payment_reference VARCHAR(100) NULL
        AFTER paymongo_checkout_session_id,
    ADD COLUMN payment_paid_at TIMESTAMP NULL
        AFTER payment_reference,
    ADD UNIQUE INDEX uq_customer_orders_paymongo_session
        (paymongo_checkout_session_id);
