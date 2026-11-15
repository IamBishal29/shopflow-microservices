import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'auth:isPublic';

/**
 * Opts a controller or route out of the global JWT guard (health probes, the dev token
 * endpoint). Everything without it requires a token: forgetting it fails closed.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);
