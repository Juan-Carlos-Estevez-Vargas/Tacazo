-- Libro de monedas de doble entrada. Cada movimiento tiene una clave única
-- (idempotencia) y asientos que suman cero. El saldo de un jugador se calcula
-- sumando sus asientos; nunca se guarda ni se edita a mano.

CREATE TABLE movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL UNIQUE CHECK (char_length(clave) BETWEEN 3 AND 200),
  tipo text NOT NULL CHECK (tipo IN ('bienvenida', 'diario', 'entrada', 'premio', 'devolucion', 'anuncio', 'compra', 'ajuste')),
  creado timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX movimientos_dia ON movimientos (creado);

-- Las cuentas del sistema son de donde salen o a donde van las monedas.
CREATE TABLE asientos (
  movimiento uuid NOT NULL REFERENCES movimientos (id) ON DELETE RESTRICT,
  jugador uuid REFERENCES jugadores (id) ON DELETE RESTRICT,
  sistema text CHECK (sistema IN ('emision', 'mesa', 'tienda')),
  monto bigint NOT NULL CHECK (monto <> 0),
  CHECK ((jugador IS NULL) <> (sistema IS NULL))
);
CREATE INDEX asientos_jugador ON asientos (jugador) WHERE jugador IS NOT NULL;
CREATE INDEX asientos_movimiento ON asientos (movimiento);

-- Al cerrar la transacción, cada movimiento debe sumar cero y ningún jugador
-- tocado puede quedar en negativo.
CREATE FUNCTION revisar_movimiento() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  total bigint;
  negativo uuid;
BEGIN
  SELECT coalesce(sum(monto), 0) INTO total FROM asientos WHERE movimiento = NEW.movimiento;
  IF total <> 0 THEN
    RAISE EXCEPTION 'El movimiento % no suma cero (%)', NEW.movimiento, total;
  END IF;
  IF NEW.jugador IS NOT NULL THEN
    SELECT jugador INTO negativo FROM asientos WHERE jugador = NEW.jugador
      GROUP BY jugador HAVING sum(monto) < 0;
    IF negativo IS NOT NULL THEN
      RAISE EXCEPTION 'Saldo insuficiente';
    END IF;
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER asientos_cuadran
  AFTER INSERT ON asientos
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION revisar_movimiento();

-- Los asientos no se cambian ni se borran: un error se corrige con otro movimiento.
CREATE FUNCTION libro_inmutable() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN RAISE EXCEPTION 'El libro de monedas no se edita'; END $$;
CREATE TRIGGER asientos_inmutables BEFORE UPDATE OR DELETE ON asientos
  FOR EACH ROW EXECUTE FUNCTION libro_inmutable();
CREATE TRIGGER movimientos_inmutables BEFORE UPDATE OR DELETE ON movimientos
  FOR EACH ROW EXECUTE FUNCTION libro_inmutable();

CREATE VIEW saldos WITH (security_invoker = true) AS
  SELECT jugador, sum(monto)::bigint AS saldo FROM asientos WHERE jugador IS NOT NULL GROUP BY jugador;

-- Objetos cosméticos ganados. El catálogo vive en el código.
CREATE TABLE inventario (
  jugador uuid NOT NULL REFERENCES jugadores (id) ON DELETE CASCADE,
  objeto text NOT NULL CHECK (objeto ~ '^[a-z0-9_]{2,40}$'),
  obtenido timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (jugador, objeto)
);
ALTER TABLE jugadores ADD COLUMN equipado jsonb NOT NULL DEFAULT '{}';

-- Flujo diario por tipo, para ver de dónde salen y a dónde van las monedas.
CREATE VIEW flujo_monedas WITH (security_invoker = true) AS
  SELECT date_trunc('day', m.creado)::date AS dia, m.tipo,
         sum(a.monto) FILTER (WHERE a.jugador IS NOT NULL AND a.monto > 0)::bigint AS entran,
         (-sum(a.monto) FILTER (WHERE a.jugador IS NOT NULL AND a.monto < 0))::bigint AS salen,
         count(DISTINCT m.id)::integer AS movimientos
  FROM movimientos m JOIN asientos a ON a.movimiento = m.id
  GROUP BY 1, 2;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tacazo_monedas') THEN
    CREATE ROLE tacazo_monedas NOLOGIN NOBYPASSRLS;
  END IF;
  EXECUTE format('GRANT tacazo_monedas TO %I', current_user);
END
$$;

ALTER TABLE movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE asientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario ENABLE ROW LEVEL SECURITY;

-- Solo tacazo_monedas mueve monedas; lo usan la API y el servidor de partidas.
GRANT SELECT, INSERT ON movimientos, asientos TO tacazo_monedas;
GRANT SELECT, INSERT ON inventario TO tacazo_monedas;
GRANT SELECT ON saldos, flujo_monedas TO tacazo_monedas;
GRANT SELECT (id) ON jugadores TO tacazo_monedas;
GRANT UPDATE (id) ON jugadores TO tacazo_monedas;
CREATE POLICY movimientos_monedas ON movimientos FOR ALL TO tacazo_monedas USING (true) WITH CHECK (true);
CREATE POLICY asientos_monedas ON asientos FOR ALL TO tacazo_monedas USING (true) WITH CHECK (true);
CREATE POLICY inventario_monedas ON inventario FOR ALL TO tacazo_monedas USING (true) WITH CHECK (true);
CREATE POLICY jugadores_monedas ON jugadores FOR ALL TO tacazo_monedas USING (true) WITH CHECK (true);
GRANT EXECUTE ON FUNCTION jugador_actual() TO tacazo_monedas;

-- Cada jugador ve sus asientos, su saldo y su inventario, y elige qué lleva puesto.
GRANT SELECT ON asientos, movimientos, inventario, saldos TO tacazo_api;
CREATE POLICY asientos_propios ON asientos FOR SELECT TO tacazo_api USING (jugador = jugador_actual());
CREATE POLICY movimientos_propios ON movimientos FOR SELECT TO tacazo_api
  USING (EXISTS (SELECT 1 FROM asientos a WHERE a.movimiento = id AND a.jugador = jugador_actual()));
CREATE POLICY inventario_propio ON inventario FOR SELECT TO tacazo_api USING (jugador = jugador_actual());
GRANT SELECT (equipado) ON jugadores TO tacazo_api;
GRANT UPDATE (equipado) ON jugadores TO tacazo_api;

-- Moderación ve el flujo para el panel.
GRANT SELECT ON movimientos, asientos, flujo_monedas TO tacazo_moderacion;
CREATE POLICY movimientos_moderacion ON movimientos FOR SELECT TO tacazo_moderacion USING (true);
CREATE POLICY asientos_moderacion ON asientos FOR SELECT TO tacazo_moderacion USING (true);
