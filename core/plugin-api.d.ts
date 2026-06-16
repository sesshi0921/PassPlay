export type PassPlayPermission =
  | 'players:read'
  | 'storage:read'
  | 'storage:write'
  | 'navigation'
  | 'room:read'
  | 'room:write';

export type PassPlayLifecycleEvent = 'activate' | 'deactivate';

export interface PassPlayContext {
  apiVersion: '1.0';
  plugin: {
    id: string;
    name: string;
    version: string;
    permissions: PassPlayPermission[];
    modes?: PassPlayMode[];
  };
  environment: {
    locale: string;
    standalone: boolean;
    mode: PassPlayMode;
  };
}

export type PassPlayMode = 'single' | 'multi';

export type PassPlayTransport = 'http' | 'ws';

export interface PassPlayRoomAction<T = unknown> {
  type: string;
  payload?: T;
}

export interface PassPlayRoomPlayerPublic {
  id: string;
  name: string;
  isHost: boolean;
  isConnected: boolean;
  cardCount?: number;
  isOut?: boolean;
  finishOrder?: number | null;
  handPreview?: Array<{ slot: number; appealing: boolean }>;
}

export interface PassPlayRoomSession {
  roomId: string;
  roomLabel?: string;
  playerId: string;
  playerName: string;
  isHost: boolean;
  transport: PassPlayTransport;
  joined: boolean;
}

export interface PassPlayRoomSnapshot<TPublic = unknown, TPrivate = unknown> {
  roomId: string;
  roomLabel?: string;
  gameId: string;
  revision: number;
  phase: string;
  transport: PassPlayTransport;
  me: PassPlayRoomSession | null;
  players: PassPlayRoomPlayerPublic[];
  publicState: TPublic;
  privateState: TPrivate | null;
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
  room: {
    getApiBase(): Promise<string>;
    setApiBase(apiBase: string): Promise<string>;
    getSession(): Promise<PassPlayRoomSession | null>;
    create(options: { playerName: string; transport?: PassPlayTransport; roomLabel?: string }): Promise<PassPlayRoomSnapshot>;
    join(options: { roomId: string; playerName: string; transport?: PassPlayTransport }): Promise<PassPlayRoomSnapshot>;
    sync(): Promise<PassPlayRoomSnapshot>;
    start(): Promise<PassPlayRoomSnapshot>;
    action<T = unknown>(action: PassPlayRoomAction<T>): Promise<PassPlayRoomSnapshot>;
    leave(): Promise<boolean>;
    onStateChange(listener: (snapshot: PassPlayRoomSnapshot) => void): () => void;
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
