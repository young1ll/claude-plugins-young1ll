import { IsString, IsUUID, IsOptional, MinLength, MaxLength, IsDateString } from 'class-validator';

export class CreateSprintDto {
  @IsUUID()
  projectId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  goal?: string;
}
