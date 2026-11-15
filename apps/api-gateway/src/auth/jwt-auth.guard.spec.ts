import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

function context(authorization?: string) {
  const setHeader = jest.fn();
  const ctx = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ headers: authorization ? { authorization } : {} }),
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  return { ctx, setHeader };
}

describe('JwtAuthGuard', () => {
  const verifyAsync = jest.fn<Promise<Record<string, unknown>>, [string]>();
  const getAllAndOverride = jest.fn<boolean | undefined, []>();
  const guard = new JwtAuthGuard(
    { verifyAsync } as unknown as JwtService,
    { getAllAndOverride } as unknown as Reflector,
  );

  beforeEach(() => {
    verifyAsync.mockReset();
    getAllAndOverride.mockReset().mockReturnValue(undefined);
  });

  it('lets @Public() routes through without looking at the token', async () => {
    getAllAndOverride.mockReturnValue(true);
    await expect(guard.canActivate(context().ctx)).resolves.toBe(true);
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('allows a verified token that names a subject', async () => {
    verifyAsync.mockResolvedValue({ sub: 'c-42' });
    await expect(guard.canActivate(context('Bearer abc.def.ghi').ctx)).resolves.toBe(true);
    expect(verifyAsync).toHaveBeenCalledWith('abc.def.ghi');
  });

  it('rejects a missing token with 401 and WWW-Authenticate: Bearer', async () => {
    const { ctx, setHeader } = context();
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer');
  });

  it('rejects a non-bearer scheme', async () => {
    await expect(guard.canActivate(context('Basic dXNlcjpwdw==').ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects a token that fails verification with error="invalid_token"', async () => {
    verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const { ctx, setHeader } = context('Bearer expired');
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer error="invalid_token"');
  });

  it('rejects a valid signature without a subject', async () => {
    verifyAsync.mockResolvedValue({ iss: 'shopflow-gateway' });
    await expect(guard.canActivate(context('Bearer nosub').ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
