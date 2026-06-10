GRANT ALL ON SCHEMA public TO sandbox_exec;
GRANT CREATE ON SCHEMA public TO sandbox_exec;
GRANT ALL ON SCHEMA storage TO sandbox_exec;
GRANT USAGE ON SCHEMA auth TO sandbox_exec;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.users TO sandbox_exec;
GRANT sandbox_exec TO postgres;