const FALLBACK_SEASON_LABELS = {
  all: "Всё",
  winter: "Зима",
  spring: "Весна",
  summer: "Лето",
  autumn: "Осень",
};

const form = document.querySelector("#add-form");
const formTitle = document.querySelector("#form-title");
const submitBtn = document.querySelector("#submit-btn");
const cancelEdit = document.querySelector("#cancel-edit");
const gallery = document.querySelector("#gallery");
const empty = document.querySelector("#empty");
const message = document.querySelector("#form-message");
const counter = document.querySelector("#counter");
const search = document.querySelector("#search");
const seasonFilter = document.querySelector("#season-filter");
const seasonSelect = document.querySelector("#season-select");
const photoInput = document.querySelector("#photo");
const preview = document.querySelector("#preview");

let seasonLabels = { ...FALLBACK_SEASON_LABELS };
let activeSeason = "all";
let searchTimer;
let editingId = null;
let busy = false;

function setMessage(text, kind) {
  message.textContent = text;
  message.className = "form-message" + (kind ? " " + kind : "");
}

function setBusy(next) {
  busy = next;
  submitBtn.disabled = next;
  cancelEdit.disabled = next;
  form.querySelectorAll("input, select, textarea").forEach((el) => {
    el.disabled = next;
  });
}

function buildSeasonControls(seasons) {
  seasonFilter.innerHTML = "";
  seasonSelect.innerHTML = "";

  for (const value of seasons) {
    const label = seasonLabels[value] || value;

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (value === activeSeason ? " active" : "");
    chip.textContent = label;
    chip.dataset.season = value;
    chip.addEventListener("click", () => {
      if (busy) return;
      activeSeason = value;
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      loadShoes();
    });
    seasonFilter.appendChild(chip);

    if (value !== "all") {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      seasonSelect.appendChild(opt);
    }
  }
}

async function loadSeasons() {
  try {
    const res = await fetch("/api/seasons");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const seasons = Array.isArray(data.seasons) ? data.seasons : Object.keys(FALLBACK_SEASON_LABELS);
    seasonLabels = { ...FALLBACK_SEASON_LABELS };
    for (const value of seasons) {
      if (!seasonLabels[value]) seasonLabels[value] = value;
    }
    buildSeasonControls(seasons.includes("all") ? seasons : ["all", ...seasons]);
  } catch {
    buildSeasonControls(Object.keys(FALLBACK_SEASON_LABELS));
  }
}

function shoeCard(shoe) {
  const li = document.createElement("li");
  li.className = "shoe";

  const photo = document.createElement("div");
  photo.className = "shoe-photo";
  if (shoe.photoUrl) {
    const img = document.createElement("img");
    img.src = shoe.photoUrl;
    img.alt = shoe.name;
    img.loading = "lazy";
    photo.appendChild(img);
  } else {
    const ph = document.createElement("span");
    ph.className = "placeholder";
    ph.textContent = "👟";
    photo.appendChild(ph);
  }

  const body = document.createElement("div");
  body.className = "shoe-body";

  const name = document.createElement("span");
  name.className = "shoe-name";
  name.textContent = shoe.name;
  body.appendChild(name);

  if (shoe.brand) {
    const brand = document.createElement("span");
    brand.className = "shoe-brand";
    brand.textContent = shoe.brand;
    body.appendChild(brand);
  }

  const badges = document.createElement("div");
  badges.className = "badges";
  badges.appendChild(makeBadge(seasonLabels[shoe.season] || shoe.season));
  if (shoe.size) badges.appendChild(makeBadge("р. " + shoe.size));
  if (shoe.color) badges.appendChild(makeBadge(shoe.color));
  body.appendChild(badges);

  if (shoe.description) {
    const desc = document.createElement("p");
    desc.className = "shoe-desc";
    desc.textContent = shoe.description;
    body.appendChild(desc);
  }

  const actions = document.createElement("div");
  actions.className = "shoe-actions";

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "edit";
  edit.textContent = "Изменить";
  edit.addEventListener("click", () => startEdit(shoe));
  actions.appendChild(edit);

  const del = document.createElement("button");
  del.type = "button";
  del.className = "delete";
  del.textContent = "Удалить";
  del.addEventListener("click", () => removeShoe(shoe));
  actions.appendChild(del);

  body.appendChild(actions);
  li.appendChild(photo);
  li.appendChild(body);
  return li;
}

