USE jolies_pizza;

CREATE TABLE IF NOT EXISTS delivery_tracking (
    order_id BIGINT NOT NULL PRIMARY KEY,
    rider_email VARCHAR(190) NOT NULL,
    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,
    accuracy DECIMAL(8,2) NULL,
    speed DECIMAL(8,2) NULL,
    heading DECIMAL(6,2) NULL,
    tracking_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_delivery_tracking_order
        FOREIGN KEY (order_id)
        REFERENCES customer_orders(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_delivery_tracking_rider
    ON delivery_tracking (rider_email, tracking_active);
