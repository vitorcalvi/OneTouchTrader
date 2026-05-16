const isProduction = process.env.NODE_ENV === "production";

const GENERIC_ERROR_MESSAGES = {
  default: "An unexpected error occurred. Please try again later.",
  auth: "Authentication failed. Please check your credentials.",
  payment: "Payment processing failed. Please try again.",
  validation: "Invalid request. Please check your input.",
};

function sanitizeError(error, context = "default") {
  const errorInfo = {
    message: isProduction
      ? GENERIC_ERROR_MESSAGES[context] || GENERIC_ERROR_MESSAGES.default
      : error?.message || "Unknown error",
    timestamp: new Date().toISOString(),
  };

  if (!isProduction && error?.stack) {
    errorInfo.stack = error.stack;
  }

  return errorInfo;
}

function sanitizeErrorResponse(error, context = "default") {
  return {
    success: false,
    error: sanitizeError(error, context).message,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  sanitizeError,
  sanitizeErrorResponse,
  GENERIC_ERROR_MESSAGES,
  isProduction,
};
