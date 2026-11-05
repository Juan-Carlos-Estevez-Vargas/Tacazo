-- Cuentas: la API crea invitados y los vincula a una cuenta de Neon Auth.
-- Solo el rol tacazo_cuentas lee y escribe la columna `cuenta`.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tacazo_cuentas') THEN
    CREATE ROLE tacazo_cuentas NOLOGIN NOBYPASSRLS;
  END IF;
  EXECUTE format('GRANT tacazo_cuentas TO %I', current_user);
END
$$;

ALTER TABLE jugadores ADD COLUMN vinculado timestamptz;

GRANT SELECT, INSERT ON jugadores TO tacazo_cuentas;
GRANT UPDATE (cuenta, invitado, vinculado) ON jugadores TO tacazo_cuentas;
CREATE POLICY jugadores_cuentas ON jugadores FOR ALL TO tacazo_cuentas USING (true) WITH CHECK (true);
GRANT EXECUTE ON FUNCTION jugador_actual() TO tacazo_cuentas;
