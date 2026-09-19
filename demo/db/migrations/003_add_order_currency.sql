-- Orders can be placed in other currencies. Existing orders were all USD.
ALTER TABLE orders ADD COLUMN currency char(3) NOT NULL DEFAULT 'USD';
