export interface FormattedError {
  message: string;
  traceId?: string;
  statusCode?: number;
}

export function formatApiError(err: any): FormattedError {
  const traceId =
    err?.traceId ||
    err?.response?.headers?.['x-trace-id'] ||
    err?.response?.data?.traceId;
  const status = err?.response?.status;
  const backendMessage = err?.response?.data?.message;

  let message = 'An unexpected error occurred. Please try again.';

  if (!err.response) {
    if (err.message && err.message.toLowerCase().includes('network')) {
      message = 'Unable to reach the server. Please check your connection and try again.';
    } else if (err.code === 'ECONNABORTED') {
      message = 'Request timed out. Please check your network connection.';
    } else {
      message = 'Unable to connect to the server. Please verify your connection.';
    }
  } else if (status === 401) {
    message = 'Your session has expired or is invalid. Please log in again.';
  } else if (status === 403) {
    message = 'You do not have permission to perform this action.';
  } else if (status === 404) {
    message = backendMessage || 'The requested resource was not found.';
  } else if (status === 409) {
    message = backendMessage || 'This operation is currently being processed by another request.';
  } else if (status === 413) {
    message = 'The request payload is too large. Please reduce the input size.';
  } else if (status === 503) {
    message = backendMessage || 'Service temporarily unavailable. Please try again shortly.';
  } else if (status >= 400 && status < 500) {
    message = backendMessage || 'Invalid request. Please check the provided information.';
  } else if (status >= 500) {
    message = 'A server error occurred. Please try again later.';
  } else if (backendMessage) {
    message = backendMessage;
  }

  // Ensure raw technical tracebacks are not exposed to the user
  if (
    message.includes('Mongo') ||
    message.includes('ECONNREFUSED') ||
    message.includes('at /') ||
    message.includes('Cast to ObjectId') ||
    message.includes('JWT_SECRET')
  ) {
    message = 'A system error occurred. Please try again.';
  }

  return { message, traceId, statusCode: status };
}
