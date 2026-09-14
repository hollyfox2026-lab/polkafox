import type { DeviceAuthRequest } from "../yandex/device";

interface DeviceLoginProps {
  request: DeviceAuthRequest;
  onOpenYandex: () => void;
  onCancel: () => void;
}

export function DeviceLogin({ request, onOpenYandex, onCancel }: DeviceLoginProps) {
  return (
    <div className="device-login" role="dialog" aria-label="Вход в Яндекс Диск">
      <div className="device-login-card">
        <p className="device-login-kicker">Вход в этом окне</p>
        <h2>Код для Яндекса</h2>
        <p className="device-login-code">{request.userCode || "—"}</p>
        <p>
          Откройте страницу Яндекса, введите код, затем вернитесь сюда. Токен останется в этом окне,
          и полка подтянется с Диска.
        </p>
        <div className="actions">
          <button type="button" className="primary" onClick={onOpenYandex}>
            Открыть Яндекс
          </button>
          <button type="button" className="ghost" onClick={onCancel}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
