import { SEASON_INFO, TYPE_LABELS, type Shoe } from "../types";
import { ShoePlaceholder } from "./ShoePlaceholder";

interface ShoeDetailProps {
  shoe: Shoe;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ShoeDetail({ shoe, onBack, onEdit, onDelete }: ShoeDetailProps) {
  const lead = [shoe.brand, TYPE_LABELS[shoe.type], shoe.color].filter(Boolean).join(" · ");
  return (
    <section className="screen">
      <div className="screen-inner detail">
        <div className="nav-row">
          <button className="ghost" onClick={onBack}>
            К полке
          </button>
          <button className="danger" onClick={onDelete}>
            Удалить
          </button>
        </div>
        <div className="hero-photo">
          {shoe.photo ? (
            <img src={shoe.photo} alt={shoe.name} referrerPolicy="no-referrer" />
          ) : (
            <ShoePlaceholder />
          )}
        </div>
        <h2 className="display">{shoe.name}</h2>
        <p className="lead">{lead}</p>
        <div className="facts">
          <div className="fact">
            <span>Размер</span>
            {shoe.size ? `EUR ${shoe.size}` : "не указан"}
          </div>
          <div className="fact">
            <span>Тип</span>
            {TYPE_LABELS[shoe.type]}
          </div>
          <div className="fact">
            <span>Сезоны</span>
            {shoe.seasons.length
              ? shoe.seasons.map((season) => SEASON_INFO[season].label).join(", ")
              : "не заданы"}
          </div>
          <div className="fact">
            <span>Цвет</span>
            {shoe.color || "не указан"}
          </div>
        </div>
        {shoe.description ? <div className="notes">{shoe.description}</div> : null}
        <div className="actions">
          <button className="primary" onClick={onEdit}>
            Изменить карточку
          </button>
        </div>
      </div>
    </section>
  );
}
