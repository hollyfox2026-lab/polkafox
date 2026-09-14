/** Идентификатор OAuth-приложения Яндекса (публичный ClientID). */
export const YANDEX_CLIENT_ID = "f0970ad906314eaa83edca91ff565e3d";

/** Redirect URI, зарегистрированный в OAuth-приложении. */
export const YANDEX_REDIRECT_URI = "https://hollyfox2026-lab.github.io/polkafox/";

export const YANDEX_AUTHORIZE_URL = "https://oauth.yandex.ru/authorize";
export const YANDEX_DISK_API = "https://cloud-api.yandex.net/v1/disk";

/** Запрашиваем папку приложения; если в кабинете заданы read/write, Яндекс выдаст настроенные права. */
export const YANDEX_SCOPE = "cloud_api:disk.app_folder";

export const APP_FOLDER = "app:/polka";
export const CATALOG_NAME = "catalog.json";
export const FALLBACK_FOLDER = "disk:/Полка";

export const SESSION_STORAGE_KEY = "polka-yandex-session";
export const OAUTH_STATE_KEY = "polka-yandex-oauth-state";
