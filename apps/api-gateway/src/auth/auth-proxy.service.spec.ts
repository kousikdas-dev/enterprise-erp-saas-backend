import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosError } from 'axios';
import { AuthProxyService } from './auth-proxy.service';
import { DownstreamRegistry } from '../downstream/downstream.registry';

describe('AuthProxyService', () => {
  const identityUrl = 'http://localhost:3001';
  const dto = {
    tenantCode: 'DEMO',
    email: 'admin@demo.local',
    password: 'DevPassword123!',
  };

  function createService(http: { post: jest.Mock }): AuthProxyService {
    const downstream = {
      getUrl: jest.fn().mockReturnValue(identityUrl),
    } as unknown as DownstreamRegistry;
    return new AuthProxyService(http as unknown as HttpService, downstream);
  }

  it('forwards login to Identity and returns tokens', async () => {
    const post = jest.fn().mockReturnValue(
      of({
        data: {
          success: true,
          statusCode: 201,
          data: {
            accessToken: 'access.jwt',
            refreshToken: 'refresh-raw',
            expiresIn: 900,
          },
        },
      }),
    );
    const service = createService({ post });

    const result = await service.login(dto);

    expect(post).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/auth/login',
      {
        tenantCode: 'DEMO',
        email: 'admin@demo.local',
        password: 'DevPassword123!',
      },
    );
    expect(result).toEqual({
      accessToken: 'access.jwt',
      refreshToken: 'refresh-raw',
      expiresIn: 900,
    });
  });

  it('maps Identity 401 to Invalid credentials', async () => {
    const axiosError = new AxiosError('Request failed');
    axiosError.response = {
      status: 401,
      data: { message: 'Invalid credentials' },
      statusText: 'Unauthorized',
      headers: {},
      config: { headers: {} as never },
    };
    const post = jest.fn().mockReturnValue(throwError(() => axiosError));
    const service = createService({ post });

    await expect(service.login(dto)).rejects.toThrow('Invalid credentials');
  });
});
