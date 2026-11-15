import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { DevTokenRequestDto, DevTokenResponse } from './dev-token.dto';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Development only: returns a signed access token for any `sub`. */
  @Public()
  @Post('token')
  @HttpCode(200)
  token(@Body() dto: DevTokenRequestDto): Promise<DevTokenResponse> {
    return this.auth.issueDevToken(dto.sub);
  }
}
