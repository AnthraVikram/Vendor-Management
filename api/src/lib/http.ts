export class HttpError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string>;
  extra?: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    options?: {
      code?: string;
      fields?: Record<string, string>;
      extra?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = options?.code;
    this.fields = options?.fields;
    this.extra = options?.extra;
  }
}
