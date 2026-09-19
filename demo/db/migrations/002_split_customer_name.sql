-- Split customer names into first/last.
ALTER TABLE customers RENAME COLUMN name TO full_name;
ALTER TABLE customers ADD COLUMN first_name text NOT NULL;
ALTER TABLE customers ADD COLUMN last_name text NOT NULL;
