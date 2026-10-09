import { URL } from "node:url";
import { connect, isReady, users, trips, toId, mapTrip } from "./db.js";
import { createApp, readJson, sendEmpty, sendJson, serveStatic } from "./http.js";
import { getUserFromRequest, hashPassword, signToken, verifyPassword } from "./middleware/auth.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
function usernameQuery(username) { return new RegExp("^" + username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"); }
function requireUser(req, res) { const user = getUserFromRequest(req); if (!user) { sendJson(res, 401, { error: "No autenticado" }); return null; } return user; }
function dayKey(date = new Date()) { return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10); }

const server = createApp(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname, searchParams } = url;
  const method = req.method || "GET";
  if (pathname === "/health") return sendJson(res, 200, { ok: true, db: isReady() });
  if (pathname.startsWith("/api/") && !isReady()) return sendJson(res, 503, { error: "Base no lista" });
  if (!pathname.startsWith("/api/")) return serveStatic(req, res);

  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!USERNAME_RE.test(username)) return sendJson(res, 400, { error: "Usuario: 3-20 caracteres, letras, numeros y _" });
    if (password.length < 6) return sendJson(res, 400, { error: "La contrasena debe tener al menos 6 caracteres" });
    if (await users().findOne({ username: usernameQuery(username) })) return sendJson(res, 409, { error: "Ese usuario ya existe" });
    const result = await users().insertOne({ username, passwordHash: hashPassword(password), createdAt: new Date() });
    const user = { id: String(result.insertedId), username };
    return sendJson(res, 201, { user, token: signToken(user) });
  }
  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const row = await users().findOne({ username: usernameQuery(username) });
    if (!row || !verifyPassword(String(body.password || ""), row.passwordHash)) return sendJson(res, 401, { error: "Usuario o contrasena incorrectos" });
    const user = { id: String(row._id), username: row.username };
    return sendJson(res, 200, { user, token: signToken(user) });
  }
  if (method === "GET" && pathname === "/api/auth/me") {
    const user = requireUser(req, res);
    if (!user) return;
    const row = await users().findOne({ _id: toId(user.id) });
    if (!row) return sendJson(res, 401, { error: "Usuario no encontrado" });
    return sendJson(res, 200, { user: { id: String(row._id), username: row.username } });
  }

  const user = requireUser(req, res);
  if (!user) return;
  const userId = user.id;

  if (method === "GET" && pathname === "/api/trips") {
    const q = String(searchParams.get("q") || "").trim();
    const query = { userId };
    if (q) {
      const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      query.$or = [{ place: rx }, { notes: rx }];
    }
    const rows = await trips().find(query).sort({ day: -1 }).limit(100).toArray();
    return sendJson(res, 200, { trips: rows.map(mapTrip), count: rows.length });
  }
  if (method === "POST" && pathname === "/api/trips") {
    const body = await readJson(req);
    const place = String(body.place || "").trim();
    if (!place) return sendJson(res, 400, { error: "El lugar es obligatorio" });
    const result = await trips().insertOne({ userId, day: /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : dayKey(), place: place.slice(0, 80), notes: String(body.notes || "").slice(0, 1000), createdAt: new Date() });
    return sendJson(res, 201, { trip: mapTrip(await trips().findOne({ _id: result.insertedId })) });
  }
  const match = pathname.match(/^\/api\/trips\/([a-fA-F0-9]{24})$/);
  if (match) {
    const id = toId(match[1]);
    const existing = await trips().findOne({ _id: id, userId });
    if (!existing) return sendJson(res, 404, { error: "Viaje no encontrado" });
    if (method === "PUT") {
      const body = await readJson(req);
      const place = String(body.place || existing.place).trim().slice(0, 80);
      if (!place) return sendJson(res, 400, { error: "El lugar es obligatorio" });
      await trips().updateOne({ _id: id, userId }, { $set: { day: /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : existing.day, place, notes: String(body.notes || "").slice(0, 1000) } });
      return sendJson(res, 200, { trip: mapTrip(await trips().findOne({ _id: id })) });
    }
    if (method === "DELETE") {
      await trips().deleteOne({ _id: id, userId });
      return sendEmpty(res, 204);
    }
  }
  sendJson(res, 404, { error: "Ruta no encontrada" });
});

server.listen(PORT, HOST, () => console.log(`Viajes en http://${HOST}:${PORT}`));
async function bootDb() { for (;;) { try { await connect(); return; } catch (err) { console.error("Mongo no disponible:", err.message); await new Promise((resolve) => setTimeout(resolve, 5000)); } } }
bootDb();
