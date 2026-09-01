import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListUsersQueryDto {
  /** Case-insensitive role name filter (e.g. 'Salesperson'). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  role?: string;
}
