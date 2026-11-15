import { Matches } from 'class-validator';

export class DevTokenRequestDto {
  /** Becomes the token's `sub` (the caller's user/customer ID). */
  @Matches(/^[A-Za-z0-9._-]{1,64}$/, {
    message: 'sub must be 1-64 letters, digits, dots, dashes or underscores',
  })
  readonly sub!: string;
}

export interface DevTokenResponse {
  readonly accessToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresIn: number;
}
