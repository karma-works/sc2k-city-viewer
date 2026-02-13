// Type definitions for sql.js

export interface SqlJsStatic {
  Database: new (data?: ArrayLike<number>) => Database;
}

export interface SqlJsConfig {
  locateFile?: (file: string) => string;
}

export interface Database {
  run(sql: string, params?: unknown[]): Database;
  exec(sql: string, params?: unknown[]): QueryExecResult[];
  prepare(sql: string, params?: unknown[]): Statement;
  export(): Uint8Array;
  close(): void;
}

export interface Statement {
  bind(params?: unknown[]): boolean;
  step(): boolean;
  get(params?: unknown[]): unknown[];
  getColumnNames(): string[];
  free(): boolean;
  run(params?: unknown[]): Statement;
}

export interface QueryExecResult {
  columns: string[];
  values: unknown[][];
}
