// Pruebas del buscador de secretos: node --test "scripts/*.test.mjs"
import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPublicEnv, findSecrets, isForbiddenFile } from "./check-secrets.mjs";

const fake = (...parts) => parts.join(""); // así este archivo no se marca a sí mismo

test("detecta formatos de claves conocidos", () => {
  assert.equal(findSecrets(`token = ${fake("ghp_", "a".repeat(36))}`)[0].kind, "Token de GitHub");
  assert.equal(findSecrets(fake("AKIA", "ABCDEFGHIJKLMNOP"))[0].kind, "Clave de AWS");
  assert.equal(findSecrets(fake("-----BEGIN ", "PRIVATE KEY-----"))[0].kind, "Clave privada");
});

test("detecta asignaciones con valor real y da la línea", () => {
  const hits = findSecrets(`uno\n${fake("DB_PASS", "WORD=")}s3cretoMuyLargo123`);
  assert.deepEqual(hits, [{ line: 2, kind: "Valor de DB_PASSWORD" }]);
});

test("ignora marcadores, variables y referencias a secretos de CI", () => {
  assert.deepEqual(findSecrets(`${fake("API", "_KEY")}=changeme-por-favor`), []);
  assert.deepEqual(findSecrets(`${fake("API", "_KEY")}: \${{ secrets.API_KEY }}`), []);
  assert.deepEqual(findSecrets(`${fake("API", "_KEY")}=SUPABASE_SERVICE_ROLE`), []);
});

test("respeta el comentario de falso positivo", () => {
  assert.deepEqual(findSecrets(`${fake("ghp_", "b".repeat(36))} // secret-scan: ignore`), []);
});

test("marca archivos que nunca deben versionarse", () => {
  for (const name of [".env", ".env.local", "certs/server.pem", "id_ed25519", "service-account.json"]) {
    assert.equal(isForbiddenFile(name), true, name);
  }
  for (const name of [".env.example", "README.md", "src/key.ts"]) assert.equal(isForbiddenFile(name), false, name);
});

test("el build falla si una variable pública trae un secreto", () => {
  assert.throws(() => assertPublicEnv({ VITE_KEY: fake("sb_", "secret_", "x".repeat(24)) }), /VITE_KEY/);
  assert.doesNotThrow(() => assertPublicEnv({ VITE_URL: "https://ejemplo.supabase.co", OTRA: "no-viaja-al-navegador" }));
});
