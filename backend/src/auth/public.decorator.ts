import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without a token.
 *
 * The JWT guard is registered globally, so every route is protected unless it
 * opts out here. Adding a route therefore protects it by default; forgetting
 * this decorator fails closed rather than leaving an endpoint open.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
