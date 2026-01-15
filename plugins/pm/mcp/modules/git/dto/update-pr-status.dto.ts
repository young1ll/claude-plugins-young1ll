import { IsInt, IsEnum, IsOptional, IsDateString, Min } from 'class-validator';

export class UpdatePRStatusDto {
  @IsInt()
  @Min(1)
  id!: number;

  @IsEnum(['open', 'merged', 'closed'])
  status!: 'open' | 'merged' | 'closed';

  @IsOptional()
  @IsDateString()
  mergedAt?: string;
}
