import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EnvironmentVariables } from '../config/env.validation';
import { DevTokenResponse } from './dev-token.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /**
   * Local stand-in for an identity provider (Keycloak, Entra ID, Auth0) so the API can be
   * demoed and tested. Outside development it does not exist: 404, not 403, so it does not
   * even advertise itself.
   */
  async issueDevToken(sub: string): Promise<DevTokenResponse> {
    if (this.config.get('NODE_ENV', { infer: true }) !== 'development') {
      throw new NotFoundException();
    }
    // iss, aud, exp and the HS256 algorithm come from JwtModule's signOptions.
    const accessToken = await this.jwt.signAsync({ sub });
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.config.get('JWT_TTL_SECONDS', { infer: true }),
    };
  }
}
