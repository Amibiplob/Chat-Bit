-- ONLY for the disposable CI PostgreSQL service, never a real Supabase project.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE chatbit_public_probe NOLOGIN;
CREATE ROLE chatbit_security_owner NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE SCHEMA realtime;
CREATE TABLE auth.security_sentinel (id integer PRIMARY KEY);
CREATE TABLE storage.security_sentinel (id integer PRIMARY KEY);
CREATE TABLE realtime.security_sentinel (id integer PRIMARY KEY);
INSERT INTO auth.security_sentinel VALUES (1);
INSERT INTO storage.security_sentinel VALUES (1);
INSERT INTO realtime.security_sentinel VALUES (1);
