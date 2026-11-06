import type { AuthConfig } from '@api-sentinel/shared';
import { AppError } from '../../errors/AppError';

const LINE_BREAK_OR_NUL = /[\r\n\0]/;

/**
 * Builds the value of the Authorization header for the chosen auth type.
 * Returns undefined for "No Auth". Messages never contain the secret itself.
 */
export function authorizationHeaderFor(auth: AuthConfig): string | undefined {
  switch (auth.type) {
    case 'none':
      return undefined;

    case 'bearer': {
      const token = auth.token.trim();
      if (token === '') {
        throw new AppError('VALIDATION_ERROR', 'Bearer token is empty.', 400);
      }
      if (LINE_BREAK_OR_NUL.test(token)) {
        throw new AppError('VALIDATION_ERROR', 'Bearer token contains invalid characters.', 400);
      }
      return `Bearer ${token}`;
    }

    case 'basic': {
      // RFC 7617: the user name must not contain a colon (it separates user and password).
      if (auth.username.includes(':')) {
        throw new AppError('VALIDATION_ERROR', 'Basic auth username must not contain ":".', 400);
      }
      const credentials = Buffer.from(`${auth.username}:${auth.password}`, 'utf8');
      return `Basic ${credentials.toString('base64')}`;
    }
  }
}
