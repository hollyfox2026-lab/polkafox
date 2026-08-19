const form = document.querySelector("#sighting-form");
const list = document.querySelector("#sightings");
const empty = document.querySelector("#empty");
const message = document.querySelector("#form-message");
const refreshBtn = document.querySelector("#refresh");

function setMessage(text, kind) {
  message.textContent = text;
  message.className = "form-message" + (kind ? " " + kind : "");
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function render(foxes) {
  list.innerHTML = "";
  empty.hidden = foxes.length > 0;
  for (const fox of foxes) {
    const li = document.createElement("li");
    li.className = "sighting";
    li.innerHTML = `
      <div class="sighting-top">
        <span class="sighting-name"></span>
        <span class="sighting-loc"></span>
      </div>
      <p class="sighting-note"></p>
      <span class="sighting-time"></span>
    `;
    li.querySelector(".sighting-name").textContent = fox.name;
    li.querySelector(".sighting-loc").textContent = fox.location;
    const note = li.querySelector(".sighting-note");
    if (fox.note) {
      note.textContent = fox.note;
    } else {
      note.remove();
    }
    li.querySelector(".sighting-time").textContent = "Seen " + formatTime(fox.seenAt);
    list.appendChild(li);
  }
}

async function loadFoxes() {
  try {
    const res = await fetch("/api/foxes");
    if (!res.ok) throw new Error("Request failed: " + res.status);
    const data = await res.json();
    render(data.foxes);
  } catch (err) {
    setMessage("Could not load sightings: " + err.message, "err");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    name: form.name.value,
    location: form.location.value,
    note: form.note.value,
  };

  try {
    const res = await fetch("/api/foxes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      const detail = data.errors
        ? data.errors.map((e) => e.message).join(" ")
        : data.error || "Unknown error.";
      setMessage(detail, "err");
      return;
    }
    setMessage(`Logged ${data.fox.name} at ${data.fox.location}.`, "ok");
    form.reset();
    await loadFoxes();
  } catch (err) {
    setMessage("Could not save sighting: " + err.message, "err");
  }
});

refreshBtn.addEventListener("click", loadFoxes);

loadFoxes();
