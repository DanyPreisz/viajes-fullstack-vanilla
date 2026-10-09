import { api, setSession, clearSession, getToken } from "./api.js";
const authView = document.querySelector("#auth-view");
const appView = document.querySelector("#app-view");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");
const authSubmit = document.querySelector("#auth-submit");
const listEl = document.querySelector("#list");
const form = document.querySelector("#trip-form");
const formError = document.querySelector("#form-error");
const cancelBtn = document.querySelector("#cancel");
let mode = "login";
let query = "";
let timer;
const showError = (el, message) => { el.hidden = !message; el.textContent = message || ""; };
function today() { return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10); }

function setMode(next) {
  mode = next;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  authSubmit.textContent = mode === "login" ? "Entrar" : "Crear cuenta";
}
function clearForm() {
  form.reset();
  document.querySelector("#trip-id").value = "";
  document.querySelector("#day").value = today();
  cancelBtn.classList.add("hidden");
}
async function refresh() {
  const data = await api(`/api/trips?q=${encodeURIComponent(query)}`);
  document.querySelector("#count").textContent = data.count;
  listEl.innerHTML = "";
  if (!data.trips.length) {
    const empty = document.createElement("li");
    empty.textContent = "No hay viajes.";
    listEl.append(empty);
    return;
  }
  data.trips.forEach((trip) => {
    const li = document.createElement("li");
    li.className = "item";
    const title = document.createElement("strong");
    title.textContent = `${trip.day} \u00b7 ${trip.place}`;
    const notes = document.createElement("p");
    notes.textContent = trip.notes;
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "ghost";
    edit.textContent = "Editar";
    edit.addEventListener("click", () => {
      document.querySelector("#trip-id").value = trip.id;
      document.querySelector("#day").value = trip.day;
      document.querySelector("#place").value = trip.place;
      document.querySelector("#notes").value = trip.notes;
      cancelBtn.classList.remove("hidden");
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "ghost";
    del.textContent = "Borrar";
    del.addEventListener("click", async () => { await api(`/api/trips/${trip.id}`, { method: "DELETE" }); await refresh(); });
    li.append(title, edit, del, notes);
    listEl.append(li);
  });
}
async function boot() {
  if (!getToken()) return;
  try {
    const { user } = await api("/api/auth/me");
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    document.querySelector("#user-name").textContent = user.username;
    document.querySelector("#day").value = today();
    await refresh();
  } catch { clearSession(); }
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(authError, "");
  const fd = new FormData(authForm);
  try {
    const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", { method: "POST", body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }) });
    setSession(data.token);
    authForm.reset();
    await boot();
  } catch (err) { showError(authError, err.message); }
});
document.querySelector("#logout").addEventListener("click", () => { clearSession(); appView.classList.add("hidden"); authView.classList.remove("hidden"); });
document.querySelector("#search").addEventListener("input", (event) => { clearTimeout(timer); timer = setTimeout(async () => { query = event.target.value.trim(); await refresh(); }, 200); });
cancelBtn.addEventListener("click", clearForm);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(formError, "");
  const id = document.querySelector("#trip-id").value;
  const payload = { day: document.querySelector("#day").value, place: document.querySelector("#place").value.trim(), notes: document.querySelector("#notes").value.trim() };
  try {
    await api(id ? `/api/trips/${id}` : "/api/trips", { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });
    clearForm();
    await refresh();
  } catch (err) { showError(formError, err.message); }
});
boot();
