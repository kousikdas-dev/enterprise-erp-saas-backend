import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthProxyService } from './auth-proxy.service';
import { LoginDto } from './dto/login.dto';
import { LoginDataDto, LoginSuccessDto } from './dto/login-response.dto';

@ApiTags('Authentication')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authProxy: AuthProxyService) {}

  @Post('login')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Login',
    description:
      'Forwards credentials to the Identity Service. Does not require a JWT.',
  })
  @ApiCreatedResponse({
    description: 'Login succeeded',
    type: LoginSuccessDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  login(@Body() dto: LoginDto): Promise<LoginDataDto> {
    return this.authProxy.login(dto);
  }
}
