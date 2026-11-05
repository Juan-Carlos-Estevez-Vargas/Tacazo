-- Moderación: revisiones por señales, reportes de jugadores, sanciones
-- escalonadas y apelaciones. Las decisiones las toma una persona con el rol
-- tacazo_moderacion; las señales y los reportes solo abren casos.

CREATE TABLE revisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jugador uuid NOT NULL REFERENCES jugadores (id) ON DELETE CASCADE,
  origen text NOT NULL CHECK (origen IN ('senales', 'reportes')),
  senales jsonb NOT NULL DEFAULT '[]',
  puntaje integer NOT NULL DEFAULT 0,
  partidas uuid[] NOT NULL DEFAULT '{}',
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'limpio', 'sancionado')),
  revisor text,
  nota text CHECK (char_length(nota) <= 1000),
  creada timestamptz NOT NULL DEFAULT now(),
  resuelta timestamptz
);
-- Un solo caso abierto por jugador: las señales nuevas se suman a él.
CREATE UNIQUE INDEX revisiones_abierta ON revisiones (jugador) WHERE estado = 'pendiente';

CREATE TABLE reportes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  autor uuid NOT NULL REFERENCES jugadores (id) ON DELETE CASCADE,
  reportado uuid NOT NULL REFERENCES jugadores (id) ON DELETE CASCADE,
  partida uuid NOT NULL REFERENCES partidas (id) ON DELETE CASCADE,
  motivo text NOT NULL CHECK (motivo IN ('trampa', 'nombre', 'abandono', 'otro')),
  detalle text CHECK (char_length(detalle) <= 500),
  creado timestamptz NOT NULL DEFAULT now(),
  CHECK (autor <> reportado),
  UNIQUE (autor, partida)
);
CREATE INDEX reportes_reportado ON reportes (reportado, creado DESC);

CREATE TABLE sanciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jugador uuid NOT NULL REFERENCES jugadores (id) ON DELETE CASCADE,
  -- 1 aviso · 2 un día sin clasificatorias · 3 siete días sin jugar · 4 cuenta cerrada
  nivel integer NOT NULL CHECK (nivel BETWEEN 1 AND 4),
  motivo text NOT NULL CHECK (char_length(motivo) BETWEEN 1 AND 500),
  revision uuid REFERENCES revisiones (id),
  desde timestamptz NOT NULL DEFAULT now(),
  hasta timestamptz,
  apelacion text CHECK (char_length(apelacion) <= 1000),
  apelada timestamptz,
  apelacion_estado text CHECK (apelacion_estado IN ('pendiente', 'aceptada', 'rechazada')),
  levantada boolean NOT NULL DEFAULT false
);
CREATE INDEX sanciones_jugador ON sanciones (jugador, desde DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tacazo_moderacion') THEN
    CREATE ROLE tacazo_moderacion NOLOGIN NOBYPASSRLS;
  END IF;
  EXECUTE format('GRANT tacazo_moderacion TO %I', current_user);
END
$$;

ALTER TABLE revisiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE reportes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanciones ENABLE ROW LEVEL SECURITY;

-- Jugadores: reportan partidas en las que jugaron, ven sus propias sanciones
-- y las apelan una vez. No ven revisiones ni reportes de otros.
GRANT INSERT (autor, reportado, partida, motivo, detalle) ON reportes TO tacazo_api;
GRANT SELECT ON reportes TO tacazo_api;
CREATE POLICY reportes_propios ON reportes FOR SELECT TO tacazo_api USING (autor = jugador_actual());
CREATE POLICY reportes_crear ON reportes FOR INSERT TO tacazo_api WITH CHECK (
  autor = jugador_actual()
  AND EXISTS (
    SELECT 1 FROM partidas p
    WHERE p.id = partida
      AND autor IN (p.jugador_a, p.jugador_b)
      AND reportado IN (p.jugador_a, p.jugador_b)
  )
);

GRANT SELECT ON sanciones TO tacazo_api;
GRANT UPDATE (apelacion, apelada, apelacion_estado) ON sanciones TO tacazo_api;
CREATE POLICY sanciones_propias ON sanciones FOR SELECT TO tacazo_api USING (jugador = jugador_actual());
-- La fila vieja debe estar sin apelar y con menos de 14 días.
CREATE POLICY sanciones_apelar ON sanciones FOR UPDATE TO tacazo_api
  USING (jugador = jugador_actual() AND apelacion_estado IS NULL AND desde > now() - interval '14 days')
  WITH CHECK (jugador = jugador_actual() AND apelacion_estado = 'pendiente');

-- Servidor de partidas: necesita saber si alguien está sancionado.
GRANT SELECT ON sanciones TO tacazo_partidas;
CREATE POLICY sanciones_partidas ON sanciones FOR SELECT TO tacazo_partidas USING (true);

-- Moderación y trabajo nocturno de señales.
GRANT SELECT ON jugadores, partidas, ratings TO tacazo_moderacion;
CREATE POLICY jugadores_moderacion ON jugadores FOR SELECT TO tacazo_moderacion USING (true);
CREATE POLICY partidas_moderacion ON partidas FOR SELECT TO tacazo_moderacion USING (true);
CREATE POLICY ratings_moderacion ON ratings FOR SELECT TO tacazo_moderacion USING (true);
GRANT SELECT, INSERT, UPDATE ON revisiones, sanciones TO tacazo_moderacion;
GRANT SELECT ON reportes TO tacazo_moderacion;
CREATE POLICY revisiones_moderacion ON revisiones FOR ALL TO tacazo_moderacion USING (true) WITH CHECK (true);
CREATE POLICY sanciones_moderacion ON sanciones FOR ALL TO tacazo_moderacion USING (true) WITH CHECK (true);
CREATE POLICY reportes_moderacion ON reportes FOR SELECT TO tacazo_moderacion USING (true);
GRANT EXECUTE ON FUNCTION jugador_actual() TO tacazo_moderacion;
