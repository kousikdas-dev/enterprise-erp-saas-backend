import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListUsersQueryDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive role name filter, e.g. Salesperson',
    example: 'Salesperson',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  role?: string;
}
