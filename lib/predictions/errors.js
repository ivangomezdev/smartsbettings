export class PredictionFoundationError extends Error {
  constructor(message, { code, status = 500, retryable = false, details = null } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code || "PREDICTION_FOUNDATION_ERROR";
    this.status = status;
    this.retryable = retryable;
    this.details = details;
  }
}

export class PredictionValidationError extends PredictionFoundationError {
  constructor(message, details = null) {
    super(message, { code: "INVALID_PREDICTION_REQUEST", status: 400, details });
  }
}

export class SportsApiConfigurationError extends PredictionFoundationError {
  constructor() {
    super("API-Football no está configurada.", {
      code: "SPORTS_API_NOT_CONFIGURED",
      status: 503,
    });
  }
}

export class SportsApiAuthenticationError extends PredictionFoundationError {
  constructor() {
    super("No fue posible autenticar la fuente de datos deportivos.", {
      code: "SPORTS_API_AUTHENTICATION_FAILED",
      status: 503,
    });
  }
}

export class SportsApiQuotaError extends PredictionFoundationError {
  constructor(message = "La cuota de datos deportivos está temporalmente agotada.", details = null) {
    super(message, {
      code: "SPORTS_API_QUOTA_EXCEEDED",
      status: 429,
      retryable: true,
      details,
    });
  }
}

export class SportsApiPlanRestrictionError extends PredictionFoundationError {
  constructor() {
    super("El plan de API-Football no permite consultar la temporada o recurso solicitado.", {
      code: "SPORTS_API_PLAN_RESTRICTION",
      status: 503,
    });
  }
}

export class SportsApiTimeoutError extends PredictionFoundationError {
  constructor() {
    super("La fuente de datos deportivos tardó demasiado en responder.", {
      code: "SPORTS_API_TIMEOUT",
      status: 503,
      retryable: true,
    });
  }
}

export class SportsApiUnavailableError extends PredictionFoundationError {
  constructor() {
    super("La fuente de datos deportivos no está disponible temporalmente.", {
      code: "SPORTS_API_UNAVAILABLE",
      status: 503,
      retryable: true,
    });
  }
}

export class SportsApiResponseError extends PredictionFoundationError {
  constructor(details = null) {
    super("La fuente de datos deportivos devolvió una respuesta inválida.", {
      code: "SPORTS_API_INVALID_RESPONSE",
      status: 502,
      retryable: true,
      details,
    });
  }
}

class TheSportsDbError extends PredictionFoundationError {
  constructor(message, { code, status = 503, retryable = false, details = null } = {}) {
    super(message, { code, status, retryable, details });
  }
}

export class TheSportsDbConfigurationError extends TheSportsDbError {
  constructor() {
    super("TheSportsDB no está configurado.", { code: "THESPORTSDB_NOT_CONFIGURED" });
  }
}

export class TheSportsDbAuthenticationError extends TheSportsDbError {
  constructor() {
    super("No fue posible autenticar TheSportsDB.", { code: "THESPORTSDB_AUTH_ERROR" });
  }
}

export class TheSportsDbRateLimitError extends TheSportsDbError {
  constructor(details = null) {
    super("TheSportsDB alcanzó temporalmente su límite de solicitudes.", {
      code: "THESPORTSDB_RATE_LIMIT",
      status: 429,
      retryable: true,
      details,
    });
  }
}

export class TheSportsDbTimeoutError extends TheSportsDbError {
  constructor() {
    super("TheSportsDB tardó demasiado en responder.", {
      code: "THESPORTSDB_TIMEOUT",
      retryable: true,
    });
  }
}

export class TheSportsDbResponseError extends TheSportsDbError {
  constructor(details = null) {
    super("TheSportsDB devolvió una respuesta inválida.", {
      code: "THESPORTSDB_INVALID_RESPONSE",
      status: 502,
      retryable: true,
      details,
    });
  }
}

export class TheSportsDbEventNotFoundError extends TheSportsDbError {
  constructor(details = null) {
    super("No se encontró el evento solicitado en TheSportsDB.", {
      code: "THESPORTSDB_EVENT_NOT_FOUND",
      status: 404,
      details,
    });
  }
}

export class SportsCacheBusyError extends PredictionFoundationError {
  constructor() {
    super("Los datos deportivos se están actualizando. Inténtalo de nuevo en unos segundos.", {
      code: "SPORTS_CACHE_BUSY",
      status: 503,
      retryable: true,
    });
  }
}

export function toPublicPredictionError(error) {
  if (error instanceof PredictionFoundationError) {
    return {
      error: error.message,
      code: error.code,
      retryable: error.retryable,
    };
  }

  return {
    error: "No pudimos completar la solicitud de datos deportivos.",
    code: "PREDICTION_FOUNDATION_ERROR",
    retryable: false,
  };
}
