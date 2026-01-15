import { IsUUID, IsOptional, IsBoolean } from 'class-validator';

export class GetSprintStatusDto {
  @IsUUID()
  sprintId!: string;

  @IsOptional()
  @IsBoolean()
  compact?: boolean;
}
