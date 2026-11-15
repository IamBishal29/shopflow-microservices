import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { EnvironmentVariables } from '../config/env.validation';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => {
        const issuer = config.get('JWT_ISSUER', { infer: true });
        const audience = config.get('JWT_AUDIENCE', { infer: true });
        return {
          secret: config.get('JWT_SECRET', { infer: true }),
          signOptions: {
            algorithm: 'HS256',
            issuer,
            audience,
            expiresIn: config.get('JWT_TTL_SECONDS', { infer: true }),
          },
          // Pin the algorithm: never let the token's own header choose it ("alg": "none",
          // or HS256 signed with a public key in RS256 setups).
          verifyOptions: { algorithms: ['HS256'], issuer, audience },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Global: every route in the app is protected unless it opts out with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
