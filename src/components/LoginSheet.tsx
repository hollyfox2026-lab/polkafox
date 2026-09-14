interface LoginSheetProps {
  pasteValue: string;
  pasteError: string | null;
  onPasteValue: (value: string) => void;
  onApplyPaste: () => void;
  onYandex: () => void;
  onDeviceCode: () => void;
  onCancel: () => void;
}

export function LoginSheet({
  pasteValue,
  pasteError,
  onPasteValue,
  onApplyPaste,
  onYandex,
  onDeviceCode,
  onCancel,
}: LoginSheetProps) {
  return (
    <div className="device-login" role="dialog" aria-label="Вход в Яндекс Диск">
      <div className="device-login-card login-sheet">
        <p className="device-login-kicker">Значок на Домой</p>
        <h2>Синхронизация с Диском</h2>
        <p>
          Это отдельная копия Полки. Safari сюда сам ничего не копирует. Вставьте вход из Safari или
          войдите через Яндекс.
        </p>
        <label>
          Вход из Safari
          <textarea
            className="field"
            value={pasteValue}
            onChange={(event) => onPasteValue(event.target.value)}
            placeholder="Вставьте скопированный вход"
            rows={3}
          />
        </label>
        {pasteError ? <p className="login-sheet-error">{pasteError}</p> : null}
        <div className="login-sheet-actions">
          <button type="button" className="primary" onClick={onApplyPaste}>
            Подключить Диск
          </button>
          <button type="button" className="ghost" onClick={onYandex}>
            Войти через Яндекс
          </button>
          <button type="button" className="ghost" onClick={onDeviceCode}>
            Войти по коду
          </button>
          <button type="button" className="danger" onClick={onCancel}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
