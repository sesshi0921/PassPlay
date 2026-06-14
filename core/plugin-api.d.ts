export type PassPlayPermission =
  | 'players:read'
  | 'storage:read'
  | 'storage:write'
  | 'navigation';

export type PassPlayLifecycleEvent = 'activate' | 'deactivate';

export interface PassPlayContext {
  apiVersion: '1.0';
  plugin: {
    id: string;
    name: string;
    version: string;
    permissions: PassPlayPermission[];
  };
  environment: {
    locale: string;
    standalone: boolean;
  };
}

export interface PassPlayPluginApi {
  readonly apiVersion: '1.0';
  readonly pluginId: string;
  register(initializer: (api: PassPlayPluginApi) => void | Promise<void>): Promise<void>;
  context: {
    get(): Promise<PassPlayContext>;
  };
  players: {
    list(): Promise<string[]>;
  };
  storage: {
    get<T = unknown>(key: string): Promise<T | null>;
    set(key: string, value: unknown): Promise<boolean>;
    remove(key: string): Promise<boolean>;
  };
  navigation: {
    home(): Promise<boolean>;
  };
  lifecycle: {
    on(event: PassPlayLifecycleEvent, listener: () => void): () => void;
  };
  assets: {
    url(path: string): string;
    fetchJSON<T = unknown>(path: string): Promise<T>;
  };
}

declare global {
  interface Window {
    PassPlay: PassPlayPluginApi;
  }
}
