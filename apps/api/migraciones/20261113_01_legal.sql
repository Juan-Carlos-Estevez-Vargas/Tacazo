-- Legal: consentimientos con prueba y borrado de cuenta (Ley 1581 de 2012).
--
-- Cada aceptación de los términos o de la política de privacidad queda como
-- una fila que no se edita ni se borra: quién, qué documento, qué versión,
-- cuándo, qué rango de edad declaró y si dijo tener la autorización de su
-- acudiente. Es la prueba de la autorización que pide la ley.

CREATE TABLE consentimientos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jugador uuid NOT NULL REFERENCES jugadores (id) ON DELETE RESTRICT,
  documento text NOT NULL CHECK (documento IN ('terminos', 'privacidad')),
  version text NOT NULL CHECK (version ~ '^\d{4}-\d{2}-\d{2}$'),
  edad text NOT NULL CHECK (edad IN ('14-17', '18+')),
  -- Entre 14 y 17 años hace falta la autorización de quien lo representa.
  autorizacion_acudiente boolean NOT NULL DEFAULT false,
  aceptado timestamptz NOT NULL DEFAULT now(),
  CHECK (edad = '18+' OR autorizacion_acudiente)
);
CREATE INDEX consentimientos_jugador ON consentimientos (jugador, documento, aceptado DESC);

CREATE FUNCTION consentimiento_inmutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Los consentimientos no se editan ni se borran';
END
$$;
CREATE TRIGGER consentimientos_inmutables BEFORE UPDATE OR DELETE ON consentimientos
  FOR EACH ROW EXECUTE FUNCTION consentimiento_inmutable();

-- Borrado: los datos personales se quitan; quedan el id (seudónimo) y lo que
-- la ley o la integridad del juego obligan a guardar (libro de monedas,
-- partidas del rival, reportes y sanciones).
ALTER TABLE jugadores ADD COLUMN borrado timestamptz;

ALTER TABLE consentimientos ENABLE ROW LEVEL SECURITY;

-- La API registra y lee los consentimientos del jugador que pide.
GRANT SELECT ON consentimientos TO tacazo_api;
GRANT INSERT (jugador, documento, version, edad, autorizacion_acudiente) ON consentimientos TO tacazo_api;
CREATE POLICY consentimientos_propios ON consentimientos FOR SELECT TO tacazo_api
  USING (jugador = jugador_actual());
CREATE POLICY consentimientos_crear ON consentimientos FOR INSERT TO tacazo_api
  WITH CHECK (jugador = jugador_actual());
GRANT SELECT (borrado) ON jugadores TO tacazo_api;

-- tacazo_cuentas crea invitados (con su consentimiento) y borra cuentas.
GRANT SELECT, INSERT ON consentimientos TO tacazo_cuentas;
CREATE POLICY consentimientos_cuentas ON consentimientos FOR ALL TO tacazo_cuentas USING (true) WITH CHECK (true);
GRANT UPDATE (nombre, pais, cuenta, borrado) ON jugadores TO tacazo_cuentas;
GRANT SELECT, DELETE ON ratings, amistades, inventario TO tacazo_cuentas;
CREATE POLICY ratings_cuentas ON ratings FOR ALL TO tacazo_cuentas USING (true) WITH CHECK (true);
CREATE POLICY amistades_cuentas ON amistades FOR ALL TO tacazo_cuentas USING (true) WITH CHECK (true);
CREATE POLICY inventario_cuentas ON inventario FOR ALL TO tacazo_cuentas USING (true) WITH CHECK (true);

-- La moderación ve los consentimientos para atender reclamos.
GRANT SELECT ON consentimientos TO tacazo_moderacion;
CREATE POLICY consentimientos_moderacion ON consentimientos FOR SELECT TO tacazo_moderacion USING (true);
