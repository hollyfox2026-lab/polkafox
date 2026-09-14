import { SEASON_INFO, TYPE_LABELS, type SeasonFilter, type Shoe } from "../types";
import { currentSeason } from "../types";
import { ShoePlaceholder } from "./ShoePlaceholder";

interface EmptyStateProps {
  hasCollection: boolean;
  season: SeasonFilter;
  onAdd: () => void;
}

export function EmptyState({ hasCollection, season, onAdd }: EmptyStateProps) {
  const now = currentSeason();
  return (
    <section className="empty">
      <ShoePlaceholder />
      <h2>{hasCollection ? "Ничего не найдено" : "Полка ещё пустая"}</h2>
      <p>
        {hasCollection
          ? "Смените сезон или запрос — карточка может быть в другом разделе."
          : `Добавьте первую пару: фото, размер и сезон. Сейчас ${SEASON_INFO[now].label.toLowerCase()} — ${SEASON_INFO[now].hint.toLowerCase()}.`}
      </p>
      {season === "all" || !hasCollection ? (
        <p className="install-hint">
          На iPhone удалите старый значок Полки и добавьте вкладку из Safari снова — откроется та же полка с фото.
        </p>
      ) : null}
      {hasCollection ? null : (
        <div className="actions">
          <button className="primary" onClick={onAdd}>
            Добавить пару
          </button>
        </div>
      )}
    </section>
  );
}

export function ShoeCard({ shoe, onOpen }: { shoe: Shoe; onOpen: () => void }) {
  return (
    <button className="card" onClick={onOpen}>
      <div className="photo">
        {shoe.photo ? <img src={shoe.photo} alt="" /> : <ShoePlaceholder />}
        <div className="mini-seasons">
          {shoe.seasons.map((season) => (
            <span className={`dot ${season}`} key={season} />
          ))}
        </div>
      </div>
      <div className="card-body">
        <div className="card-name">{shoe.name}</div>
        <div className="card-meta">
          <span>{shoe.size ? `EUR ${shoe.size}` : TYPE_LABELS[shoe.type]}</span>
          <span>{shoe.brand || TYPE_LABELS[shoe.type]}</span>
        </div>
      </div>
    </button>
  );
}
