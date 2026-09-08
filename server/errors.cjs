const MAX_PUBLIC_MESSAGE_LENGTH = 800;

class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function redactSensitiveText(value, secrets = []) {
  let text = String(value ?? '');

  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 4) {
      text = text.split(secret).join('[REDACTED]');
    }
  }

  text = text
    .replace(/\bBearer\s+[^\s,;"']+/gi, 'Bearer [REDACTED]')
    .replace(
      /\b(api[_-]?key|authorization|access[_-]?token|token)\b(\s*["']?\s*[:=]\s*["']?)[^,\s"'}]+/gi,
      '$1$2[REDACTED]',
    )
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, '[REDACTED]');

  if (text.length > MAX_PUBLIC_MESSAGE_LENGTH) {
    return `${text.slice(0, MAX_PUBLIC_MESSAGE_LENGTH)}…`;
  }

  return text;
}

function normalizeUnknownError(error, requestId) {
  if (error instanceof AppError) {
    return {
      status: error.status,
      payload: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
          requestId,
        },
      },
    };
  }

  if (error?.type === 'entity.too.large') {
    return {
      status: 413,
      payload: {
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'The request body is too large.',
          requestId,
        },
      },
    };
  }

  if (error instanceof SyntaxError && error?.type === 'entity.parse.failed') {
    return {
      status: 400,
      payload: {
        error: {
          code: 'INVALID_JSON',
          message: 'The request body is not valid JSON.',
          requestId,
        },
      },
    };
  }

  return {
    status: 500,
    payload: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The local server could not complete the request.',
        requestId,
      },
    },
  };
}

module.exports = {
  AppError,
  normalizeUnknownError,
  redactSensitiveText,
};
