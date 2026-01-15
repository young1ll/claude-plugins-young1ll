import { IsUUID, IsString, IsInt, IsOptional, Min, Max } from 'class-validator';

export class ListCommitsDto {
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 50;
}
