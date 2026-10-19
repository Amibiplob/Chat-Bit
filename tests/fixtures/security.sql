-- Synthetic client roles exercise immutable migration 008; no hosted services.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE chatbit_public_probe NOLOGIN;
CREATE ROLE chatbit_security_owner NOLOGIN;
CREATE SCHEMA unrelated_auth;
CREATE SCHEMA unrelated_files;
CREATE SCHEMA unrelated_events;
CREATE TABLE unrelated_auth.security_sentinel (id integer PRIMARY KEY);
CREATE TABLE unrelated_files.security_sentinel (id integer PRIMARY KEY);
CREATE TABLE unrelated_events.security_sentinel (id integer PRIMARY KEY);
INSERT INTO unrelated_auth.security_sentinel VALUES (1);
INSERT INTO unrelated_files.security_sentinel VALUES (1);
INSERT INTO unrelated_events.security_sentinel VALUES (1);
