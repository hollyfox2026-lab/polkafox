const SEASON_LABELS = {
  all: "Всё",
  winter: "Зима",
  spring: "Весна",
  summer: "Лето",
  autumn: "Осень",
};

const form = document.querySelector("#add-form");
const gallery = document.querySelector("#gallery");
const empty = document.querySelector("#empty");
const message = document.querySelector("#form-message");
const counter = document.querySelector("#counter");
const search = document.querySelector("#search");
const seasonFilter = document.querySelector("#season-filter");
const seasonSelect = document.querySelector("#season-select");
const photoInput = document.querySelector("#photo");
const preview = document.querySelector("#preview");

let activeSeason = "all";
let searchTimer;

function setMessage(text, kind) {
  message.textContent = text;
  message.className = "form-message" + (kind ? " " + kind : "");
}

function buildSeasonControls() {
  for (const [value, label] of Object.entries(SEASON_LABELS)) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (value === activeSeason ? " active" : "");
    chip.textContent = label;
    chip.dataset.season = value;
    chip.addEventListener("click", () => {
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
  badges.appendChild(makeBadge(SEASON_LABELS[shoe.season] || shoe.season));
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
  const del = document.createElement("button");
  del.className = "delete";
  del.textContent = "Удалить";
  del.addEventListener("click", () => removeShoe(shoe.id));
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

async function removeShoe(id) {
  try {
    const res = await fetch("/api/shoes/" + id, { method: "DELETE" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    await loadShoes();
  } catch (err) {
    setMessage("Не удалось удалить: " + err.message, "err");
  }
}

photoInput.addEventListener("change", () => {
  const file = photoInput.files && photoInput.files[0];
  if (file) {
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  } else {
    preview.hidden = true;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  try {
    const res = await fetch("/api/shoes", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) {
      const detail = data.errors
        ? data.errors.map((e) => e.message).join(" ")
        : data.error || "Неизвестная ошибка.";
      setMessage(detail, "err");
      return;
    }
    setMessage("Добавлено: " + data.shoe.name, "ok");
    form.reset();
    preview.hidden = true;
    await loadShoes();
  } catch (err) {
    setMessage("Не удалось сохранить: " + err.message, "err");
  }
});

search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadShoes, 250);
});

buildSeasonControls();
loadShoes();
