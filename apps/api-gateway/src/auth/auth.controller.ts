import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH_NAME } from '../swagger/setup-swagger';
import { AuthProxyService } from './auth-proxy.service';
import { AuthenticatedUser } from './authenticated-user';
import { CurrentUser } from './current-user.decorator';
import { AuthMeDto } from './dto/auth-me.dto';
import { LoginDto } from './dto/login.dto';
import { LoginDataDto, LoginSuccessDto } from './dto/login-response.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

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

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_AUTH_NAME)
  @ApiOperation({
    summary: 'Current authenticated user',
    description:
      'Validates the access JWT locally at the gateway and returns userId and tenantId.',
  })
  @ApiOkResponse({ type: AuthMeDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  me(@CurrentUser() user: AuthenticatedUser): AuthMeDto {
    return {
      userId: user.userId,
      tenantId: user.tenantId,
    };
  }
}
