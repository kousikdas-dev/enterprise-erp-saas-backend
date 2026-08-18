import { ApiProperty } from '@nestjs/swagger';

export class RbacTestDto {
  @ApiProperty({ example: true })
  authorized!: true;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  tenantId!: string;
}