function makeBadge(text) {
  const b = document.createElement("span");
  b.className = "badge";
  b.textContent = text;
  return b;
}

function startEdit(shoe) {
  editingId = shoe.id;
  formTitle.textContent = "Изменить пару";
  submitBtn.textContent = "Сохранить";
  cancelEdit.hidden = false;
  form.name.value = shoe.name || "";
  form.brand.value = shoe.brand || "";
  if (shoe.season && shoe.season !== "all") {
    form.season.value = shoe.season;
  } else if (seasonSelect.options.length > 0) {
    form.season.selectedIndex = 0;
  }
  form.size.value = shoe.size || "";
  form.color.value = shoe.color || "";
  form.description.value = shoe.description || "";
  photoInput.value = "";
  if (shoe.photoUrl) {
    preview.src = shoe.photoUrl;
    preview.hidden = false;
  } else {
    preview.hidden = true;
  }
  setMessage("Редактирование: " + shoe.name, "");
  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function resetFormMode() {
  editingId = null;
  formTitle.textContent = "Добавить пару";
  submitBtn.textContent = "Добавить";
  cancelEdit.hidden = true;
  form.reset();
  preview.hidden = true;
}

async function loadShoes() {
  const params = new URLSearchParams();
  if (activeSeason !== "all") params.set("season", activeSeason);
  if (search.value.trim()) params.set("q", search.value.trim());
  try {
    const res = await fetch("/api/shoes?" + params.toString());
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    render(data.shoes);
  } catch (err) {
    setMessage("Не удалось загрузить список: " + err.message, "err");
  }
}

function render(shoes) {
  gallery.innerHTML = "";
  empty.hidden = shoes.length > 0;
  counter.textContent = shoes.length + " " + plural(shoes.length);
  for (const shoe of shoes) {
    gallery.appendChild(shoeCard(shoe));
  }
}

function plural(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "пара";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "пары";
  return "пар";
}

async function removeShoe(shoe) {
  if (busy) return;
  const ok = window.confirm('Удалить пару «' + shoe.name + '»?');
  if (!ok) return;
  setBusy(true);
  try {
    const res = await fetch("/api/shoes/" + shoe.id, { method: "DELETE" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    if (editingId === shoe.id) {
      resetFormMode();
      setMessage("Удалено.", "ok");
    }
    await loadShoes();
  } catch (err) {
    setMessage("Не удалось удалить: " + err.message, "err");
  } finally {
    setBusy(false);
  }
}

photoInput.addEventListener("change", () => {
  const file = photoInput.files && photoInput.files[0];
  if (file) {
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  } else if (!editingId) {
    preview.hidden = true;
  }
});

cancelEdit.addEventListener("click", () => {
  if (busy) return;
  resetFormMode();
  setMessage("", "");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  const formData = new FormData(form);
  if (editingId && (!photoInput.files || photoInput.files.length === 0)) {
    formData.delete("photo");
  }
  const url = editingId ? "/api/shoes/" + editingId : "/api/shoes";
  const method = editingId ? "PATCH" : "POST";
  setBusy(true);
  try {
    const res = await fetch(url, { method, body: formData });
    const data = await res.json();
    if (!res.ok) {
      const detail = data.errors
        ? data.errors.map((e) => e.message).join(" ")
        : data.error || "Неизвестная ошибка.";
      setMessage(detail, "err");
      return;
    }
    const verb = editingId ? "Сохранено" : "Добавлено";
    setMessage(verb + ": " + data.shoe.name, "ok");
    resetFormMode();
    await loadShoes();
  } catch (err) {
    setMessage("Не удалось сохранить: " + err.message, "err");
  } finally {
    setBusy(false);
  }
});

search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadShoes, 250);
});

await loadSeasons();
await loadShoes();
