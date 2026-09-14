import { useState, type ChangeEvent, type FormEvent } from "react";
import { SEASON_INFO, SEASONS, SHOE_TYPES, TYPE_LABELS, type Season, type ShoeDraft } from "../types";
import { compressPhoto } from "../photo";
import { ShoePlaceholder } from "./ShoePlaceholder";

interface ShoeFormProps {
  initial: ShoeDraft;
  title: string;
  onCancel: () => void;
  onSave: (draft: ShoeDraft) => void;
}

export function ShoeForm({ initial, title, onCancel, onSave }: ShoeFormProps) {
  const [draft, setDraft] = useState<ShoeDraft>(initial);
  const [compressing, setCompressing] = useState(false);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setCompressing(true);
    try {
      const photo = await compressPhoto(file);
      setDraft((current) => ({ ...current, photo }));
    } finally {
      setCompressing(false);
    }
  }

  function toggleSeason(season: Season) {
    setDraft((current) => {
      const has = current.seasons.includes(season);
      return {
        ...current,
        seasons: has ? current.seasons.filter((item) => item !== season) : [...current.seasons, season],
      };
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    onSave({ ...draft, name: draft.name.trim() });
  }

  return (
    <section className="screen">
      <form className="screen-inner form" onSubmit={onSubmit}>
        <div className="nav-row">
          <button type="button" className="ghost" onClick={onCancel}>
            Отмена
          </button>
          <button type="submit" className="primary" disabled={compressing || !draft.name.trim()}>
            Сохранить
          </button>
        </div>
        <h2 className="display">{title}</h2>
        <div className="hero-photo">{draft.photo ? <img src={draft.photo} alt="" /> : <ShoePlaceholder />}</div>
        <div className="photo-pick">
          <label>
            Камера
            <input type="file" accept="image/*" capture="environment" onChange={onFile} />
          </label>
          <label>
            Галерея
            <input type="file" accept="image/*" onChange={onFile} />
          </label>
        </div>
        <label>
          Название
          <input
            className="field"
            required
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="Белые кеды, зимние ботинки…"
          />
        </label>
        <label>
          Бренд
          <input
            className="field"
            value={draft.brand}
            onChange={(event) => setDraft({ ...draft, brand: event.target.value })}
            placeholder="Необязательно"
          />
        </label>
        <label>
          Размер EUR
          <input
            className="field"
            inputMode="decimal"
            value={draft.size}
            onChange={(event) => setDraft({ ...draft, size: event.target.value })}
            placeholder="37, 38.5…"
          />
        </label>
        <label>
          Тип
          <select
            className="field"
            value={draft.type}
            onChange={(event) =>
              setDraft({ ...draft, type: event.target.value as ShoeDraft["type"] })
            }
          >
            {SHOE_TYPES.map((type) => (
              <option value={type} key={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Цвет
          <input
            className="field"
            value={draft.color}
            onChange={(event) => setDraft({ ...draft, color: event.target.value })}
            placeholder="Чёрный, бежевый…"
          />
        </label>
        <label>
          Сезоны
          <div className="season-pick">
            {SEASONS.map((season) => (
              <button
                type="button"
                className={`chip ${season} ${draft.seasons.includes(season) ? "active" : ""}`}
                onClick={() => toggleSeason(season)}
                key={season}
              >
                {SEASON_INFO[season].label}
              </button>
            ))}
          </div>
        </label>
        <label>
          Описание
          <textarea
            className="field"
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            placeholder="С чем носите, удобство, где покупали"
          />
        </label>
      </form>
    </section>
  );
}
