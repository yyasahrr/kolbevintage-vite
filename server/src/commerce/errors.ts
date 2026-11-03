/** A commerce failure with an HTTP status and a stable machine-readable code. */
export class CommerceError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(message: string, statusCode = 400, code = "commerce_error", details?: unknown) {
    super(message);
    this.name = "CommerceError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (message = "مورد پیدا نشد.") => new CommerceError(message, 404, "not_found");
export const unauthorized = (message = "برای این عملیات باید وارد شوی.") =>
  new CommerceError(message, 401, "unauthorized");
export const forbidden = (message = "دسترسی مجاز نیست.") => new CommerceError(message, 403, "forbidden");
export const conflict = (message: string, code = "conflict") => new CommerceError(message, 409, code);
