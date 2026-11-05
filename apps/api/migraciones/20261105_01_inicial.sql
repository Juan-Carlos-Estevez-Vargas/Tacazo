-- Base inicial de Tacazo: jugadores, ratings por modo, partidas y amistades.
-- La API se conecta con el rol tacazo_api, sujeto a la seguridad por fila.
-- Cada consulta corre dentro de una transacción con `app.jugador` fijado al
-- jugador que hace la petición (o vacío si nadie inició sesión).

CREATE TABLE jugadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 20),
  pais char(2) CHECK (pais ~ '^[A-Z]{2}$'),
  region text NOT NULL DEFAULT 'sa' CHECK (region IN ('sa', 'na', 'eu', 'as', 'oc', 'af')),
  invitado boolean NOT NULL DEFAULT true,
  -- Identificador del proveedor de cuentas; null mientras sea invitado.
  cuenta text UNIQUE,
  creado timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ratings (
  jugador uuid NOT NULL REFERENCES jugadores (id) ON DELETE CASCADE,
  modo text NOT NULL CHECK (modo IN ('bola8', 'bola9', 'bola10', 'carambola', 'tresbandas', 'snooker')),
  r double precision NOT NULL DEFAULT 1500,
  rd double precision NOT NULL DEFAULT 350 CHECK (rd BETWEEN 30 AND 350),
  sigma double precision NOT NULL DEFAULT 0.06,
  -- Rating que se muestra: conservador mientras la RD es alta.
  visible integer GENERATED ALWAYS AS (round(r - 2 * rd)::integer) STORED,
  partidas integer NOT NULL DEFAULT 0,
  actualizado timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (jugador, modo)
);
CREATE INDEX ratings_tabla ON ratings (modo, visible DESC);

CREATE TABLE partidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modo text NOT NULL,
  sala text NOT NULL,
  jugador_a uuid NOT NULL REFERENCES jugadores (id),
  jugador_b uuid NOT NULL REFERENCES jugadores (id),
  ganador uuid REFERENCES jugadores (id),
  motivo text,
  clasificatoria boolean NOT NULL DEFAULT false,
  motor integer NOT NULL,
  repeticion jsonb NOT NULL,
  terminada timestamptz NOT NULL DEFAULT now(),
  CHECK (jugador_a <> jugador_b),
  CHECK (ganador IS NULL OR ganador IN (jugador_a, jugador_b))
);
CREATE INDEX partidas_a ON partidas (jugador_a, terminada DESC);
CREATE INDEX partidas_b ON partidas (jugador_b, terminada DESC);

-- Una fila por amistad, con a < b para no guardarla dos veces.
CREATE TABLE amistades (
  a uuid NOT NULL REFERENCES jugadores (id) ON DELETE CASCADE,
  b uuid NOT NULL REFERENCES jugadores (id) ON DELETE CASCADE,
  creada timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (a, b),
  CHECK (a < b)
);
CREATE INDEX amistades_b ON amistades (b);

-- Jugador de la petición en curso, o null.
CREATE FUNCTION jugador_actual() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.jugador', true), '')::uuid $$;

-- Roles sin inicio de sesión: la conexión entra con el usuario dueño y cada
-- transacción hace SET LOCAL ROLE. Ninguno es dueño de las tablas ni se salta
-- la seguridad por fila.
--   tacazo_api       lo que pide un jugador desde la app
--   tacazo_partidas  el servidor de partidas: guarda partidas y ratings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tacazo_api') THEN
    CREATE ROLE tacazo_api NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tacazo_partidas') THEN
    CREATE ROLE tacazo_partidas NOLOGIN NOBYPASSRLS;
  END IF;
  EXECUTE format('GRANT tacazo_api, tacazo_partidas TO %I', current_user);
END
$$;

ALTER TABLE jugadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE partidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE amistades ENABLE ROW LEVEL SECURITY;

-- Nombre, país y rating son públicos (tablas de posiciones). La cuenta no:
-- se lee solo con la vista perfil_publico, que no la incluye.
GRANT SELECT (id, nombre, pais, region, invitado, creado) ON jugadores TO tacazo_api;
GRANT UPDATE (nombre, pais, region) ON jugadores TO tacazo_api;
CREATE POLICY jugadores_leer ON jugadores FOR SELECT TO tacazo_api USING (true);
CREATE POLICY jugadores_editar ON jugadores FOR UPDATE TO tacazo_api
  USING (id = jugador_actual()) WITH CHECK (id = jugador_actual());

GRANT SELECT ON ratings TO tacazo_api;
CREATE POLICY ratings_leer ON ratings FOR SELECT TO tacazo_api USING (true);

-- Cada quien ve solo sus partidas. Escribir partidas y ratings lo hace el
-- servidor de partidas con su propio rol, no la API.
GRANT SELECT ON partidas TO tacazo_api;
CREATE POLICY partidas_propias ON partidas FOR SELECT TO tacazo_api
  USING (jugador_actual() IN (jugador_a, jugador_b));

GRANT SELECT, INSERT, DELETE ON amistades TO tacazo_api;
CREATE POLICY amistades_propias ON amistades FOR ALL TO tacazo_api
  USING (jugador_actual() IN (a, b)) WITH CHECK (jugador_actual() IN (a, b));

GRANT EXECUTE ON FUNCTION jugador_actual() TO tacazo_api;

-- Servidor de partidas: crea invitados, guarda partidas y actualiza ratings.
GRANT SELECT, INSERT ON jugadores TO tacazo_partidas;
CREATE POLICY jugadores_partidas ON jugadores FOR ALL TO tacazo_partidas USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON ratings TO tacazo_partidas;
CREATE POLICY ratings_partidas ON ratings FOR ALL TO tacazo_partidas USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON partidas TO tacazo_partidas;
CREATE POLICY partidas_partidas ON partidas FOR ALL TO tacazo_partidas USING (true) WITH CHECK (true);
GRANT SELECT ON amistades TO tacazo_partidas;
CREATE POLICY amistades_partidas ON amistades FOR SELECT TO tacazo_partidas USING (true);
GRANT EXECUTE ON FUNCTION jugador_actual() TO tacazo_partidas;
