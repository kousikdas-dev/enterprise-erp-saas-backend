import { ApiProperty } from '@nestjs/swagger';

export class PermissionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'users' })
  resource!: string;

  @ApiProperty({ example: 'read' })
  action!: string;

  @ApiProperty({ example: 'users.read' })
  key!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;
}

export class PermissionListDto {
  @ApiProperty({ type: [PermissionDto] })
  items!: PermissionDto[];
}
